const assert = require('node:assert/strict');
const test = require('node:test');
const Artwork = require('../scripts/rendering/cherry-bonus');
const { boot } = require('./helpers/game-harness');

function recording() {
  const calls = [], stack = [];
  const state = { fillStyle: '#123456', globalAlpha: 0.75, imageSmoothingEnabled: true };
  const ctx = new Proxy(state, {
    set(target, key, value) { calls.push(['set', key, value]); target[key] = value; return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        calls.push([key, ...args]);
        if (key === 'save') stack.push({ ...state });
        if (key === 'restore') {
          assert.ok(stack.length, 'every restore needs a save');
          Object.assign(state, stack.pop());
        }
      };
    }
  });
  return { ctx, calls, state, stack };
}

test('the cherry is a snapped 16-pixel arcade sprite with two red fruits, stems and white highlights', () => {
  for (const tile of [12, 16, 64]) {
    const record = recording(), before = { ...record.state };
    const fruit = { x: 224.4, y: 232.7 }, snapshot = { ...fruit };
    Artwork.draw(record.ctx, fruit, { tile, world: 'retro' });
    assert.deepEqual(fruit, snapshot);
    assert.deepEqual(record.state, before, 'Canvas styles and alpha must not leak');
    assert.equal(record.stack.length, 0);
    const pixel = tile / 16;
    assert.deepEqual(record.calls.find(([method]) => method === 'translate'),
      ['translate', Math.round(fruit.x / pixel) * pixel, Math.round(fruit.y / pixel) * pixel]);
    assert.deepEqual(record.calls.find(([method]) => method === 'scale'), ['scale', pixel, pixel]);
    const pixels = new Map();
    let color;
    for (const [method, ...args] of record.calls) {
      if (method === 'set' && args[0] === 'fillStyle') color = args[1];
      if (method !== 'fillRect') continue;
      assert.ok(args.every(Number.isInteger));
      assert.deepEqual(args.slice(2), [1, 1]);
      pixels.set(`${args[0]},${args[1]}`, color);
    }
    assert.deepEqual(new Set(pixels.values()), new Set(['#ff0000', '#ffb852', '#ffffff']));
    assert.equal(pixels.get('-5,3'), '#ff0000', 'left cherry');
    assert.equal(pixels.get('2,3'), '#ff0000', 'right cherry');
    assert.equal(pixels.has('0,3'), false, 'the two fruits keep distinct silhouettes');
    assert.equal(pixels.get('2,-7'), '#ffb852', 'joined stems');
    assert.equal(record.calls.some(([method]) => /Gradient|arc|ellipse|stroke|rotate|Curve/.test(method)), false);
  }
});

test('missing fruit and all non-retro worlds draw nothing; reduced motion needs no animation', () => {
  for (const [fruit, world] of [[null, 'retro'], [{ x: 0, y: 0 }, 'city'], [{ x: 0, y: 0 }, undefined]]) {
    const record = recording();
    Artwork.draw(record.ctx, fruit, { tile: 16, world });
    assert.deepEqual(record.calls, []);
  }
  const frames = [0, 20].map(time => {
    const record = recording();
    Artwork.draw(record.ctx, { x: 224, y: 232 }, { tile: 16, world: 'retro', time, reducedMotion: true });
    return record.calls;
  });
  assert.deepEqual(frames[0], frames[1]);
});

test('the renderer paints cherries only inside the retro layer, below actors and with its crossfade alpha', () => {
  const game = boot(); game.click();
  game.run(`globalThis.layers = [];
    GameRenderer.setEnvironment({ setLayout() {}, draw() {} });
    CherryBonusArtwork.draw = (context, fruit, options) => {
      if (fruit) layers.push(['cherry', context === ctx, options.world]);
    };
    RetroWorldArtwork.player = () => layers.push('retroPlayer');
    ctx.drawImage = () => { if (layers.includes('retroPlayer')) layers.push(['blend', ctx.globalAlpha]); };
    globalThis.renderCherry = mix => GameRenderer.render(0, { maze, player, ghosts, animFrame, powerTimer,
      gameState: 'paused', cherryBonus: { fruit: { x: 224, y: 232 } }, retroWorld: { mix } });`);
  for (const mix of [0.001, 0.5, 1, 0.5]) {
    game.run(`layers.length = 0; renderCherry(${mix});`);
    const layers = JSON.parse(game.run('JSON.stringify(layers)'));
    assert.deepEqual(layers, [['cherry', false, 'retro'], 'retroPlayer', ['blend', mix]]);
  }
  game.run('layers.length = 0; renderCherry(0);');
  assert.equal(game.run('layers.length'), 0, 'even stale fruit state cannot draw a cherry in the city');
});
