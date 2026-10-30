const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const executable = process.env.PACMAN_BROWSER;
const root = path.resolve(__dirname, '..');

async function waitFor(check, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

test('browser music: audible HTTP stream and local-file playback without CORS silence', {
  skip: !executable && 'Set PACMAN_BROWSER to an Edge/Chromium executable.', timeout: 60000
}, async t => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pacman-music-'));
  let browser, socket, stderr = '', startupError, sequence = 0;
  const pending = new Map(), logs = [];
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const content = await fs.readFile(file);
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), content.length - 1) : content.length - 1;
      if (start > end || start >= content.length) { response.writeHead(416).end(); return; }
      response.writeHead(range ? 206 : 200, {
        'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
          '.css': 'text/css', '.mp3': 'audio/mpeg' }[path.extname(file)] || 'application/octet-stream',
        'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${content.length}` } : {})
      }).end(content.subarray(start, end + 1));
    } catch { response.writeHead(404).end(); }
  });
  t.after(async () => {
    socket?.close();
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
      const exited = once(browser, 'exit'); browser.kill(); await exited;
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.ok(profile.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  browser = spawn(executable, ['--headless', '--disable-gpu', '--disable-software-rasterizer',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank']);
  browser.stderr.on('data', chunk => { stderr += chunk; });
  browser.on('error', error => { startupError = error; });
  await waitFor(() => {
    if (startupError) throw startupError;
    return /DevTools listening on (ws:\/\/\S+)/.test(stderr);
  }, 'Browser did not start.');
  const debugUrl = new URL(stderr.match(/DevTools listening on (ws:\/\/\S+)/)[1]);
  const pages = await fetch(`http://${debugUrl.host}/json/list`).then(response => response.json());
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Log.entryAdded') logs.push(message.params.entry.text);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  function send(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression, userGesture = false) {
    const result = await send('Runtime.evaluate', { expression, userGesture, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  t.diagnostic(JSON.stringify(await send('Browser.getVersion')));
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const url of [origin + '/', pathToFileURL(path.join(root, 'index.html')).href]) {
    await t.test(new URL(url).protocol, async () => {
      logs.length = 0;
      await send('Page.navigate', { url });
      await waitFor(() => evaluate("!!document.getElementById('gameCanvas')?.dataset.renderer && !!document.getElementById('startBtn')"),
        'Game scripts did not load.');
      // Observe the real game track. Tap its own bus, so effects cannot mask silent music.
      await evaluate(`(() => {
        const NativeAudio = Audio;
        globalThis.musicMedia = [];
        globalThis.musicAnalysers = [];
        window.Audio = function(...args) {
          const media = new NativeAudio(...args); musicMedia.push(media); return media;
        };
        const createSource = AudioContext.prototype.createMediaElementSource;
        AudioContext.prototype.createMediaElementSource = function(media) {
          const source = createSource.call(this, media), connect = source.connect.bind(source);
          source.connect = target => {
            const analyser = this.createAnalyser();
            connect(analyser); analyser.connect(target); musicAnalysers.push(analyser); return target;
          };
          return source;
        };
      })()`);
      await evaluate("document.getElementById('startBtn').click(); ghosts = []; player.speed = 0;", true);
      await waitFor(() => evaluate('musicMedia[0]?.currentTime > 0.1 && audioCtx.state === "running"'),
        'The music did not start after a gesture.');
      const track = await evaluate(`(async () => {
        const audio = musicMedia[0], samples = new Float32Array(2048);
        let peak = 0;
        for (let i = 0; i < 20; i++) {
          for (const analyser of musicAnalysers) {
            analyser.getFloatTimeDomainData(samples);
            for (const value of samples) peak = Math.max(peak, Math.abs(value));
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        return { time: audio.currentTime, duration: audio.duration, paused: audio.paused,
          volume: audio.volume, muted: audio.muted, sources: musicAnalysers.length, peak,
          context: audioCtx.state, error: audio.error?.message };
      })()`);
      t.diagnostic(JSON.stringify({ url, ...track, cors: logs.filter(log => /MediaElementAudioSource|CORS/.test(log)) }));
      assert.equal(track.paused, false); assert.equal(track.muted, false); assert.ok(track.duration > 1);
      if (url.startsWith('file:')) {
        assert.equal(track.sources, 0, 'Local files must avoid the Web Audio media source that Edge silences for CORS.');
        assert.equal(track.volume, 0.025, 'Direct playback must keep the music quiet.');
      } else {
        assert.equal(track.sources, 1);
        assert.ok(track.peak > 0.001, 'An advancing playhead alone does not prove audible music.');
      }
      const pausedAt = await evaluate('gameState = "paused"; showOverlay("PAUSED"); musicMedia[0].currentTime');
      await evaluate('new Promise(resolve => setTimeout(resolve, 150))');
      assert.equal(await evaluate('musicMedia[0].currentTime'), pausedAt);
      await evaluate("document.getElementById('ovBtn').click()", true);
      await waitFor(() => evaluate(`musicMedia[0].currentTime > ${pausedAt}`), 'Resume rewound or stalled music.');
      assert.equal(await evaluate('musicMedia.length'), 1, 'Resume must reuse the same track.');
      await evaluate('musicMedia[0].currentTime = musicMedia[0].duration - 0.2');
      await waitFor(() => evaluate('!musicMedia[0].paused && !musicMedia[0].seeking && musicMedia[0].currentTime < 2'),
        'Music did not loop at the end.');
    });
  }
});
