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

test('browser smoke: city, actors, death fragments, search, movement, pause, mobile layout and offline fallback', {
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
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' }[path.extname(file)];
      // Media needs byte ranges to report a finite duration and seek across the loop boundary.
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), content.length - 1) : content.length - 1;
      if (range && (start >= content.length || end < start)) {
        response.writeHead(416, { 'Content-Range': `bytes */${content.length}` }).end(); return;
      }
      response.writeHead(range ? 206 : 200, {
        'Content-Type': type || 'application/octet-stream',
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${content.length}` } : {}),
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'"
      }).end(content.subarray(start, end + 1));
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

  await t.test('tunnel actors remain visible on both sides of the horizontal seam', async () => {
    const samples = await client.evaluate(`(() => {
      const ctx = canvas.getContext('2d'), timestamp = performance.now();
      const state = { maze, player: { ...player, alive: false }, ghosts: [],
        powerTimer: 0, animFrame: 0, gameState: 'paused' };
      const results = [];
      for (const x of [-4, 4]) {
        for (const kind of ['player', 'ghost', 'eyes']) {
          GameRenderer.render(timestamp, state);
          const before = ctx.getImageData(0, 176, canvas.width, 16).data;
          const actor = { ...player, x, y: 184, alive: true, dir: 2, mouth: 0.3 };
          const visible = kind === 'player' ? { ...state, player: actor } : { ...state,
            ghosts: [{ ...ghosts[0], x, y: 184, dir: 2, mode: kind === 'eyes' ? 'eyes' : 'chase', scared: false }] };
          GameRenderer.render(timestamp, visible);
          const after = ctx.getImageData(0, 176, canvas.width, 16).data;
          let left = 0, right = 0;
          for (let y = 0; y < 16; y++) for (let col = 0; col < canvas.width; col++) {
            const i = (y * canvas.width + col) * 4;
            if (!after.slice(i, i + 4).some((value, channel) => value !== before[i + channel])) continue;
            if (col < 16) left++;
            if (col >= canvas.width - 16) right++;
          }
          results.push({ kind, x, left, right });
        }
      }
      return results;
    })()`);
    t.diagnostic(JSON.stringify(samples));
    for (const sample of samples) {
      assert.ok(sample.left > 0 && sample.right > 0, `actor clipped at tunnel seam: ${JSON.stringify(sample)}`);
    }
  });

  await t.test('the complete title overlay fits a small square viewport', async () => {
    try {
      for (const [width, height] of [[360, 360], [320, 320], [400, 400]]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
        const bounds = await client.evaluate(`(() => {
          const overlay = document.getElementById('overlay').getBoundingClientRect();
          return [...document.getElementById('overlay').children].map(element => {
            const rect = element.getBoundingClientRect();
            return { text: element.textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
              overlayTop: overlay.top, overlayBottom: overlay.bottom,
              fits: rect.left >= overlay.left && rect.right <= overlay.right &&
                rect.top >= overlay.top && rect.bottom <= overlay.bottom && element.scrollWidth <= element.clientWidth + 1,
              touchTarget: element.tagName !== 'BUTTON' || rect.height >= 44 };
          });
        })()`);
        t.diagnostic(JSON.stringify({ width, height, bounds }));
        assert.ok(bounds.every(element => element.fits), 'title text and start button must not be clipped by the viewport');
        assert.ok(bounds.every(element => element.touchTarget), 'the compact start button must retain a 44px touch target');
      }
    } finally {
      await client.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 1, mobile: false });
    }
  });

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
  await client.evaluate("document.getElementById('startBtn').click()", true);
  await waitFor(() => client.evaluate('score > 0 && player.x > 13.5 * TILE'), 'Pac-Man did not move and collect dots.');
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'p' });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p' });
  assert.equal(await client.evaluate('gameState'), 'paused');
  const position = await client.evaluate('player.x');
  await client.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await client.evaluate('player.x'), position);

  await t.test('the local arcade track plays, loops at its end and resumes without rewinding', async () => {
    try {
      await client.evaluate(`(() => {
        globalThis.musicProbe = new Audio();
        globalThis.musicTest = BackgroundMusic.create({ createAudio: () => musicProbe });
        if (!musicTest.play(audioCtx)) throw new Error('Music failed to start');
      })()`, true);
      await waitFor(() => client.evaluate('musicProbe.currentTime > 0 && Number.isFinite(musicProbe.duration)'),
        'The local MP3 did not start playing with a finite, seekable duration.');
      const track = await client.evaluate(`({ src: musicProbe.currentSrc, loop: musicProbe.loop,
        muted: musicProbe.muted, paused: musicProbe.paused, duration: musicProbe.duration })`);
      assert.equal(track.src, `${origin}/sounds/background_sound.mp3`);
      assert.equal(track.loop, true);
      assert.equal(track.muted, false);
      assert.equal(track.paused, false);
      assert.ok(track.duration > 1);
      await client.evaluate('musicProbe.currentTime = musicProbe.duration - 0.2');
      await waitFor(() => client.evaluate('!musicProbe.seeking && !musicProbe.paused && musicProbe.currentTime < 2'),
        'The music stopped instead of looping back to the beginning.');
      const pausedAt = await client.evaluate('musicTest.pause(); musicProbe.currentTime');
      await client.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      assert.equal(await client.evaluate('musicProbe.currentTime'), pausedAt);
      await client.evaluate('musicTest.play(audioCtx)', true);
      await waitFor(() => client.evaluate(`!musicProbe.paused && musicProbe.currentTime > ${pausedAt}`),
        'The music did not resume from its paused position.');
    } finally {
      t.diagnostic(JSON.stringify(await client.evaluate(`(() => {
        const audio = globalThis.musicProbe;
        return audio ? { music: audio.currentSrc, time: audio.currentTime, duration: audio.duration,
          paused: audio.paused, ready: audio.readyState, network: audio.networkState,
          error: audio.error?.message, context: audioCtx.state } : { music: 'unavailable' };
      })()`)));
      await client.evaluate('globalThis.musicTest?.pause(); delete globalThis.musicTest; delete globalThis.musicProbe;');
    }
  });

  const beforeFullscreen = await client.evaluate('JSON.stringify({ gameState, player, ghosts, maze, score, lives, level })');
  await client.evaluate("document.getElementById('fullscreenBtn').click()", true);
  await waitFor(() => client.evaluate("document.fullscreenElement === document.getElementById('gameContainer')"), 'Native fullscreen did not activate.');
  await checkLayout(680);
  await client.evaluate('document.exitFullscreen()');
  await waitFor(() => client.evaluate("!document.getElementById('gameContainer').classList.contains('is-expanded')"), 'External fullscreen exit did not restore the layout.');
  assert.equal(await client.evaluate('JSON.stringify({ gameState, player, ghosts, maze, score, lives, level })'), beforeFullscreen);
  t.diagnostic('Native fullscreen and external exit preserve the paused game.');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const touchOrigin = await client.evaluate(`(() => {
    resetLevel(false); ghosts = []; player.speed = 0;
    gameState = 'playing'; showOverlay(null);
    const bounds = canvas.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, right: bounds.right };
  })()`);
  const touch = (x, y, id = 1) => ({ x, y, id });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(touchOrigin.x, touchOrigin.y)] });
  assert.equal(await client.evaluate('canvas.hasPointerCapture(pointerStart.id)'), true);
  assert.deepEqual(await client.evaluate(`(() => {
    const style = getComputedStyle(canvas);
    return { touchAction: style.touchAction, userSelect: style.userSelect,
      menuAllowed: canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      captured: canvas.hasPointerCapture(pointerStart.id) };
  })()`), { touchAction: 'none', userSelect: 'none', menuAllowed: false, captured: true },
  'a held finger must not open a context menu or select the game surface');
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(touchOrigin.x, touchOrigin.y - 40)] });
  assert.equal(await client.evaluate('player.nextDir'), 3);
  const heldTouch = touch(touchOrigin.x + 13, touchOrigin.y - 26);
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [heldTouch] });
  assert.equal(await client.evaluate('player.nextDir'), 3, 'diagonal drift must not overwrite the native touch swipe');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [heldTouch, touch(touchOrigin.x + 60, touchOrigin.y + 40, 2)] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove',
    touchPoints: [heldTouch, touch(touchOrigin.x + 20, touchOrigin.y + 40, 2)] });
  assert.equal(await client.evaluate('player.nextDir'), 3, 'another finger must not steer');
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await client.evaluate('pointerStart === null'), true);
  assert.equal(await client.evaluate("canvas.dispatchEvent(new PointerEvent('contextmenu', { pointerType: 'mouse', cancelable: true }))"), true,
    'desktop right-clicks remain available when no finger is steering');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(touchOrigin.x, touchOrigin.y)] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(touchOrigin.right + 20, touchOrigin.y)] });
  assert.equal(await client.evaluate('player.nextDir'), 0, 'capture must keep a swipe usable outside the canvas');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await client.evaluate('pointerStart === null'), true);

  for (const [dir, dx, dy] of [[0, 1, 0], [1, 0, 1], [2, -1, 0], [3, 0, -1]]) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(touchOrigin.x, touchOrigin.y)] });
    for (const distance of [40, 43, 47, 51, 50, 47, 44, 40, 39]) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove',
        touchPoints: [touch(touchOrigin.x + dx * distance, touchOrigin.y + dy * distance)] });
      if (distance !== 39) assert.equal(await client.evaluate('player.nextDir'), dir, 'sub-threshold native motion must not reverse');
    }
    assert.equal(await client.evaluate('player.nextDir'), (dir + 2) % 4, `12px native touch reversal after direction ${dir}`);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(touchOrigin.x, touchOrigin.y)] });
  // Supply deterministic history: CDP's native moves do not guarantee batching.
  assert.deepEqual(await client.evaluate(`(() => {
    const { id, x, y } = pointerStart;
    let reads = 0;
    const point = (clientX, clientY) => new PointerEvent('pointermove', {
      pointerId: id, pointerType: 'touch', clientX, clientY, bubbles: true
    });
    const event = point(x, y);
    Object.defineProperty(event, 'getCoalescedEvents', { value() {
      reads++;
      return [point(x + 40, y), point(x + 40, y + 40), point(x, y + 40)];
    } });
    canvas.dispatchEvent(event);
    return { reads, nextDir: player.nextDir, touchTurn: player.touchTurn };
  })()`), { reads: 1, nextDir: 3, touchTurn: 3 },
  'a batched square must end facing up and its bubbled history must only be processed once');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await client.evaluate('pointerStart === null'), true);

  const outsideTouch = await client.evaluate(`(() => {
    player.nextDir = 0;
    // Remove implicit touch capture too, so native events really leave the canvas.
    canvas.setPointerCapture = id => { canvas.releasePointerCapture(id); throw new Error('Capture unavailable'); };
    const bounds = canvas.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top - 10 };
  })()`);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(touchOrigin.x, touchOrigin.y)] });
    assert.equal(await client.evaluate('canvas.hasPointerCapture(pointerStart.id)'), false);
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(outsideTouch.x, outsideTouch.y)] });
    assert.equal(await client.evaluate('player.nextDir'), 3, 'uncaptured native touch must steer outside the canvas before release');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await client.evaluate('pointerStart === null'), true);
  } finally {
    await client.evaluate('delete canvas.setPointerCapture');
  }
  assert.deepEqual(await client.evaluate('[scrollX, scrollY]'), [0, 0], 'touch steering must not scroll the page');
  await client.evaluate('gameState = "paused"; resetLevel(false); showOverlay("PAUSED");');
  assert.equal(await client.evaluate("document.getElementById('ovBtn').dispatchEvent(new PointerEvent('contextmenu', { pointerType: 'touch', bubbles: true, cancelable: true }))"), true,
    'touch protection must not interfere with overlay controls');
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await client.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 1, mobile: false });
  t.diagnostic('Native mobile swipes, 12px reversals, batched paths, long-press protection, diagonal drift, multitouch, cancellation and outside-canvas capture/fallback verified.');

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

  await t.test('freeze finds render in both worlds, stop ghosts for four seconds and preserve their controller and learning', async () => {
    const freeze = await client.evaluate(`(() => {
      resetLevel(false); gameState = 'paused'; showOverlay('PAUSED');
      const surface = document.createElement('canvas'); surface.width = surface.height = 128;
      const context = surface.getContext('2d'), signatures = [], frozenSignatures = [];
      const preview = document.createElement('canvas'); preview.width = 640; preview.height = 256;
      const previewContext = preview.getContext('2d');
      previewContext.fillStyle = '#101b22'; previewContext.fillRect(0, 0, preview.width, preview.height);
      const before = JSON.stringify({ maze, ghosts, player, freeze: freezePowerUps.state });
      for (const [row, world] of ['city', 'retro'].entries()) {
        for (const [column, kind] of ['lantern', 'watch'].entries()) {
          const state = { pickups: [{ kind, x: 64, y: 64 }] };
          const frames = [];
          for (const time of [0, 20]) {
            context.clearRect(0, 0, 128, 128); context.fillStyle = '#123456'; context.lineWidth = 3;
            FreezePowerUpArtwork.drawPickups(context, state, { tile: 64, time, world, reducedMotion: true });
            if (context.fillStyle !== '#123456' || context.lineWidth !== 3 || !context.getTransform().isIdentity || context.shadowBlur !== 0) {
              throw new Error('Freeze pickup leaked Canvas state');
            }
            if (!context.getImageData(0, 0, 128, 128).data.some(value => value)) throw new Error('Invisible freeze find');
            frames.push(surface.toDataURL());
          }
          if (frames[0] !== frames[1]) throw new Error('Reduced-motion freeze find still moves');
          signatures.push(frames[0]);
          previewContext.drawImage(surface, column * 128, row * 128);
        }
        for (const [column, mode] of ['chase', 'frightened', 'eyes'].entries()) {
          const roster = [{ ...ghosts[0], x: 64, y: 64, mode: mode === 'frightened' ? 'chase' : mode,
            scared: mode === 'frightened' }];
          const frames = [];
          for (const time of [0, 0.2]) {
            context.clearRect(0, 0, 128, 128);
            const options = { tile: 64, dirs: DIRS, powerTimer: 60, time, frozen: true, world };
            (world === 'retro' ? RetroWorldArtwork.ghosts : GhostArtwork.draw)(context, roster, options);
            FreezePowerUpArtwork.drawFrozenGhosts(context, roster, options);
            if (!context.getTransform().isIdentity || context.shadowBlur !== 0) throw new Error('Frozen ghost leaked Canvas state');
            frames.push(surface.toDataURL());
          }
          if (frames[0] !== frames[1]) throw new Error('Frozen ghost artwork still animates');
          frozenSignatures.push(frames[0]);
          previewContext.drawImage(surface, (column + 2) * 128, row * 128);
        }
      }
      if (JSON.stringify({ maze, ghosts, player, freeze: freezePowerUps.state }) !== before) throw new Error('Freeze artwork changed gameplay');
      const state = { maze, ghosts, player, powerTimer, animFrame, gameState: 'paused', freezePowerUps: freezePowerUps.state };
      const timestamp = performance.now();
      for (const mix of [0, 0.5, 1]) {
        state.retroWorld = { mix };
        GameRenderer.render(timestamp, state);
        const visible = canvas.toDataURL();
        GameRenderer.render(timestamp, { ...state, freezePowerUps: { ...freezePowerUps.state, pickups: [] } });
        if (visible === canvas.toDataURL()) throw new Error('Freeze finds disappeared at world mix ' + mix);
      }
      const controller = ghostController, learning = ghostLearning;
      const ghostsBefore = JSON.stringify(ghosts);
      Object.assign(player, freezePowerUps.state.pickups[0], { speed: 0 }); updatePlayer();
      if (freezePowerUps.state.remainingTicks !== 240 || freezePowerUps.state.pickups.length !== 1) throw new Error('Freeze pickup failed');
      for (let tick = 0; tick < 240; tick++) updateGhosts();
      if (JSON.stringify(ghosts) !== ghostsBefore || freezePowerUps.state.remainingTicks !== 0) throw new Error('Freeze did not last exactly four seconds');
      updateGhosts();
      if (JSON.stringify(ghosts) === ghostsBefore) throw new Error('Ghosts failed to thaw');
      if (controller !== ghostController || learning !== ghostLearning) throw new Error('Freeze replaced the ghost controller or knowledge');
      return { pickups: new Set(signatures).size, ghosts: new Set(frozenSignatures).size,
        preview: ${process.env.PACMAN_FREEZE_SCREENSHOT ? 'preview.toDataURL()' : 'null'} };
    })()`);
    assert.equal(freeze.pickups, 4, 'both finds must have distinct Old Town and arcade skins');
    assert.equal(freeze.ghosts, 6, 'chasing, frightened and eye-only states remain distinct under ice in both worlds');
    if (process.env.PACMAN_FREEZE_SCREENSHOT) {
      await fs.writeFile(process.env.PACMAN_FREEZE_SCREENSHOT, Buffer.from(freeze.preview.split(',')[1], 'base64'));
    }
  });

  const corruption = await client.evaluate(`(() => {
    const city = CityLayout.create(maze, TILE), artwork = Level256GlitchArtwork.create(city);
    const surface = document.createElement('canvas'); surface.width = city.width; surface.height = city.height;
    const context = surface.getContext('2d'), signatures = [];
    const before = JSON.stringify({ maze, player, ghosts, score, lives, bonus: bonusLife.state });
    const effect = { seed: 256, age: 20, duration: 63, ticksPerSecond: 60 };
    for (const phase of ['cluster', 'symbols']) {
      context.clearRect(0, 0, surface.width, surface.height);
      context.fillStyle = '#123456'; context.globalAlpha = 0.75;
      artwork.draw(context, artwork.frame({ ...effect, phase }));
      if (context.fillStyle !== '#123456' || context.globalAlpha !== 0.75 || !context.getTransform().isIdentity) {
        throw new Error('Corruption leaked Canvas state');
      }
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      let visible = 0;
      for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
        if (!pixels[(y * surface.width + x) * 4 + 3]) continue;
        visible++;
        if (phase === 'symbols' && x < Math.floor(city.width * 0.79)) throw new Error('Symbols escaped the right edge');
      }
      if (!visible || visible > city.width * city.height * 0.17) throw new Error('Corruption is invisible or covers too much');
      signatures.push(surface.toDataURL());
    }
    context.clearRect(0, 0, surface.width, surface.height);
    artwork.draw(context, artwork.frame({ ...effect, phase: 'symbols', age: 63 }));
    if (context.getImageData(0, 0, surface.width, surface.height).data.some(value => value)) throw new Error('Expired corruption still draws');
    if (JSON.stringify({ maze, player, ghosts, score, lives, bonus: bonusLife.state }) !== before) throw new Error('Corruption changed gameplay');
    gameState = 'paused'; showOverlay('PAUSED');
    level256Glitch.state.ticksUntilGlitch = 1; level256Glitch.update();
    level256Glitch.state.effect.age = 40;
    return new Set(signatures).size;
  })()`);
  assert.equal(corruption, 2, 'local fragments and the right-edge memory strip must render distinctly');
  // Render actual per-lamp instance colors and the emissive shader on the GPU too.
  await client.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await client.evaluate("document.getElementById('gameCanvas').dataset.renderer"), testThree ? 'three' : 'canvas');
  await client.evaluate(`globalThis.currentReducedMotion = null;
    GameRenderer.setActors({ player(ctx, player, options) {
      currentReducedMotion = options.reducedMotion;
      ClassicActors.player(ctx, player, options);
    } });`);
  const frozenGlitch = await client.evaluate('JSON.stringify(level256Glitch.state)');
  for (const [value, expected] of [['reduce', true], ['no-preference', false]]) {
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
    await waitFor(() => client.evaluate(`currentReducedMotion === ${expected}`),
      `The running glitch did not adopt prefers-reduced-motion: ${value}.`);
    assert.equal(await client.evaluate('JSON.stringify(level256Glitch.state)'), frozenGlitch);
  }
  await client.send('Emulation.setEmulatedMedia', { features: [] });
  await client.evaluate('GameRenderer.setActors({ player: ClassicActors.player }); delete globalThis.currentReducedMotion;');
  await client.evaluate(`level256Glitch.state.effect = null;`);
  t.diagnostic('Level-256-inspired fragments, right-edge bounds, cleanup, Canvas isolation, live lamp dimming and reduced-motion changes verified.');

  await t.test('1980 time travel blends the whole scene, keeps live pellets and restores the clock and city', async () => {
    const visit = await client.evaluate(`(() => {
      startGame(); gameState = 'paused'; showOverlay('PAUSED');
      const context = canvas.getContext('2d'), timestamp = performance.now();
      const before = JSON.stringify({ maze, player, ghosts, score, lives, powerTimer, bonus: bonusLife.state });
      const state = { maze, player, ghosts, animFrame, powerTimer, gameState: 'paused',
        bonusLife: bonusLife.state, retroWorld: retroWorld.state };
      const years = [], phases = [], mixes = [];
      function render() {
        updateWorldClock();
        GameRenderer.render(timestamp, state);
        years.push(document.getElementById('worldClock').textContent);
        phases.push(retroWorld.state.phase); mixes.push(retroWorld.state.mix);
        return canvas.toDataURL();
      }
      function advance(ticks) { for (let tick = 0; tick < ticks; tick++) retroWorld.update(); }
      const present = render();
      level256Glitch.state.ticksUntilGlitch = 1; level256Glitch.update();
      if (retroWorld.state.phase !== 'delay') throw new Error('Glitch did not trigger time travel');
      advance(90); render();
      advance(240); const halfway = render();
      advance(240); const past = render();
      const floor = [...context.getImageData(216, 424, 1, 1).data];
      const playerBody = [...context.getImageData(player.x - 4, player.y, 1, 1).data];
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let blue = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 2] > 180 && pixels[index] < 70 && pixels[index + 1] < 70) blue++;
      }
      const preview = ${process.env.PACMAN_RETRO_SCREENSHOT ? 'past' : 'null'};
      // Pellets are not baked into the cached 1980 background.
      const cell = maze[1][1]; maze[1][1] = 1; render();
      const consumed = [...context.getImageData(24, 24, 1, 1).data];
      maze[1][1] = cell;
      // Remove the extra probe from the timeline assertions.
      years.pop(); phases.pop(); mixes.pop();
      advance(1800); render();
      advance(180); const returning = render();
      advance(180); const restored = render();
      if (JSON.stringify({ maze, player, ghosts, score, lives, powerTimer, bonus: bonusLife.state }) !== before) {
        throw new Error('Time travel changed gameplay');
      }
      return { years, phases, mixes, floor, playerBody, blue, consumed, preview,
        distinct: new Set([present, halfway, past, returning]).size,
        restored: present === restored, sameHalfway: halfway === returning };
    })()`);
    if (process.env.PACMAN_RETRO_SCREENSHOT) {
      await fs.writeFile(process.env.PACMAN_RETRO_SCREENSHOT, Buffer.from(visit.preview.split(',')[1], 'base64'));
    }
    assert.deepEqual(visit.phases, ['idle', 'fadeIn', 'fadeIn', 'hold', 'fadeOut', 'fadeOut', 'idle']);
    assert.deepEqual(visit.mixes, [0, 0, 0.5, 1, 1, 0.5, 0]);
    assert.deepEqual(visit.years, ['03:17 AM', '03:17 AM', '1980', '1980', '1980', '1980', '03:17 AM']);
    assert.deepEqual(visit.floor, [0, 0, 0, 255], 'the opaque black world must completely cover Canvas or GPU scenery');
    assert.deepEqual(visit.playerBody, [255, 255, 0, 255], 'the brass player becomes original arcade yellow');
    assert.ok(visit.blue > 1000, `the blue double maze contours must be visible (${visit.blue} blue pixels)`);
    assert.deepEqual(visit.consumed, [0, 0, 0, 255], 'consumed pellets must disappear in the 1980 world');
    assert.equal(visit.distinct, 3);
    assert.equal(visit.sameHalfway, true, 'both transitions use the same complete-scene blend');
    assert.equal(visit.restored, true, 'the present-day scene returns without stale retro pixels');
  });

  const deathArtwork = await client.evaluate(`(() => {
    const surface = document.createElement('canvas'); surface.width = surface.height = 256;
    const ctx = surface.getContext('2d'), signatures = [], reduced = [];
    const preview = document.createElement('canvas'); preview.width = 1024; preview.height = 512;
    const previewContext = preview.getContext('2d');
    previewContext.fillStyle = '#101b22'; previewContext.fillRect(0, 0, preview.width, preview.height);
    const before = JSON.stringify({ player, maze, ghosts, score, lives, playerDeath });
    for (const reducedMotion of [false, true]) {
      for (const [column, age] of [0, 15, 30, 80].entries()) {
        const effect = PlayerDeath.create({ x: 128, y: 128, dir: 0, mouth: 0.3 }).state;
        effect.age = age;
        ctx.clearRect(0, 0, 256, 256); ctx.fillStyle = '#123456'; ctx.lineWidth = 3; ctx.globalAlpha = 0.75;
        PlayerDeathArtwork.draw(ctx, effect, { tile: 40, reducedMotion });
        if (ctx.fillStyle !== '#123456' || ctx.lineWidth !== 3 || ctx.globalAlpha !== 0.75 || !ctx.getTransform().isIdentity) {
          throw new Error('Death fragments leaked Canvas state');
        }
        const pixels = ctx.getImageData(0, 0, 256, 256).data;
        if (!pixels.some(value => value > 0)) throw new Error('Invisible death fragments at age ' + age);
        if (!reducedMotion && age === 30 && ctx.getImageData(128, 128, 1, 1).data[3] !== 0) {
          throw new Error('Body pieces did not separate from the impact point');
        }
        (reducedMotion ? reduced : signatures).push(surface.toDataURL());
        previewContext.drawImage(surface, column * 256, reducedMotion ? 256 : 0);
      }
    }
    if (reduced[0] !== reduced[1] || reduced[1] !== reduced[2]) throw new Error('Reduced-motion fragments still move');
    ctx.clearRect(0, 0, 256, 256);
    const expired = PlayerDeath.create({ x: 128, y: 128, dir: 0, mouth: 0.3 }).state;
    expired.age = expired.duration;
    PlayerDeathArtwork.draw(ctx, expired, { tile: 40 });
    if (ctx.getImageData(0, 0, 256, 256).data.some(value => value)) throw new Error('Expired death effect still draws');
    if (JSON.stringify({ player, maze, ghosts, score, lives, playerDeath }) !== before) throw new Error('Death artwork changed gameplay');
    return { unique: new Set(signatures).size,
      preview: ${process.env.PACMAN_DEATH_SCREENSHOT ? 'preview.toDataURL()' : 'null'} };
  })()`);
  assert.equal(deathArtwork.unique, 4, 'flight, rotation and fading must change the real Canvas image');
  if (process.env.PACMAN_DEATH_SCREENSHOT) {
    await fs.writeFile(process.env.PACMAN_DEATH_SCREENSHOT, Buffer.from(deathArtwork.preview.split(',')[1], 'base64'));
  }
  t.diagnostic('Death fragments, separation, fading, reduced motion and Canvas isolation verified.');
  const deathSound = await client.evaluate(`(async () => {
    const audio = new OfflineAudioContext(1, 24000, 32000);
    if (!PlayerDeathSound.play(audio)) throw new Error('Death sound failed to schedule on Web Audio');
    const buffer = await audio.startRendering(), samples = buffer.getChannelData(0);
    let peak = 0, energy = 0, tail = 0;
    samples.forEach((sample, index) => {
      peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
      if (index >= audio.sampleRate * 0.55) tail = Math.max(tail, Math.abs(sample));
    });
    return { peak, energy, tail };
  })()`);
  assert.ok(deathSound.peak > 0.01 && deathSound.peak < 1, 'the synthesized sound must be audible without clipping');
  assert.ok(deathSound.energy > 1, 'Web Audio must render the crack and falling tones');
  assert.ok(deathSound.tail < 0.001, 'the sound must end cleanly before respawn');
  t.diagnostic('Synthesized death sound rendered through Web Audio without clipping or a lingering tail.');
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
