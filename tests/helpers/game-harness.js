const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  const elements = new Map(), frames = [], timers = [], drawing = [];
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
      this.context2d = makeContext();
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) || []) listener(event);
      if (type === 'click' && this.onclick) this.onclick(event);
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); }
    getContext() { return this.context2d; }
    setPointerCapture(id) { this.capturedPointer = id; }
    set innerHTML(value) {
      this.children = [];
      this.html = value;
      for (const match of value.matchAll(/id="([^"]+)"/g)) elements.set(match[1], new Element());
    }
    get innerHTML() { return this.html || ''; }
  }
  for (const id of ['gameCanvas', 'gameViewport', 'score', 'highScore', 'lives', 'overlay', 'startBtn']) {
    elements.set(id, new Element());
  }
  elements.get('gameViewport').appendChild(elements.get('gameCanvas'));
  class AudioContext {
    constructor() {
      if (options.audio === 'throws') throw new Error('Audio unavailable');
      this.currentTime = 0;
      this.destination = {};
      this.state = options.audio === 'suspended' ? 'suspended' : 'running';
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
      if (options.audio === 'toneThrows') throw new Error('Audio device lost');
      return { frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }
  const window = new Element();
  window.matchMedia = () => ({ matches: !!options.reducedMotion });
  if (options.webgl) window.WebGLRenderingContext = function () {};
  if (options.audio !== 'missing') window[options.audio === 'webkit' ? 'webkitAudioContext' : 'AudioContext'] = AudioContext;
  const document = new Element();
  document.getElementById = id => elements.get(id) || null;
  document.createElement = () => new Element();
  const sandbox = {
    window, document,
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
    run, elements, frames, drawing, storage, frameAt,
    click(id = 'startBtn') { elements.get(id).emit('click'); },
    key(key, repeat = false) {
      const event = { key, repeat, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      document.emit('keydown', event);
      return event;
    },
    pointer(type, x, y, id = 1) {
      elements.get('gameCanvas').emit(type, { clientX: x, clientY: y, pointerId: id, pointerType: 'touch', isPrimary: true });
    },
    advance(count = 1) {
      for (let i = 0; i < count; i++) {
        frameAt(timestamp);
      }
    },
    respawn() {
      const index = timers.findIndex(({ delay }) => delay === 1500);
      assert.notEqual(index, -1, 'death must schedule a respawn');
      const [timer] = timers.splice(index, 1);
      timer.callback();
    }
  };
}

module.exports = { boot };
