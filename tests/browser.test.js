const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// Opt-in, dependency-free Chromium smoke test:
// PACMAN_BROWSER=chromium PACMAN_TEST_THREE=1 node --test tests/browser.test.js
// Both modes forbid external resources. Omit PACMAN_TEST_THREE to test the Canvas fallback.
const executable = process.env.PACMAN_BROWSER;
const root = path.join(__dirname, '..');

async function connect(url) {
  const socket = new WebSocket(url);
  await once(socket, 'open', { signal: AbortSignal.timeout(15000) });
  let sequence = 0;
  const pending = new Map(), errors = [], requests = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Browser debugging connection closed.'));
    }
    pending.clear();
  });
  function send(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return {
    send, errors, requests, close: () => socket.close(),
    async evaluate(expression, userGesture = false) {
      const result = await send('Runtime.evaluate', { expression, userGesture, returnByValue: true, awaitPromise: true });
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
  };
}

async function waitFor(check, message, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error(message);
}

test('browser smoke: city, player and ghost artwork, search, movement, pause, mobile layout and offline fallback', {
  skip: !executable && 'Set PACMAN_BROWSER to a Chromium executable.', timeout: 90000
}, async t => {
  let browser, client, profile;
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
      const file = path.join(root, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
      if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const content = await fs.readFile(file);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' }[path.extname(file)];
      response.writeHead(200, {
        'Content-Type': type || 'application/octet-stream',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'"
      }).end(content);
    } catch { response.writeHead(404).end(); }
  });
  t.after(async () => {
    client?.close();
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
      const exited = once(browser, 'exit');
      browser.kill();
      await exited;
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (profile) await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const preferredTemp = '/data/user/0/com.foxdebug.acode/cache/opencode';
  const temp = await fs.stat(preferredTemp).then(() => preferredTemp, () => os.tmpdir());
  profile = await fs.mkdtemp(path.join(temp, 'pacman-browser-'));
  const testThree = process.env.PACMAN_TEST_THREE === '1';
  const gpuArgs = process.env.PACMAN_BROWSER_ARGS ? JSON.parse(process.env.PACMAN_BROWSER_ARGS) :
    testThree ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] : ['--disable-gpu', '--disable-software-rasterizer'];
  browser = spawn(executable, ['--headless', '--no-sandbox', '--disable-dev-shm-usage',
    ...gpuArgs,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank']);
  let stderr = '', startupError;
  browser.stderr.on('data', chunk => { stderr += chunk; });
  browser.on('error', error => { startupError = error; });
  t.after(() => { if (t.passed === false) t.diagnostic(stderr.slice(-5000)); });
  await waitFor(() => {
    if (startupError) throw startupError;
    return /DevTools listening on (ws:\/\/\S+)/.test(stderr);
  }, 'Chromium did not start: ' + stderr);
  const debugUrl = new URL(stderr.match(/DevTools listening on (ws:\/\/\S+)/)[1]);
  t.diagnostic('Chromium started.');
  const pages = await fetch(`http://${debugUrl.host}/json/list`).then(response => response.json());
  client = await connect(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  t.diagnostic('Browser debugging connection established.');
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*', '*unpkg.com*'] });
  await client.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 1, mobile: false });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await client.send('Page.navigate', { url: `${origin}/` });
  await waitFor(() => client.evaluate("!!document.getElementById('gameCanvas')?.dataset.renderer"), 'Game did not initialize.');
  t.diagnostic('Game initialized.');
  assert.equal(await client.evaluate("import('./scripts/vendor/three.module.min.mjs').then(three => three.REVISION)"), '160',
    'the browser must load the bundled Three.js without external resources');
  if (testThree) {
    await waitFor(() => client.evaluate("document.getElementById('gameCanvas').dataset.renderer === 'three'"),
      'Local Three.js did not initialize (this opt-in check needs WebGL, not internet access).', 40000);
    assert.equal(await client.evaluate("document.querySelectorAll('.city-scene').length"), 1);
    t.diagnostic('Local Three.js city rendered with external resources blocked.');
  }

  async function checkLayout(minWidth) {
    const layout = await client.evaluate(`(() => {
      const viewport = document.getElementById('gameViewport').getBoundingClientRect();
      const surface = document.getElementById('gameCanvas').getBoundingClientRect();
      const scene = document.querySelector('.city-scene')?.getBoundingClientRect();
      const button = document.getElementById('startBtn') || document.getElementById('ovBtn');
      const action = button.getBoundingClientRect();
      const fullscreen = document.getElementById('fullscreenBtn').getBoundingClientRect();
      return { width: viewport.width, height: viewport.height,
        fits: viewport.left >= 0 && viewport.top >= 0 && viewport.right <= innerWidth + 1 && viewport.bottom <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
        ratio: surface.width / surface.height, logicalSize: [canvas.width, canvas.height],
        layersAligned: !scene || (Math.abs(scene.width - surface.width) < 1 && Math.abs(scene.height - surface.height) < 1),
        actionFits: action.left >= viewport.left && action.right <= viewport.right && action.top >= viewport.top && action.bottom <= viewport.bottom,
        controlFits: fullscreen.width >= 44 && fullscreen.height >= 44 && fullscreen.left >= 0 && fullscreen.right <= innerWidth &&
          fullscreen.top >= 0 && fullscreen.bottom <= innerHeight };
    })()`);
    assert.ok(layout.width >= minWidth, `mobile map must use available space: ${JSON.stringify(layout)}`);
    assert.equal(layout.fits, true, 'the complete map must fit without page scrolling');
    assert.ok(Math.abs(layout.ratio - 28 / 31) < 0.001, 'the map must not be stretched');
    assert.deepEqual(layout.logicalSize, [448, 496], 'resizing must not change gameplay coordinates');
    assert.equal(layout.layersAligned, true, 'WebGL scenery and Canvas actors must remain aligned');
    assert.equal(layout.actionFits, true, 'the overlay action must stay inside the map');
    assert.equal(layout.controlFits, true, 'fullscreen must be reachable with a 44px touch target');
    return layout;
  }

  // Exercise the no-API path used by iPhones and restricted embeds, including rotation.
  await client.evaluate(`for (const key of ['requestFullscreen', 'webkitRequestFullscreen']) {
    Object.defineProperty(document.getElementById('gameContainer'), key, { value: undefined, configurable: true });
  }`);
  for (const [width, height, minWidth] of [[390, 844, 370], [844, 390, 330], [320, 568, 300], [568, 320, 270]]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
    const layout = await checkLayout(minWidth);
    await client.evaluate("document.getElementById('fullscreenBtn').click()");
    assert.equal(await client.evaluate("document.getElementById('fullscreenBtn').getAttribute('aria-pressed')"), 'true');
    await checkLayout(minWidth);
    assert.equal(await client.evaluate('gameState'), 'title', 'fullscreen must not start or reset the game');
    await client.evaluate("document.getElementById('fullscreenBtn').click()");
    assert.equal(await client.evaluate("document.getElementById('gameContainer').classList.contains('is-expanded')"), false);
    t.diagnostic(`Mobile ${width}x${height}: full map ${Math.round(layout.width)}x${Math.round(layout.height)}.`);
  }
  await client.evaluate("document.getElementById('fullscreenBtn').focus()");
  for (const [key, code, keyCode, expanded] of [['Enter', 'Enter', 13, true], [' ', 'Space', 32, false]]) {
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text: key === 'Enter' ? '\r' : ' ' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    assert.equal(await client.evaluate("document.getElementById('gameContainer').classList.contains('is-expanded')"), expanded, `fullscreen keyboard activation: ${code}`);
    assert.equal(await client.evaluate('gameState'), 'title', 'focused fullscreen controls must retain native keyboard activation');
  }
  await client.evaluate(`for (const key of ['requestFullscreen', 'webkitRequestFullscreen']) {
    delete document.getElementById('gameContainer')[key];
  }`);
  await client.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 1, mobile: false });
  await client.evaluate("document.getElementById('startBtn').click()");
  await waitFor(() => client.evaluate('score > 0 && player.x > 13.5 * TILE'), 'Pac-Man did not move and collect dots.');
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'p' });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p' });
  assert.equal(await client.evaluate('gameState'), 'paused');
  const position = await client.evaluate('player.x');
  await client.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await client.evaluate('player.x'), position);

  const beforeFullscreen = await client.evaluate('JSON.stringify({ gameState, player, ghosts, maze, score, lives, level })');
  await client.evaluate("document.getElementById('fullscreenBtn').click()", true);
  await waitFor(() => client.evaluate("document.fullscreenElement === document.getElementById('gameContainer')"), 'Native fullscreen did not activate.');
  await checkLayout(680);
  await client.evaluate('document.exitFullscreen()');
  await waitFor(() => client.evaluate("!document.getElementById('gameContainer').classList.contains('is-expanded')"), 'External fullscreen exit did not restore the layout.');
  assert.equal(await client.evaluate('JSON.stringify({ gameState, player, ghosts, maze, score, lives, level })'), beforeFullscreen);
  t.diagnostic('Native fullscreen and external exit preserve the paused game.');

  const ghostSearch = await client.evaluate(`(() => {
    resetLevel(false);
    const visited = ghosts.map(() => new Set());
    let spread = 0;
    for (let frame = 0; frame < 1800; frame++) {
      if (frame % 450 === 0) {
        const [col, row] = [[13, 22], [1, 1], [26, 4], [6, 18]][frame / 450];
        Object.assign(player, { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE, dir: frame / 450 });
      }
      updateGhosts();
      ghosts.forEach((ghost, index) => {
        const col = Math.floor((ghost.x + COLS * TILE) % (COLS * TILE) / TILE), row = Math.floor(ghost.y / TILE);
        if (!maze[row]?.[col]) throw new Error(ghost.id + ' entered a wall');
        if (ghost.mode === 'chase') visited[index].add(col + ',' + row);
      });
      if (ghosts.every(ghost => ghost.mode === 'chase')) spread = Math.max(spread, new Set(ghosts.map(ghost => ghost.dir)).size);
    }
    return { ids: ghosts.map(ghost => ghost.id), visited: visited.map(cells => cells.size), spread };
  })()`);
  assert.deepEqual(ghostSearch.ids, ['blinky', 'pinky', 'inky', 'clyde']);
  assert.ok(ghostSearch.visited.every(count => count > 20), JSON.stringify(ghostSearch));
  assert.ok(ghostSearch.spread >= 3);

  const artwork = await client.evaluate(`(() => {
    const surface = document.createElement('canvas'); surface.width = surface.height = 96;
    const ctx = surface.getContext('2d'), signatures = [];
    const preview = document.createElement('canvas'); preview.width = 384; preview.height = 288;
    const previewContext = preview.getContext('2d');
    previewContext.fillStyle = '#0d1a23'; previewContext.fillRect(0, 0, preview.width, preview.height);
    for (const profile of GhostProfiles.all) {
      for (const mode of ['chase', 'frightened', 'eyes']) {
        ctx.clearRect(0, 0, 96, 96);
        const ghost = { id: profile.id, color: profile.index, x: 48, y: 48, dir: profile.index,
          mode: mode === 'frightened' ? 'chase' : mode, scared: mode === 'frightened' };
        GhostArtwork.draw(ctx, [ghost], { tile: 64, dirs: DIRS, powerTimer: 200, time: 0, reducedMotion: true });
        const pixels = ctx.getImageData(0, 0, 96, 96).data;
        if (!pixels.some(value => value > 0)) throw new Error('Invisible ' + profile.id + ': ' + mode);
        signatures.push(surface.toDataURL());
        previewContext.drawImage(surface, profile.index * 96, ['chase', 'frightened', 'eyes'].indexOf(mode) * 96);
      }
    }
    return { unique: new Set(signatures).size, count: signatures.length,
      preview: ${process.env.PACMAN_GHOST_SCREENSHOT ? 'preview.toDataURL()' : 'null'} };
  })()`);
  assert.equal(artwork.count, 12);
  assert.equal(artwork.unique, 12, 'all four skins and all three states must render distinctly');
  if (process.env.PACMAN_GHOST_SCREENSHOT) {
    await fs.writeFile(process.env.PACMAN_GHOST_SCREENSHOT, Buffer.from(artwork.preview.split(',')[1], 'base64'));
  }
  t.diagnostic('Four independent searches and all ghost artwork states verified.');

  const playerArtwork = await client.evaluate(`(() => {
    const surface = document.createElement('canvas'); surface.width = surface.height = 96;
    const ctx = surface.getContext('2d'), signatures = [];
    const preview = document.createElement('canvas'); preview.width = 384; preview.height = 240;
    const previewContext = preview.getContext('2d');
    previewContext.fillStyle = '#101b22'; previewContext.fillRect(0, 0, preview.width, preview.height);
    const before = JSON.stringify({ player, maze, ghosts, score, lives, powerTimer });
    for (const [row, powerTimer] of [0, 480].entries()) {
      for (const dir of [0, 1, 2, 3]) {
        ctx.clearRect(0, 0, 96, 96);
        ctx.fillStyle = '#123456'; ctx.lineWidth = 3;
        ClassicActors.player(ctx, { x: 48, y: 48, dir, mouth: 0.6, alive: true },
          { tile: 64, powerTimer, time: 0, reducedMotion: true });
        if (ctx.fillStyle !== '#123456' || ctx.lineWidth !== 3 || !ctx.getTransform().isIdentity || ctx.shadowBlur !== 0) {
          throw new Error('Player artwork leaked Canvas state');
        }
        const [dx, dy] = DIRS[dir];
        const bite = ctx.getImageData(48 + dx * 19, 48 + dy * 19, 1, 1).data[3];
        const body = ctx.getImageData(48 - dx * 19, 48 - dy * 19, 1, 1).data[3];
        if (body < 240 || bite > 180) throw new Error('Lost circular body or open bite: ' + dir);
        signatures.push(surface.toDataURL());
        previewContext.drawImage(surface, dir * 96, row * 96);
        PlayerArtwork.draw(previewContext, { x: dir * 96 + 38 + row * 20, y: 216, dir, mouth: 0.6, alive: true },
          { tile: 16, powerTimer, reducedMotion: true });
      }
    }
    ctx.clearRect(0, 0, 96, 96);
    PlayerArtwork.draw(ctx, { x: 48, y: 48, dir: 0, mouth: 0, alive: false }, { tile: 64, powerTimer: 480 });
    if (ctx.getImageData(0, 0, 96, 96).data.some(value => value)) throw new Error('Dead player still draws');
    for (const icon of document.querySelectorAll('#lives .life')) {
      if (icon.tagName !== 'CANVAS' || !icon.getContext('2d').getImageData(0, 0, 24, 24).data.some(value => value)) {
        throw new Error('Missing shared player skin in HUD');
      }
    }
    if (JSON.stringify({ player, maze, ghosts, score, lives, powerTimer }) !== before) throw new Error('Artwork changed gameplay');
    return { unique: new Set(signatures).size,
      preview: ${process.env.PACMAN_PLAYER_SCREENSHOT ? 'preview.toDataURL()' : 'null'} };
  })()`);
  assert.equal(playerArtwork.unique, 8, 'all four player headings and both power states must render distinctly');
  if (process.env.PACMAN_PLAYER_SCREENSHOT) {
    await fs.writeFile(process.env.PACMAN_PLAYER_SCREENSHOT, Buffer.from(playerArtwork.preview.split(',')[1], 'base64'));
  }
  t.diagnostic('Player bite, headings, power states, Canvas isolation and HUD artwork verified.');

  const bonus = await client.evaluate(`(() => {
    const surface = document.createElement('canvas'); surface.width = surface.height = 128;
    const ctx = surface.getContext('2d'), signatures = [];
    const before = JSON.stringify({ player, maze, ghosts, score, lives, powerTimer, bonus: bonusLife.state });
    for (const time of [0, 2]) {
      ctx.clearRect(0, 0, 128, 128); ctx.fillStyle = '#123456'; ctx.lineWidth = 3;
      BonusLifeArtwork.drawCoin(ctx, { x: 64, y: 64 }, { tile: 64, time });
      if (ctx.fillStyle !== '#123456' || ctx.lineWidth !== 3 || !ctx.getTransform().isIdentity || ctx.shadowBlur !== 0) {
        throw new Error('Bonus coin leaked Canvas state');
      }
      if (!ctx.getImageData(0, 0, 128, 128).data.some(value => value)) throw new Error('Invisible bonus coin');
      signatures.push(surface.toDataURL());
    }
    const reduced = [];
    for (const time of [0, 20]) {
      ctx.clearRect(0, 0, 128, 128);
      BonusLifeArtwork.drawCoin(ctx, { x: 64, y: 64 }, { tile: 64, time, reducedMotion: true });
      reduced.push(surface.toDataURL());
    }
    if (reduced[0] !== reduced[1]) throw new Error('Reduced-motion bonus still rotates');
    for (const reducedMotion of [false, true]) {
      ctx.clearRect(0, 0, 128, 128);
      BonusLifeArtwork.drawEffect(ctx, { x: 64, y: 80, age: 0, duration: 72 }, { tile: 32, reducedMotion });
      if (!ctx.getImageData(0, 0, 128, 128).data.some(value => value)) throw new Error('Invisible +1 LIFE');
      if (!ctx.getTransform().isIdentity || ctx.globalAlpha !== 1 || ctx.shadowBlur !== 0) throw new Error('Bonus effect leaked Canvas state');
    }
    if (JSON.stringify({ player, maze, ghosts, score, lives, powerTimer, bonus: bonusLife.state }) !== before) {
      throw new Error('Bonus artwork changed gameplay');
    }
    resetLevel(false); player.speed = 0;
    for (let i = bonusLife.state.ticksUntilSpawn; i > 0; i--) updatePlayer();
    if (!bonusLife.state.coin) throw new Error('No bonus coin appeared');
    const previousLives = lives;
    Object.assign(player, bonusLife.state.coin); updatePlayer(); updatePlayer();
    if (lives !== previousLives + 1 || !bonusLife.state.collected || bonusLife.state.coin !== null) {
      throw new Error('Bonus pickup did not award exactly one life');
    }
    return { unique: new Set(signatures).size, lives, icons: document.querySelectorAll('#lives .life').length };
  })()`);
  assert.equal(bonus.unique, 2, 'coin rotation must change the real Canvas image');
  assert.equal(bonus.icons, bonus.lives);
  t.diagnostic('Bonus coin, rotation, reduced motion, collection effect and extra HUD life verified.');
  await client.evaluate('resetLevel(false);');

  if (testThree) {
    await client.evaluate('resetLevel(false); resetLevel(false);');
    assert.equal(await client.evaluate("document.querySelectorAll('.city-scene').length"), 1, 'restarts must not leak canvases');
    await client.evaluate(`(() => {
      const canvas = document.querySelector('.city-scene');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      gl.getExtension('WEBGL_lose_context').loseContext();
    })()`);
    await waitFor(() => client.evaluate("document.getElementById('gameCanvas').dataset.renderer === 'canvas'"), 'Context loss did not activate Canvas.');
    assert.equal(await client.evaluate("document.querySelectorAll('.city-scene').length"), 0);
  }

  for (const [width, height, minWidth] of [[390, 844, 370], [844, 390, 330]]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await checkLayout(minWidth);
  }
  await client.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 1, mobile: false });
  await client.evaluate('gameState = "playing"; showOverlay(null);');
  if (process.env.PACMAN_SCREENSHOT) {
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(process.env.PACMAN_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
  }
  await client.send('Page.reload', { ignoreCache: true });
  const offlineRenderer = testThree ? 'three' : 'canvas';
  await waitFor(() => client.evaluate(`!!document.getElementById('startBtn') && document.getElementById('gameCanvas').dataset.renderer === '${offlineRenderer}'`),
    `Offline ${offlineRenderer} city did not initialize.`, 40000);
  await client.evaluate("document.getElementById('startBtn').click()");
  await waitFor(() => client.evaluate('score > 0'), 'Offline city is not playable.');
  if (testThree) {
    await client.send('Network.setBlockedURLs', { urls: ['*/scripts/vendor/three.module.min.mjs'] });
    await client.send('Page.reload', { ignoreCache: true });
    await waitFor(() => client.evaluate("!!document.getElementById('startBtn') && document.getElementById('gameCanvas').dataset.renderer === 'canvas'"),
      'Missing local Three.js did not activate Canvas.');
    await client.evaluate("document.getElementById('startBtn').click()");
    await waitFor(() => client.evaluate('score > 0'), 'Canvas fallback is not playable without Three.js.');
  }
  assert.deepEqual(client.requests.filter(url => /^https?:/.test(url) && new URL(url).origin !== origin), [],
    'the game must never request external resources');
  assert.deepEqual(client.errors, [], 'no uncaught browser errors');
});
