const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAudioContext } = require('./audio-context');
const { createMediaAudio } = require('./media-audio');

const root = path.join(__dirname, '../..');
const revision = process.env.PACMAN_REVISION;
function readSource(file) {
  return revision
    ? execFileSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, file), 'utf8');
}
const html = readSource('index.html');
const scripts = [...html.matchAll(/<script(?:\s+src="([^"]+)"[^>]*>|>)([\s\S]*?)<\/script>/g)]
  .map(match => ({ name: match[1] || 'inline.js', code: match[1] ? readSource(match[1]) : match[2] }));

function boot(options = {}) {
  const elements = new Map(), frames = [], timers = [], drawing = [], media = [];
  const storage = new Map([['pacmanHigh', options.highScore || '0']]);
  function makeContext() {
    return new Proxy({}, {
      get(target, key) {
        if (key === 'createRadialGradient' || key === 'createLinearGradient') {
          return (...args) => { drawing.push([key, ...args]); return { addColorStop() {} }; };
        }
        return target[key] ?? ((...args) => drawing.push([key, ...args]));
      }
    });
  }
  class Element {
    constructor() {
      this.style = {}; this.dataset = {}; this.listeners = new Map(); this.children = [];
      const classes = new Set();
      this.classList = {
        toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      };
      this.attributes = new Map();
      this.context2d = makeContext();
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) || []) {
        listener(event);
        if (event.immediatePropagationStopped) break;
      }
      if (type === 'click' && this.onclick) this.onclick(event);
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); }
    getContext() { return this.context2d; }
    setPointerCapture(id) { this.capturedPointer = id; }
    hasPointerCapture(id) { return this.capturedPointer === id; }
    releasePointerCapture(id) {
      if (!this.hasPointerCapture(id)) return;
      delete this.capturedPointer;
      this.emit('lostpointercapture', { pointerId: id });
    }
    set innerHTML(value) {
      this.children = [];
      this.html = value;
      for (const match of value.matchAll(/id="([^"]+)"/g)) elements.set(match[1], new Element());
    }
    get innerHTML() { return this.html || ''; }
  }
  for (const id of ['gameContainer', 'fullscreenBtn', 'gameCanvas', 'gameViewport', 'worldClock', 'score', 'highScore', 'lives', 'overlay', 'startBtn']) {
    elements.set(id, new Element());
  }
  elements.get('worldClock').dataset.presentTime = '03:17 AM';
  elements.get('worldClock').textContent = '03:17 AM';
  elements.get('gameViewport').appendChild(elements.get('gameCanvas'));
  class AudioContext {
    constructor() {
      if (options.audio === 'throws') throw new Error('Audio unavailable');
      const context = createAudioContext({ state: options.audio === 'suspended' ? 'suspended' : 'running' });
      if (options.audio === 'toneThrows') context.createOscillator = () => { throw new Error('Audio device lost'); };
      return context;
    }
  }
  const window = new Element();
  const motionPreference = { matches: !!options.reducedMotion };
  window.matchMedia = () => motionPreference;
  if (options.webgl) window.WebGLRenderingContext = function () {};
  if (options.audio !== 'missing') window[options.audio === 'webkit' ? 'webkitAudioContext' : 'AudioContext'] = AudioContext;
  if (options.music !== 'missing') window.Audio = function () {
    if (options.music === 'throws') throw new Error('Media unavailable');
    const audio = createMediaAudio({ playback: options.music });
    media.push(audio);
    return audio;
  };
  const document = new Element();
  document.body = new Element();
  document.getElementById = id => elements.get(id) || null;
  document.createElement = () => new Element();
  const sandbox = {
    window, document, Audio: window.Audio,
    localStorage: {
      getItem(key) {
        if (options.storage === 'readThrows') throw new Error('SecurityError');
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (options.storage === 'writeThrows') throw new Error('QuotaExceededError');
        storage.set(key, String(value));
      }
    },
    requestAnimationFrame(callback) { frames.push(callback); },
    setTimeout(callback, delay) { timers.push({ callback, delay }); }
  };
  if (options.random) sandbox.Math = Object.assign(Object.create(Math), { random: options.random });
  if (options.storage === 'accessThrows') {
    Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('SecurityError'); } });
  }
  const context = vm.createContext(sandbox);
  for (const script of scripts) vm.runInContext(script.code, context, { filename: script.name });
  const run = code => vm.runInContext(code, context);
  window.emit('load');
  let timestamp = 0;
  function frameAt(time) {
    assert.ok(frames.length, 'animation loop must keep running');
    frames.shift()(time);
    timestamp = time + 1000 / 60;
  }
  return {
    run, elements, frames, drawing, storage, frameAt, media,
    setHidden(value) { document.hidden = !!value; document.emit('visibilitychange'); },
    setReducedMotion(value) { motionPreference.matches = !!value; },
    click(id = 'startBtn') { elements.get(id).emit('click'); },
    key(key, repeat = false, target) {
      const event = { key, repeat, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.immediatePropagationStopped = true; } };
      document.emit('keydown', event);
      return event;
    },
    pointer(type, x, y, id = 1, options = {}) {
      elements.get('gameCanvas').emit(type, { clientX: x, clientY: y, pointerId: id,
        pointerType: 'touch', isPrimary: true, button: 0, ...options });
    },
    advance(count = 1) {
      for (let i = 0; i < count; i++) {
        frameAt(timestamp);
      }
    },
    respawn() {
      if (run('typeof playerDeath !== "undefined" && playerDeath !== null')) {
        run('while (playerDeath) updatePlayerDeath();');
        return;
      }
      const index = timers.findIndex(({ delay }) => delay === 1500);
      assert.notEqual(index, -1, 'death must schedule a respawn');
      const [timer] = timers.splice(index, 1);
      timer.callback();
    }
  };
}

module.exports = { boot };
