const assert = require('node:assert/strict');
const test = require('node:test');
const Artwork = require('../scripts/rendering/retro-world');
const { boot } = require('./helpers/game-harness');

function recording() {
  const calls = [], stack = [];
  const state = { fillStyle: '#123456', strokeStyle: '#654321', lineWidth: 3, globalAlpha: 0.75 };
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

function create(maze, tile = 16) {
  const background = recording();
  const canvas = { getContext: () => background.ctx };
  const before = structuredClone(maze);
  const artwork = Artwork.create(maze, tile, { createCanvas: () => canvas });
  assert.deepEqual(maze, before);
  return { artwork, background, canvas };
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

test('all 3×3 wall patterns produce closed blue double contours without internal tile seams', () => {
  for (let mask = 0; mask < 512; mask++) {
    const maze = Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 3 }, (_, col) => mask & (1 << (row * 3 + col)) ? 0 : 1));
    const { background, canvas } = create(maze);
    const calls = background.calls;
    const boundaryEdges = maze.reduce((total, row, r) => total + row.reduce((sum, cell, c) => sum +
      (cell === 0 ? [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => maze[r + dy]?.[c + dx] !== 0).length : 0), 0), 0);
    assert.equal(calls.filter(([method]) => method === 'quadraticCurveTo').length, boundaryEdges, `pattern ${mask}`);
    assert.equal(calls.filter(([method]) => method === 'closePath').length,
      calls.filter(([method]) => method === 'moveTo').length);
    assert.deepEqual([canvas.width, canvas.height], [48, 48]);
    assert.ok(calls.some(([method, key, value]) => method === 'set' && key === 'strokeStyle' && value === '#2121ff'));
    assert.deepEqual(calls.find(([method]) => method === 'fillRect'), ['fillRect', 0, 0, 48, 48]);
    assert.equal(calls.filter(([method]) => method === 'stroke').length, 2);
  }
  for (const [maze, loops] of [[[[0, 0]], 1], [[[0, 1], [1, 0]], 2],
    [[[0, 0, 0], [0, 1, 0], [0, 0, 0]], 2]]) {
    assert.equal(create(maze).background.calls.filter(([method]) => method === 'closePath').length, loops);
  }
});

test('the black maze is cached but pellets, power pellets and the house door use the live grid', () => {
  const maze = [[0, 2, 3, 4, 1]], { artwork, background } = create(maze);
  const cached = structuredClone(background.calls);
  const record = recording(), before = structuredClone(record.state);
  artwork.drawMaze(record.ctx, maze);
  assert.deepEqual(record.state, before);
  assert.ok(record.calls.some(([method, x, y, w, h]) => method === 'fillRect' && x === 23 && y === 7 && w === 2 && h === 2));
  assert.ok(record.calls.some(([method, x, y, radius]) => method === 'arc' && x === 40 && y === 8 && radius === 16 * 0.28));
  assert.ok(record.calls.some(([method, x, y, w, h]) => method === 'fillRect' && x === 48 && y === 6.4 && w === 16 && h === 2));
  maze[0][1] = 1; maze[0][2] = 1;
  record.calls.length = 0;
  artwork.drawMaze(record.ctx, maze);
  assert.equal(record.calls.some(([method]) => method === 'arc'), false);
  assert.equal(record.calls.filter(([method]) => method === 'fillRect').length, 1, 'only the door remains');
  assert.deepEqual(background.calls, cached, 'collecting never rebuilds the static blue walls');
});

test('the original yellow player keeps its position, bite and all four headings without weathered shading', () => {
  for (const tile of [12, 16, 64]) for (const dir of [0, 1, 2, 3]) {
    const actor = { x: 120, y: 88, alive: true, mouth: 0.6, dir };
    const calls = paint('player', actor, { tile });
    assert.ok(calls.some(([method, key, value]) => method === 'set' && key === 'fillStyle' && value === '#ffff00'));
    assert.deepEqual(calls.find(([method]) => method === 'translate'), ['translate', 120, 88]);
    assert.deepEqual(calls.find(([method]) => method === 'rotate'), ['rotate', dir * Math.PI / 2]);
    assert.deepEqual(calls.find(([method]) => method === 'arc'), ['arc', 0, 0, 0.45, 0.56, Math.PI * 2 - 0.56]);
    assert.equal(calls.some(([method]) => /Gradient|ellipse/.test(method)), false);
  }
  assert.deepEqual(paint('player', { alive: false }), []);
});

test('arcade ghosts have the four original colors, directional eyes and distinct frightened/eyes-only states', () => {
  for (const [color, expected] of ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'].entries()) {
    for (const dir of [0, 1, 2, 3]) {
      const ghost = { x: 40, y: 72, color, dir, mode: 'chase', scared: false };
      const calls = paint('ghosts', [ghost]);
      assert.ok(calls.some(([method, key, value]) => method === 'set' && key === 'fillStyle' && value === expected));
      assert.equal(calls.filter(([method]) => method === 'ellipse').length, 2);
      const frightened = paint('ghosts', [{ ...ghost, scared: true }], { powerTimer: 400 });
      assert.ok(frightened.some(([method, key, value]) => method === 'set' && key === 'fillStyle' && value === '#2121ff'));
      assert.ok(frightened.some(([method]) => method === 'stroke'), 'frightened zigzag mouth remains readable');
      const eyes = paint('ghosts', [{ ...ghost, mode: 'eyes', scared: true }]);
      assert.equal(eyes.some(([method]) => method === 'arc' || method === 'closePath'), false);
      assert.equal(eyes.filter(([method]) => method === 'ellipse').length, 2);
      const pupils = calls.filter(([method]) => method === 'fillRect');
      const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
      assert.deepEqual(pupils[0], ['fillRect', -0.18 + dx * 0.06 - 0.06, -0.18 + dy * 0.065, 0.12, 0.12]);
    }
  }
  assert.deepEqual(paint('ghosts', [{ mode: 'house', houseTimer: 31 }]), []);
});

test('reduced motion freezes arcade feet and expiry flashes, while regular animation can change them', () => {
  const ghost = { x: 8, y: 8, dir: 0, color: 0, mode: 'chase', scared: true };
  assert.deepEqual(paint('ghosts', [ghost], { time: 0, powerTimer: 100, reducedMotion: true }),
    paint('ghosts', [ghost], { time: 0.3, powerTimer: 100, reducedMotion: true }));
  assert.notDeepEqual(paint('ghosts', [ghost], { time: 0, powerTimer: 100 }),
    paint('ghosts', [ghost], { time: 0.3, powerTimer: 100 }));
});

test('the complete retro layer blends after atmosphere, but below death and bonus feedback', () => {
  const game = boot(); game.click();
  game.run(`globalThis.layers = [];
    const createRetro = RetroWorldArtwork.create;
    RetroWorldArtwork.create = (...args) => {
      const artwork = createRetro(...args);
      return { drawMaze(ctx, maze) { layers.push('retroMaze'); artwork.drawMaze(ctx, maze); } };
    };
    resetLevel(false);
    GameRenderer.setEnvironment({ setLayout() {}, draw() { layers.push('environment'); } });
    GameRenderer.setActors({ player() { layers.push('modernPlayer'); }, ghosts() { layers.push('modernGhosts'); } });
    RetroWorldArtwork.player = () => layers.push('retroPlayer');
    RetroWorldArtwork.ghosts = () => layers.push('retroGhosts');
    BonusLifeArtwork.drawCoin = () => layers.push('coin');
    PlayerDeathArtwork.draw = () => layers.push('death');
    BonusLifeArtwork.drawEffect = () => layers.push('bonus');
    ctx.drawImage = () => layers.push(['image', ctx.globalAlpha]);
    GameRenderer.render(0, { maze, player, ghosts, animFrame, powerTimer, gameState: 'paused', retroWorld: { mix: 0.5 } });`);
  const layers = JSON.parse(game.run('JSON.stringify(layers)'));
  assert.ok(layers.indexOf('retroMaze') > layers.indexOf('modernGhosts'));
  assert.deepEqual(layers.slice(layers.indexOf('retroMaze')), [
    'retroMaze', 'coin', 'retroPlayer', 'retroGhosts', ['image', 0.5], 'death', 'bonus'
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
