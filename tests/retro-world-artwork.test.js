const assert = require('node:assert/strict');
const test = require('node:test');
const Artwork = require('../scripts/rendering/retro-world');
const RetroCityArtwork = require('../scripts/rendering/retro-city');
const CityLayout = require('../scripts/rendering/city-layout');
const CityView = require('../scripts/rendering/city-view');
const CityArchitecture = require('../scripts/rendering/city-architecture');
const BonusArtwork = require('../scripts/rendering/bonus-life');
const FreezeArtwork = require('../scripts/rendering/freeze-powerups');
const PlayerDeath = require('../scripts/player-death');
const { boot } = require('./helpers/game-harness');

function recording() {
  const calls = [], stack = [];
  const state = { fillStyle: '#123456', strokeStyle: '#654321', lineWidth: 3, globalAlpha: 0.75, imageSmoothingEnabled: true };
  const ctx = new Proxy(state, {
    set(target, key, value) { calls.push(['set', key, value]); target[key] = value; return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        calls.push([key, ...args]);
        if (key === 'save') stack.push({ ...state });
        if (key === 'restore') {
          assert.ok(stack.length, 'restore must have a matching save');
          const saved = stack.pop();
          for (const name of Object.keys(state)) delete state[name];
          Object.assign(state, saved);
        }
      };
    }
  });
  return { ctx, calls, state, stack };
}

function paint(method, actors, options = {}) {
  const record = recording(), before = structuredClone(record.state);
  const settings = { tile: 16, dirs: [[1, 0], [0, 1], [-1, 0], [0, -1]], ...options };
  const snapshot = structuredClone({ actors, settings });
  Artwork[method](record.ctx, actors, settings);
  assert.deepEqual({ actors, settings }, snapshot);
  assert.deepEqual(record.state, before, 'artwork must restore Canvas styles and alpha');
  assert.equal(record.stack.length, 0);
  return record.calls;
}

function pixels(calls, color) {
  const result = new Set();
  let fill;
  for (const [method, ...args] of calls) {
    if (method === 'set' && args[0] === 'fillStyle') fill = args[1];
    if (method !== 'fillRect' || (color && fill !== color)) continue;
    const [x, y, width, height] = args;
    assert.ok(args.every(Number.isInteger), 'bitmap rectangles must use whole pixel coordinates');
    for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) result.add(`${col},${row}`);
  }
  return result;
}

test('pixel buildings paint the projected roofs, facades and street grid with whole-pixel spans', () => {
  const maze = [[1, 1, 1, 1], [1, 0, 0, 1], [1, 1, 1, 1]];
  const layout = CityLayout.create(maze, 16);
  const record = recording();
  const before = structuredClone(layout);
  RetroCityArtwork.paint(record.ctx, layout);
  assert.deepEqual(layout, before);
  assert.deepEqual(record.calls.find(([method]) => method === 'fillRect'),
    ['fillRect', 0, 0, layout.view.width, layout.view.height]);
  const image = new Map();
  let color;
  for (const [method, x, y, width, height] of record.calls) {
    if (method === 'set' && x === 'fillStyle') {
      color = y;
      assert.ok(RetroCityArtwork.colors.includes(color));
    }
    if (method !== 'fillRect') continue;
    assert.ok([x, y, width, height].every(Number.isInteger));
    for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) {
      image.set(`${col},${row}`, color);
    }
  }
  const sample = (x, y, z) => {
    const [u, v] = CityView.project(layout.view, x, y, z).map(Math.floor);
    return image.get(`${u},${v}`);
  };
  const [block] = layout.buildings;
  const roof = CityArchitecture.building(block, layout.tile)[2];
  assert.equal(sample(8, 8, 0), '#141d39');
  assert.ok(['#2b3d66', '#30586d', '#453d6a'].includes(sample(roof.x + 7, roof.y + 5, roof.z + roof.height)));
  assert.ok(new Set(image.values()).size > 9, 'roofs, faces and windows must render distinctly');
});

test('pixel pellets and the depot gate use the current maze cells', () => {
  const maze = [[0, 2, 3, 4, 1]], layout = CityLayout.create(maze, 16);
  const record = recording(), before = structuredClone(record.state);
  Artwork.drawCollectibles(record.ctx, maze, layout);
  assert.deepEqual(record.state, before);
  assert.ok(record.calls.some(([method, x, y, w, h]) => method === 'fillRect' && x === 22 && y === 6 && w === 4 && h === 4));
  assert.ok(record.calls.some(([method, x, y, w, h]) => method === 'fillRect' && x === -2 && y === -4 && w === 4 && h === 1));
  assert.ok(record.calls.some(([method, x, y, w, h]) => method === 'fillRect' && x === 48 && y === 6 && w === 16 && h === 2));
  maze[0][1] = 1; maze[0][2] = 1;
  record.calls.length = 0;
  Artwork.drawCollectibles(record.ctx, maze, layout);
  assert.equal(record.calls.some(([method]) => method === 'arc'), false);
  assert.equal(record.calls.filter(([method]) => method === 'fillRect').length, 1, 'only the door remains');
});

test('the yellow player uses whole-pixel bitmaps, snapped artwork and all four bite headings at every scale', () => {
  for (const tile of [12, 16, 64]) for (const dir of [0, 1, 2, 3]) {
    const actor = { x: 120, y: 88, alive: true, mouth: 0.6, dir };
    const calls = paint('player', actor, { tile });
    assert.ok(calls.some(([method, key, value]) => method === 'set' && key === 'fillStyle' && value === '#ffff00'));
    const pixel = tile / 16;
    assert.deepEqual(calls.find(([method]) => method === 'translate'), ['translate', Math.round(120 / pixel) * pixel, Math.round(88 / pixel) * pixel]);
    assert.deepEqual(calls.find(([method]) => method === 'scale'), ['scale', pixel, pixel]);
    const body = pixels(calls), [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
    assert.equal(body.has(`${dx * 5},${dy * 5}`), false, 'open bite faces the movement direction');
    assert.equal(body.has(`${-dx * 5},${-dy * 5}`), true, 'the opposite side keeps its round pixel silhouette');
    assert.equal(calls.some(([method]) => /Gradient|ellipse|arc|rotate|stroke/.test(method)), false);
  }
  assert.deepEqual(paint('player', { alive: false }), []);
  const actor = { x: -4.3, y: 88.6, alive: true, dir: 0 };
  const frames = [0, 0.3, 0.6].map(mouth => JSON.stringify(paint('player', { ...actor, mouth })));
  assert.equal(new Set(frames).size, 3, 'the bite animates through three discrete pixel frames');
  assert.deepEqual(paint('player', { ...actor, mouth: 0.6 }).find(([method]) => method === 'translate'), ['translate', -4, 89]);
});

test('arcade ghosts have the four original colors, directional eyes and distinct frightened/eyes-only states', () => {
  for (const [color, expected] of ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'].entries()) {
    for (const dir of [0, 1, 2, 3]) {
      const ghost = { x: 40, y: 72, color, dir, mode: 'chase', scared: false };
      const calls = paint('ghosts', [ghost]);
      assert.ok(calls.some(([method, key, value]) => method === 'set' && key === 'fillStyle' && value === expected));
      assert.equal(calls.some(([method]) => /arc|ellipse|stroke|Curve/.test(method)), false);
      pixels(calls);
      const frightened = paint('ghosts', [{ ...ghost, scared: true }], { powerTimer: 400 });
      assert.ok(frightened.some(([method, key, value]) => method === 'set' && key === 'fillStyle' && value === '#2121ff'));
      assert.equal(frightened.filter(([method, , y, w, h]) => method === 'fillRect' && (y === 3 || y === 4) && w === 1 && h === 1).length, 8,
        'frightened zigzag mouth is made of eight pixels');
      const eyes = paint('ghosts', [{ ...ghost, mode: 'eyes', scared: true }]);
      assert.equal(eyes.filter(([method]) => method === 'fillRect').length, 6, 'eyes-only ghosts omit the body bitmap');
      const pupils = calls.filter(([method, , , w, h]) => method === 'fillRect' && w === 2 && h === 3);
      const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
      assert.deepEqual(pupils[0], ['fillRect', -4 + dx, -3 + dy, 2, 3]);
    }
  }
  assert.deepEqual(paint('ghosts', [{ mode: 'house', houseTimer: 31 }]), []);
});

test('retro coins, freeze finds and ice use the same snapped pixel grid without gradients or curved paths', () => {
  for (const draw of [
    ctx => BonusArtwork.drawCoin(ctx, { x: 40.4, y: 72.7 }, { tile: 16, world: 'retro' }),
    ctx => FreezeArtwork.drawPickups(ctx, { pickups: [{ x: 40.4, y: 72.7, kind: 'lantern' },
      { x: 40.4, y: 72.7, kind: 'watch' }] }, { tile: 16, world: 'retro' }),
    ctx => FreezeArtwork.drawFrozenGhosts(ctx, [{ x: 40.4, y: 72.7, mode: 'chase' }], { tile: 16, world: 'retro', frozen: true })
  ]) {
    const record = recording(), before = structuredClone(record.state);
    draw(record.ctx);
    assert.deepEqual(record.state, before);
    assert.equal(record.stack.length, 0);
    assert.ok(pixels(record.calls).size > 0);
    assert.deepEqual(record.calls.find(([method]) => method === 'translate'), ['translate', 40, 73]);
    assert.equal(record.calls.some(([method]) => /Gradient|arc|ellipse|stroke|rotate/.test(method)), false);
  }
});

test('retro coin rotation has discrete frames and reduced motion keeps its pixels stationary', () => {
  function coin(time, reducedMotion) {
    const record = recording();
    BonusArtwork.drawCoin(record.ctx, { x: 40, y: 72 }, { tile: 16, world: 'retro', time, reducedMotion });
    return record.calls;
  }
  assert.deepEqual(coin(0, false), coin(0.1, false));
  assert.notDeepEqual(coin(0, false), coin(0.5, false));
  assert.deepEqual(coin(0, true), coin(20, true));
});

test('retro death starts with the exact live yellow sprite in every heading and mouth frame', () => {
  for (const dir of [0, 1, 2, 3]) for (const mouth of [0, 0.3, 0.6]) {
    const actor = { x: 120, y: 88, dir, mouth, alive: true };
    const effect = PlayerDeath.create(actor).state;
    assert.deepEqual(pixels(paint('death', effect), '#ffff00'),
      pixels(paint('player', actor), '#ffff00'), `heading ${dir}, mouth ${mouth}`);
  }
});

test('retro feedback stays on the pixel grid through motion, late fading and reduced motion', () => {
  const death = PlayerDeath.create({ x: 120.4, y: 88.7, dir: 0, mouth: 0.3 }).state;
  const life = { x: 120.4, y: 24, age: 0, duration: 72 };
  for (const [method, effect] of [['death', death], ['lifeEffect', life]]) {
    for (const reducedMotion of [false, true]) for (const tile of [12, 16, 64]) {
      const frames = [0, 0.3, 0.9].map(progress => paint(method,
        { ...effect, age: Math.floor(effect.duration * progress) }, { tile, reducedMotion }));
      for (const calls of frames) {
        assert.ok(pixels(calls).size > 0, `${method} must remain visible until expiry`);
        assert.equal(calls.some(([name]) => /Gradient|arc|ellipse|rotate|stroke|Text/.test(name)), false);
      }
      if (reducedMotion) assert.deepEqual(frames[0], frames[1], 'early frames remain stationary');
      else assert.notDeepEqual(frames[0], frames[1], 'regular animation still moves');
    }
    assert.deepEqual(paint(method, null), []);
    assert.deepEqual(paint(method, { ...effect, age: effect.duration }), []);
  }
});

test('the pixel world indicator follows the transition and clears on restart', () => {
  const game = boot(); game.click(); game.key('p');
  const canvas = game.elements.get('gameCanvas');
  for (const mix of [0, 0.5, 1, 0.5, 0]) {
    game.run(`retroWorld.state.mix = ${mix};`); game.advance();
    assert.equal(canvas.dataset.world, mix > 0 ? 'retro' : 'city');
  }
  game.run('retroWorld.state.mix = 1;'); game.advance(); game.click(); game.advance();
  assert.equal(canvas.dataset.world, 'city');
});

test('reduced motion freezes arcade feet and expiry flashes, while regular animation can change them', () => {
  const ghost = { x: 8, y: 8, dir: 0, color: 0, mode: 'chase', scared: true };
  assert.deepEqual(paint('ghosts', [ghost], { time: 0, powerTimer: 100, reducedMotion: true }),
    paint('ghosts', [ghost], { time: 0.3, powerTimer: 100, reducedMotion: true }));
  assert.notDeepEqual(paint('ghosts', [ghost], { time: 0, powerTimer: 100 }),
    paint('ghosts', [ghost], { time: 0.3, powerTimer: 100 }));
});

test('the complete retro layer blends after atmosphere, including its death and bonus feedback', () => {
  const game = boot(); game.click();
  game.run(`globalThis.layers = [];
    const collectibles = RetroWorldArtwork.drawCollectibles;
    RetroWorldArtwork.drawCollectibles = (...args) => {
      layers.push('retroMaze'); collectibles(...args);
    };
    resetLevel(false);
    GameRenderer.setEnvironment({ setLayout() {}, draw() { layers.push('environment'); } });
    GameRenderer.setActors({ player() { layers.push('modernPlayer'); }, ghosts() { layers.push('modernGhosts'); } });
    RetroWorldArtwork.player = () => layers.push('retroPlayer');
    RetroWorldArtwork.ghosts = () => layers.push('retroGhosts');
    BonusLifeArtwork.drawCoin = () => layers.push('coin');
    PlayerDeathArtwork.draw = () => layers.push('death');
    BonusLifeArtwork.drawEffect = () => layers.push('bonus');
    RetroWorldArtwork.death = () => layers.push('retroDeath');
    RetroWorldArtwork.lifeEffect = () => layers.push('retroBonus');
    ctx.drawImage = () => layers.push(['image', ctx.globalAlpha]);
    GameRenderer.render(0, { maze, player, ghosts, animFrame, powerTimer, gameState: 'paused', retroWorld: { mix: 0.5 } });`);
  const layers = JSON.parse(game.run('JSON.stringify(layers)'));
  assert.ok(layers.indexOf('retroMaze') > layers.indexOf('modernGhosts'));
  assert.ok(layers.indexOf('death') < layers.indexOf('retroMaze'));
  assert.ok(layers.indexOf('bonus') < layers.indexOf('retroMaze'));
  assert.deepEqual(layers.slice(layers.indexOf('retroMaze')), [
    'retroMaze', 'coin', 'retroPlayer', 'retroGhosts', 'retroDeath', 'retroBonus', ['image', 0.5]
  ]);
});

test('the 1980 layer keeps tunnel copies, current actor positions and live reduced-motion settings', () => {
  const game = boot({ reducedMotion: true }); game.click(); game.key('p');
  game.run(`globalThis.retroActors = [];
    RetroWorldArtwork.player = (ctx, actor, options) => retroActors.push(['player', actor.x, options.reducedMotion]);
    RetroWorldArtwork.ghosts = (ctx, roster, options) => retroActors.push(['ghosts', roster.map(ghost => ghost.x), options.reducedMotion]);
    Object.assign(player, { x: -4, y: 11.5 * TILE });
    ghosts = [{ ...ghosts[0], x: COLS * TILE - 12, y: 11.5 * TILE, mode: 'chase' }];
    retroWorld.state.mix = 1;`);
  const before = game.run('JSON.stringify({ player, ghosts, maze })');
  game.advance();
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(retroActors)')), [
    ['player', -4, true], ['player', -4, true], ['ghosts', [436], true], ['ghosts', [436], true]
  ]);
  game.setReducedMotion(false);
  game.run('retroActors.length = 0;'); game.advance();
  assert.equal(game.run('retroActors.every(actor => actor[2] === false)'), true);
  assert.equal(game.run('JSON.stringify({ player, ghosts, maze })'), before);
});

test('a GPU failure during the retro visit preserves the classic layer and returns to Canvas', () => {
  const game = boot(); game.click(); game.key('p');
  game.run(`globalThis.retroPaints = 0;
    RetroWorldArtwork.player = () => retroPaints++;
    GameRenderer.setEnvironment({ name: 'gpu', setLayout() {}, draw() { throw new Error('GPU lost'); } });
    retroWorld.state.mix = 1;`);
  game.advance();
  assert.equal(game.elements.get('gameCanvas').dataset.renderer, 'canvas');
  assert.equal(game.run('retroPaints'), 1);
  assert.equal(game.run('retroWorld.state.mix'), 1);
  assert.equal(game.elements.get('worldClock').textContent, '1980');
});
