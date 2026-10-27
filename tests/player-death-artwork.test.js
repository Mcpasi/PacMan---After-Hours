const assert = require('node:assert/strict');
const test = require('node:test');
const PlayerDeath = require('../scripts/player-death');
const PlayerDeathArtwork = require('../scripts/rendering/player-death');
const { boot } = require('./helpers/game-harness');

const effect = PlayerDeath.create({ x: 120, y: 88, dir: 0, mouth: 0.3 }).state;

function paint(entity = effect, options = {}) {
  const calls = [];
  const ctx = new Proxy({}, {
    set(_, key, value) { calls.push(['set', key, typeof value?.addColorStop === 'function' ? 'gradient' : value]); return true; },
    get(_, key) {
      if (key === 'createLinearGradient') return (...args) => {
        calls.push([key, ...args]);
        return { addColorStop: (...args) => calls.push(['addColorStop', ...args]) };
      };
      return (...args) => calls.push([key, ...args]);
    }
  });
  const settings = { tile: 16, ...options };
  const before = structuredClone({ entity, settings });
  PlayerDeathArtwork.draw(ctx, entity, settings);
  assert.deepEqual({ entity, settings }, before, 'drawing never changes effect or gameplay state');
  let depth = 0;
  for (const [method, ...args] of calls) {
    if (method === 'save') depth++;
    if (method === 'restore') depth--;
    assert.ok(depth >= 0);
    for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  assert.equal(depth, 0, 'Canvas transforms, styles and opacity must be restored');
  return calls;
}

test('the original Pac-Man bite breaks into separate brass wedges at every heading and scale', () => {
  for (const tile of [12, 16, 24, 64]) {
    for (const dir of [0, 1, 2, 3]) {
      const entity = PlayerDeath.create({ x: 120, y: 88, dir, mouth: 0.3 }).state;
      const calls = paint(entity, { tile });
      assert.deepEqual(calls.find(([method]) => method === 'translate'), ['translate', 120, 88]);
      assert.deepEqual(calls.find(([method]) => method === 'scale'), ['scale', tile, tile]);
      assert.deepEqual(calls.find(([method]) => method === 'rotate'), ['rotate', dir * Math.PI / 2]);
      assert.deepEqual(calls.filter(([method]) => method === 'arc'), entity.fragments.map(fragment =>
        ['arc', 0, 0, 0.45, fragment.start, fragment.end]));
      assert.equal(calls.filter(([method]) => method === 'clip').length, 9);
      for (const color of ['#f3d58a', '#c69848', '#926329', '#354348']) {
        assert.ok(calls.some(([method, , value]) => method === 'addColorStop' && value === color));
      }
    }
  }
});

test('pieces fly apart, fall, spin and fade based only on effect age, never ambient renderer time', () => {
  const initial = paint(), middle = paint({ ...effect, age: 30 }), late = paint({ ...effect, age: 80 });
  for (const method of ['translate', 'rotate']) {
    assert.notDeepEqual(initial.filter(([name]) => name === method), middle.filter(([name]) => name === method));
  }
  assert.ok(late.some(([method, key, value]) => method === 'set' && key === 'globalAlpha' && value < 1));
  assert.deepEqual(paint({ ...effect, age: 30 }, { time: 0 }), paint({ ...effect, age: 30 }, { time: 100 }));
  assert.deepEqual(paint(null), []);
  assert.deepEqual(paint({ ...effect, age: effect.duration }), []);
});

test('reduced motion keeps the cracked body stationary and only fades it out', () => {
  const initial = paint(effect, { reducedMotion: true });
  const late = paint({ ...effect, age: 80 }, { reducedMotion: true });
  const geometry = calls => calls.filter(([method]) => method !== 'set');
  assert.deepEqual(geometry(initial), geometry(late));
  assert.notDeepEqual(initial, late, 'opacity still fades');
  assert.equal(initial.some(([method]) => method === 'createRadialGradient'), false, 'no flash or expanding pulse');
});

test('the shared renderer draws the death above ghosts in any environment and passes reduced-motion settings', () => {
  for (const reducedMotion of [false, true]) {
    const game = boot({ reducedMotion }); game.click();
    game.run(`globalThis.layers = [];
      GameRenderer.setEnvironment({ name: 'custom', setLayout() {}, draw() { layers.push(['environment']); } });
      GameRenderer.setActors({ player: () => layers.push(['player']), ghosts: () => layers.push(['ghosts']) });
      PlayerDeathArtwork.draw = (ctx, effect, options) => layers.push(['death', effect.age, options.tile, options.reducedMotion]);
      Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
    game.advance();
    assert.equal(game.run('JSON.stringify(layers)'), JSON.stringify([
      ['environment'], ['player'], ['ghosts'], ['death', 0, 16, reducedMotion]
    ]));
    assert.equal(game.drawing.some(([method, text]) => method === 'fillText' && text === 'READY!'), false);
  }
});
