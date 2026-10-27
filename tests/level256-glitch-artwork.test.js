const assert = require('node:assert/strict');
const test = require('node:test');
const CityLayout = require('../scripts/rendering/city-layout');
const Artwork = require('../scripts/rendering/level256-glitch');
const { boot } = require('./helpers/game-harness');

const maze = Array.from({ length: 31 }, (_, row) =>
  Array.from({ length: 28 }, (_, col) => row % 4 === 0 || col % 5 === 0 ? 0 : 2));
const layout = CityLayout.create(maze, 16);
const effect = { phase: 'lamps', age: 60, duration: 132, ticksPerSecond: 60, seed: 256 };

function paint(artwork, visual) {
  const calls = [];
  const ctx = new Proxy({}, {
    set(_, key, value) { calls.push(['set', key, value]); return true; },
    get(_, key) { return (...args) => calls.push([key, ...args]); }
  });
  const before = structuredClone(visual);
  artwork.draw(ctx, visual);
  assert.deepEqual(visual, before, 'painting does not mutate effect data');
  let depth = 0;
  for (const [method] of calls) {
    if (method === 'save') depth++;
    if (method === 'restore') depth--;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0, 'clipping, styles and alpha must be restored');
  return calls;
}

test('seeded fragments are deterministic, local, contain pixel fruits and leave most of the map intact', () => {
  const before = structuredClone(layout);
  for (const seed of [0, 1, 256, 65535, 4294967295]) {
    const pattern = Artwork.createPattern(layout, seed);
    assert.deepEqual(pattern, Artwork.createPattern(layout, seed));
    assert.ok(pattern.cluster.some(cell => cell.kind === 'glyph' && cell.value === '256'));
    assert.ok(pattern.cluster.filter(cell => cell.kind === 'fruit').length >= 2);
    assert.deepEqual(pattern.cluster.filter(cell => cell.kind === 'fruit').map(cell => cell.variant), [0, 1]);
    assert.ok(pattern.symbols.some(cell => /[┐└╬▒░⌐]/.test(cell.value)));
    for (const [kind, cells] of [['cluster', pattern.cluster], ['symbols', pattern.symbols]]) {
      for (const cell of cells) {
        assert.ok(cell.x >= 0 && cell.y >= 0);
        assert.ok(cell.x + (cell.width || cell.size) <= (kind === 'symbols' ? layout.width * 0.21 : layout.width) + 1e-7);
        assert.ok(cell.y + cell.size <= layout.height);
      }
    }
    assert.ok(Math.max(...pattern.cluster.map(cell => cell.x + (cell.width || cell.size))) -
      Math.min(...pattern.cluster.map(cell => cell.x)) <= layout.tile * 6);
  }
  assert.notDeepEqual(Artwork.createPattern(layout, 1), Artwork.createPattern(layout, 256));
  assert.deepEqual(layout, before);
});

test('small and lampless layouts still produce bounded fragments without invalid coordinates', () => {
  for (const grid of [[[0]], [[1]], [[0, 1], [1, 0]]]) {
    const city = CityLayout.create(grid, 12);
    const pattern = Artwork.createPattern(city, 2);
    for (const cell of [...pattern.cluster, ...pattern.symbols]) {
      assert.ok(Number.isFinite(cell.x) && Number.isFinite(cell.y) && cell.size > 0);
      assert.ok(cell.x + (cell.width || cell.size) <= city.width + 1e-7);
      assert.ok(cell.y + cell.size <= city.height + 1e-7);
    }
    assert.equal(Artwork.create(city).frame(effect).lampLevels.length, city.lamps.length);
  }
});

test('only three individual lamps dip gently, staggered in time, and never go black', () => {
  const artwork = Artwork.create(layout);
  const dimmed = new Set();
  let previous;
  for (let age = 0; age < effect.duration; age++) {
    const { lampLevels } = artwork.frame({ ...effect, age });
    assert.equal(lampLevels.length, layout.lamps.length);
    lampLevels.forEach((level, index) => {
      assert.ok(level >= 0.28 - 1e-7 && level <= 1);
      if (level < 1) dimmed.add(index);
      if (previous) assert.ok(Math.abs(level - previous[index]) < 0.12, 'no abrupt strobing');
    });
    previous = lampLevels;
  }
  assert.equal(dimmed.size, 3);
  const selected = Artwork.createPattern(layout, effect.seed).lamps;
  const early = artwork.frame({ ...effect, age: 10 }).lampLevels;
  assert.ok(early[selected[0]] < 1);
  assert.equal(early[selected[1]], 1);
  assert.equal(early[selected[2]], 1);
  assert.notDeepEqual(artwork.frame(effect), artwork.frame({ ...effect, age: 90 }));
});

test('reduced motion uses stationary dimming and static fragments, without jitter or repeated flashes', () => {
  const artwork = Artwork.create(layout);
  assert.deepEqual(artwork.frame({ ...effect, age: 10 }, { reducedMotion: true }),
    artwork.frame({ ...effect, age: 120 }, { reducedMotion: true }));
  for (const phase of ['cluster', 'symbols']) {
    const first = artwork.frame({ ...effect, phase, age: 15, duration: 63 }, { reducedMotion: true });
    const last = artwork.frame({ ...effect, phase, age: 40, duration: 63 }, { reducedMotion: true });
    assert.deepEqual(paint(artwork, first), paint(artwork, last));
    assert.ok(first.opacity < 0.6);
  }
});

test('corruption draws themed glyphs, checker blocks and pixel fruit, then fades and cleans up completely', () => {
  const artwork = Artwork.create(layout);
  for (const phase of ['cluster', 'symbols']) {
    const visual = artwork.frame({ ...effect, phase, duration: 63, age: 20 });
    const calls = paint(artwork, visual);
    assert.ok(calls.some(([method]) => method === 'clip'));
    assert.ok(calls.some(([method]) => method === 'fillText'));
    assert.ok(calls.filter(([method]) => method === 'fillRect').length > visual.cells.length);
    for (const color of ['#c99558', '#78aaa5', '#c07867']) {
      assert.ok(calls.some(([method, key, value]) => method === 'set' && key === 'fillStyle' && value === color));
    }
    const faded = artwork.frame({ ...effect, phase, duration: 63, age: 62 });
    assert.ok(faded.opacity < visual.opacity);
    assert.deepEqual(paint(artwork, artwork.frame({ ...effect, phase, age: 63, duration: 63 })), []);
  }
  assert.deepEqual(paint(artwork, null), []);
  assert.deepEqual(paint(artwork, artwork.frame(effect)), [], 'lamp phase has no corruption overlay');
});

test('patterns are cached throughout an event and refreshed for a new seed', () => {
  const artwork = Artwork.create(layout);
  const first = artwork.frame({ ...effect, phase: 'cluster' });
  const later = artwork.frame({ ...effect, phase: 'cluster', age: 61 });
  assert.equal(first.cells, later.cells);
  assert.notEqual(first.cells, artwork.frame({ ...effect, phase: 'cluster', seed: 257 }).cells);
});

test('the shared overlay stays below collectibles and actors in any environment', () => {
  const game = boot(); game.click();
  game.run(`globalThis.layers = [];
    const createArtwork = Level256GlitchArtwork.create;
    Level256GlitchArtwork.create = layout => {
      const artwork = createArtwork(layout);
      return { frame: artwork.frame, draw() { layers.push('corruption'); } };
    };
    resetLevel(false);
    level256Glitch.state.ticksUntilGlitch = 1; level256Glitch.update();
    Object.assign(level256Glitch.state.effect, { phase: 'cluster', age: 20, duration: 63 });
    GameRenderer.setEnvironment({ setLayout() {}, draw() { layers.push('city'); } });
    const arc = ctx.arc; ctx.arc = (...args) => { if (args[2] === 1.8) layers.push('dot'); arc(...args); };
    GameRenderer.setActors({ player() { layers.push('player'); }, ghosts() { layers.push('ghosts'); } });`);
  game.advance();
  const layers = JSON.parse(game.run('JSON.stringify(layers)'));
  assert.equal(layers[0], 'city');
  assert.equal(layers[1], 'corruption');
  assert.ok(layers.indexOf('dot') > layers.indexOf('corruption'));
  assert.ok(layers.indexOf('player') > layers.lastIndexOf('dot'));
  assert.ok(layers.indexOf('ghosts') > layers.indexOf('player'));
});

test('Canvas lamps dim their real light pools and restore them after the event', () => {
  const game = boot();
  const city = game.run('CanvasCity.create({ createCanvas: () => document.createElement("canvas") })');
  city.setLayout(layout);
  const colors = [];
  const ctx = { drawImage() {}, save() {}, restore() {}, fillRect() {},
    createRadialGradient: () => ({ addColorStop(stop, color) { if (stop === 0) colors.push(color); } }) };
  city.draw(ctx, { time: 0, reducedMotion: true });
  const baseline = colors.splice(0);
  const visual = Artwork.create(layout).frame(effect, { reducedMotion: true });
  city.draw(ctx, { time: 0, reducedMotion: true, lampLevels: visual.lampLevels });
  const dimmed = colors.splice(0);
  assert.equal(dimmed.filter((color, i) => color !== baseline[i]).length, 3);
  city.draw(ctx, { time: 0, reducedMotion: true });
  assert.deepEqual(colors, baseline);
});

test('the shared renderer passes per-lamp dimming to the environment and hides corruption during death', () => {
  const game = boot({ random: () => 0, reducedMotion: true }); game.click();
  game.run(`globalThis.lightFrames = []; player.speed = 0;
    GameRenderer.setEnvironment({ setLayout() {}, draw(ctx, frame) { lightFrames.push(frame.lampLevels); } });
    level256Glitch.state.ticksUntilGlitch = 1; level256Glitch.update();`);
  game.advance();
  assert.equal(game.run('lightFrames.at(-1).filter(level => level < 1).length'), 3);
  game.run(`Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
  game.advance();
  assert.equal(game.run('lightFrames.at(-1)'), undefined);
  game.respawn(); game.advance();
  assert.equal(game.run('lightFrames.at(-1).filter(level => level < 1).length'), 3);
});
