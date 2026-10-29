const assert = require('node:assert/strict');
const test = require('node:test');
const Artwork = require('../scripts/rendering/freeze-powerups');
const GhostArtwork = require('../scripts/rendering/ghosts');
const RetroArtwork = require('../scripts/rendering/retro-world');
const { actor, tile } = require('./helpers/ghost-fixtures');
const { boot } = require('./helpers/game-harness');

const state = { pickups: [{ kind: 'lantern', x: 120, y: 88 }, { kind: 'watch', x: 200, y: 120 }],
  remainingTicks: 240, duration: 240, ticksPerSecond: 60 };

function paint(draw, entity, options = {}) {
  const calls = [];
  const ctx = new Proxy({}, {
    set(target, key, value) {
      target[key] = value;
      calls.push(['set', key, value?.addColorStop ? 'gradient' : value]); return true;
    },
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient') return (...args) => {
        calls.push([key, ...args]); return { addColorStop: (...args) => calls.push(['addColorStop', ...args]) };
      };
      return (...args) => calls.push([key, ...args]);
    }
  });
  const settings = { tile, width: 448, dirs: [[1, 0], [0, 1], [-1, 0], [0, -1]], ...options };
  const before = structuredClone({ entity, settings });
  draw(ctx, entity, settings);
  assert.deepEqual({ entity, settings }, before, 'artwork must not mutate gameplay or render options');
  let depth = 0;
  for (const [method] of calls) {
    if (method === 'save') depth++;
    if (method === 'restore') depth--;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0, 'all Canvas state must be restored');
  return calls;
}

test('Old Town finds have distinct brass-and-frost silhouettes; the retro world uses distinct cyan pixel skins', () => {
  for (const world of ['city', 'retro']) {
    const lantern = paint(Artwork.drawPickups, { pickups: [state.pickups[0]] }, { world });
    const watch = paint(Artwork.drawPickups, { pickups: [state.pickups[1]] }, { world });
    assert.notDeepEqual(lantern.filter(call => call[0] !== 'translate'), watch.filter(call => call[0] !== 'translate'));
    if (world === 'city') {
      for (const color of ['#e0c58c', '#967344', '#464c43']) {
        assert.ok(lantern.some(([method, , value]) => method === 'addColorStop' && value === color));
      }
      assert.ok(lantern.some(([method, key, value]) => method === 'set' && key === 'strokeStyle' && value === '#c9f5f2'));
    } else {
      assert.equal(lantern.some(([method]) => method === 'createLinearGradient'), false);
      assert.ok(lantern.some(([method]) => method === 'fillRect'));
    }
  }
  assert.deepEqual(paint(Artwork.drawPickups, null), []);
  assert.deepEqual(paint(Artwork.drawPickups, { pickups: [] }), []);
});

test('reduced motion removes hovering at every scale, and collected finds disappear in either world', () => {
  for (const world of ['city', 'retro']) for (const tile of [12, 16, 32, 64]) {
    assert.deepEqual(paint(Artwork.drawPickups, state, { world, tile, time: 0, reducedMotion: true }),
      paint(Artwork.drawPickups, state, { world, tile, time: 50, reducedMotion: true }));
  }
  assert.notDeepEqual(paint(Artwork.drawPickups, state, { time: 0 }), paint(Artwork.drawPickups, state, { time: 2 }));
});

test('frost overlays preserve all ghost modes and omit hidden house ghosts, without flashes or time-driven movement', () => {
  const ghosts = [actor('blinky', 3, 4), actor('pinky', 4, 4), actor('inky', 5, 4), actor('clyde', 6, 4)];
  ghosts[1].scared = true; ghosts[2].mode = 'eyes'; ghosts[3].mode = 'house'; ghosts[3].houseTimer = 90;
  for (const world of ['city', 'retro']) {
    const first = paint(Artwork.drawFrozenGhosts, ghosts, { frozen: true, world, time: 0 });
    const last = paint(Artwork.drawFrozenGhosts, ghosts, { frozen: true, world, time: 50 });
    assert.deepEqual(first, last);
    assert.equal(first.filter(([method]) => method === 'scale').length, 3);
    assert.deepEqual(paint(Artwork.drawFrozenGhosts, ghosts, { frozen: false, world }), []);
  }
});

test('both ghost skins stop body and frightened-expiry animations during a freeze, then resume normally', () => {
  const ghosts = [actor('blinky', 3, 4)];
  for (const draw of [GhostArtwork.draw, RetroArtwork.ghosts]) for (const scared of [false, true]) {
    ghosts[0].scared = scared;
    const options = { frozen: true, powerTimer: 60 };
    assert.deepEqual(paint(draw, ghosts, { ...options, time: 0 }), paint(draw, ghosts, { ...options, time: 0.2 }));
    assert.notDeepEqual(paint(draw, ghosts, { time: 0, powerTimer: 60 }), paint(draw, ghosts, { time: 0.2, powerTimer: 60 }));
  }
});

test('the stationary freeze label counts down in simulation seconds and cleans up at expiry', () => {
  for (const [remainingTicks, seconds] of [[240, 4], [181, 4], [180, 3], [1, 1]]) {
    const calls = paint(Artwork.drawStatus, { ...state, remainingTicks });
    assert.ok(calls.some(([method, text]) => method === 'fillText' && text === `FREEZE ${seconds}s`));
  }
  assert.deepEqual(paint(Artwork.drawStatus, { ...state, remainingTicks: 0 }), []);
  assert.deepEqual(paint(Artwork.drawStatus, null), []);
});

test('the shared renderer skins the same live pickups and ice for both worlds, including tunnel copies', () => {
  const game = boot({ reducedMotion: true });
  game.click(); game.key('p');
  game.run(`globalThis.layers = [];
    freezePowerUps.state.remainingTicks = 120; retroWorld.state.mix = 1;
    Object.assign(player, { x: -4, y: 11.5 * TILE });
    ghosts = [{ ...ghosts[0], mode: 'chase', x: COLS * TILE - 12, y: 11.5 * TILE }];
    FreezePowerUpArtwork.drawPickups = (ctx, state, options) => layers.push(['pickups', options.world || 'city',
      state === freezePowerUps.state, state.pickups.length, options.reducedMotion]);
    FreezePowerUpArtwork.drawFrozenGhosts = (ctx, roster, options) => layers.push(['ice', options.world || 'city', options.frozen, roster.length]);
    FreezePowerUpArtwork.drawStatus = (ctx, state) => layers.push(['status', state.remainingTicks]);`);
  const before = game.run('JSON.stringify({ ghosts, player, freeze: freezePowerUps.state })');
  game.advance();
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(layers)')), [
    ['pickups', 'city', true, 2, true], ['ice', 'city', true, 1], ['ice', 'city', true, 1],
    ['pickups', 'retro', true, 2, true], ['ice', 'retro', true, 1], ['ice', 'retro', true, 1], ['status', 120]
  ]);
  assert.equal(game.run('JSON.stringify({ ghosts, player, freeze: freezePowerUps.state })'), before);
});
