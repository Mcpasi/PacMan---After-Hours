const assert = require('node:assert/strict');
const test = require('node:test');
const BonusLifeArtwork = require('../scripts/rendering/bonus-life');
const { boot } = require('./helpers/game-harness');

function paint(kind = 'drawCoin', entity = { x: 120, y: 88 }, options = {}) {
  const calls = [];
  const ctx = new Proxy({}, {
    set(_, key, value) { calls.push(['set', key, typeof value?.addColorStop === 'function' ? 'gradient' : value]); return true; },
    get(_, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => {
        calls.push([key, ...args]);
        return { addColorStop: (...args) => calls.push(['addColorStop', ...args]) };
      };
      return (...args) => calls.push([key, ...args]);
    }
  });
  const settings = { tile: 16, time: 1, ...options };
  const before = structuredClone({ entity, settings });
  BonusLifeArtwork[kind](ctx, entity, settings);
  assert.deepEqual({ entity, settings }, before, 'drawing must never mutate gameplay');
  let depth = 0;
  for (const [method] of calls) {
    if (method === 'save') depth++;
    if (method === 'restore') depth--;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0, 'Canvas transforms, alpha, shadows and styles must be restored');
  return calls;
}

const coin = { x: 120, y: 88 };
const effect = { ...coin, age: 0, duration: 72 };

test('the arcade coin has antique brass shading, a ridged rim, wear and an engraved Pac-Man silhouette', () => {
  const calls = paint();
  for (const color of ['#f1d18a', '#bd9144', '#89602c', '#4c432d']) {
    assert.ok(calls.some(([method, , value]) => method === 'addColorStop' && value === color));
  }
  assert.ok(calls.some(([method, key, value]) => method === 'set' && key === 'fillStyle' && value === '#634620'));
  assert.ok(calls.some(([method, x, y, radius, start, end]) =>
    method === 'arc' && x === 0 && y === 0 && radius === 0.235 && start > 0 && end < Math.PI * 2));
  assert.ok(calls.some(([method, x, y]) => method === 'moveTo' && x === -0.29 && y === -0.2));
  assert.ok(calls.filter(([method]) => method === 'lineTo').length >= 16);
});

test('amber glow and the flattened asphalt reflection stay below the slowly rotating, floating coin', () => {
  const calls = paint();
  const reflection = calls.findIndex(([method, x, y]) => method === 'scale' && x === 1 && y === 0.24);
  const face = calls.findIndex(([method, x, y]) => method === 'scale' && x !== 16 && x !== 1 && y === 1);
  assert.ok(reflection > 0 && reflection < face);
  assert.ok(calls.some(([method, , value]) => method === 'addColorStop' && value === 'rgba(230, 161, 53, 0.18)'));
  assert.ok(calls.some(([method, x, y]) => method === 'translate' && x === coin.x && y === coin.y));
  assert.notDeepEqual(paint('drawCoin', coin, { time: 1 }), paint('drawCoin', coin, { time: 2 }));
  const edge = paint('drawCoin', coin, { time: Math.PI / 1.6 });
  assert.ok(edge.some(([method, x, y]) => method === 'scale' && x === 0.14 && y === 1), 'the edge never becomes invisible');
});

test('reduced motion keeps the coin static at every timestamp and scale', () => {
  for (const tile of [12, 16, 24, 64]) {
    assert.deepEqual(paint('drawCoin', coin, { tile, time: 0, reducedMotion: true }),
      paint('drawCoin', coin, { tile, time: 100, reducedMotion: true }));
  }
});

test('collection draws one short gold impulse plus a rising, fading +1 LIFE label', () => {
  const initial = paint('drawEffect', effect);
  assert.ok(initial.some(([method]) => method === 'createRadialGradient'));
  assert.ok(initial.some(([method, text]) => method === 'fillText' && text === '+1 LIFE'));
  const late = paint('drawEffect', { ...effect, age: 60 });
  assert.equal(late.some(([method]) => method === 'arc'), false, 'the impulse ends before the label');
  assert.ok(late.some(([method, key, value]) => method === 'set' && key === 'globalAlpha' && value < 1));
  assert.ok(late.find(([method]) => method === 'fillText')[3] < initial.find(([method]) => method === 'fillText')[3]);
  assert.deepEqual(paint('drawEffect', { ...effect, age: 72 }), []);
  assert.deepEqual(paint('drawEffect', null), []);
  assert.deepEqual(paint('drawCoin', null), []);
});

test('reduced motion removes the expanding impulse and label movement, but still announces the extra life', () => {
  const first = paint('drawEffect', effect, { reducedMotion: true });
  const last = paint('drawEffect', { ...effect, age: 60 }, { reducedMotion: true });
  assert.equal(first.some(([method]) => method === 'arc' || method === 'createRadialGradient'), false);
  assert.deepEqual(first.find(([method]) => method === 'fillText'), last.find(([method]) => method === 'fillText'));
});

test('the rising life label stays below the top edge when a coin is collected on the first street', () => {
  for (const tile of [12, 16, 24, 64]) {
    for (const reducedMotion of [false, true]) for (const age of [0, 36, 54, 66]) {
      const entity = { x: 8 * tile, y: 1.5 * tile, age, duration: 72 };
      const calls = paint('drawEffect', entity, { tile, reducedMotion });
      const baseline = entity.y + calls.find(([method]) => method === 'fillText')[3];
      assert.ok(baseline >= tile * 0.55, `label crosses the top edge at tile=${tile}, age=${age}`);
    }
  }
});

test('the shared renderer places the coin before actors and the +1 LIFE effect above actors and atmosphere', () => {
  const game = boot({ reducedMotion: true });
  game.run(`globalThis.layers = [];
    bonusLife.state.coin = { x: 100, y: 100 }; bonusLife.state.effect = { x: 100, y: 100, age: 0, duration: 72 };
    BonusLifeArtwork.drawCoin = (ctx, coin, options) => layers.push(['coin', coin.x, options.tile, options.reducedMotion]);
    GameRenderer.setActors({ player: () => layers.push(['player']), ghosts: () => layers.push(['ghosts']) });
    BonusLifeArtwork.drawEffect = (ctx, effect) => layers.push(['effect', effect.age]);`);
  game.advance();
  assert.equal(game.run('JSON.stringify(layers)'), JSON.stringify([
    ['coin', 100, 16, true], ['player'], ['ghosts'], ['effect', 0]
  ]));
});

test('coin rotation and collection artwork freeze on pause and continue after resume', () => {
  const game = boot({ random: () => 0 });
  game.click();
  game.run(`ghosts = []; player.speed = 0;
    for (let i = bonusLife.state.ticksUntilSpawn; i > 0; i--) updatePlayer();
    globalThis.frames = [];
    const drawCoin = BonusLifeArtwork.drawCoin;
    BonusLifeArtwork.drawCoin = (ctx, coin, options) => {
      frames.push({ coin: coin && { ...coin }, time: options.time, effect: bonusLife.state.effect && { ...bonusLife.state.effect } });
      drawCoin(ctx, coin, options);
    };`);
  for (const collected of [false, true]) {
    if (collected) game.run('Object.assign(player, bonusLife.state.coin); updatePlayer();');
    game.key('p'); game.advance(3);
    assert.equal(game.run('JSON.stringify(frames.at(-1))'), game.run('JSON.stringify(frames.at(-2))'));
    game.key('p'); game.advance(3);
    assert.ok(game.run('frames.at(-1).time > frames.at(-2).time'));
    if (collected) assert.ok(game.run('frames.at(-1).effect.age > frames.at(-2).effect.age'));
  }
});
