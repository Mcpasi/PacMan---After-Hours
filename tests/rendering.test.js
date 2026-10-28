const assert = require('node:assert/strict');
const test = require('node:test');
const CityLayout = require('../scripts/rendering/city-layout');
const { boot } = require('./helpers/game-harness');

test('city generation is deterministic and does not change the collision grid', () => {
  const game = boot();
  const maze = JSON.parse(game.run('JSON.stringify(maze)'));
  const before = structuredClone(maze);
  const first = CityLayout.create(maze, 16);
  assert.deepEqual(first, CityLayout.create(maze, 16));
  assert.deepEqual(maze, before);
  assert.equal(first.width, 448);
  assert.equal(first.height, 496);
  assert.ok(first.buildings.some(building => building.cols > 1 && building.rows > 1));
  assert.ok(first.lamps.length >= 12 && first.lamps.length <= 32);
});

test('building footprints cover all and only collision walls without overlaps', () => {
  const game = boot();
  const maze = JSON.parse(game.run('JSON.stringify(maze)'));
  const city = CityLayout.create(maze, 16);
  const coverage = maze.map(row => row.map(() => 0));
  for (const building of city.buildings) {
    for (let r = building.row; r < building.row + building.rows; r++) {
      for (let c = building.col; c < building.col + building.cols; c++) coverage[r][c]++;
    }
  }
  maze.forEach((row, r) => row.forEach((cell, c) => assert.equal(coverage[r][c], cell === 0 ? 1 : 0, `${r},${c}`)));
});

test('lamps stay beside walkable streets, within bounds, and well separated', () => {
  const game = boot();
  const maze = JSON.parse(game.run('JSON.stringify(maze)'));
  const city = CityLayout.create(maze, 16);
  for (const [i, lamp] of city.lamps.entries()) {
    assert.notEqual(maze[Math.floor(lamp.y / 16)][Math.floor(lamp.x / 16)], 0);
    assert.notEqual(maze[lamp.row][lamp.col], 4);
    assert.ok(lamp.x > 0 && lamp.x < city.width && lamp.y > 0 && lamp.y < city.height);
    for (const other of city.lamps.slice(i + 1)) assert.ok(Math.hypot(lamp.x - other.x, lamp.y - other.y) >= 48);
  }
});

test('layout handles small, empty-street, and irregular-wall maps and rejects invalid dimensions', () => {
  for (const maze of [[[0]], [[1]], [[0, 0, 1], [0, 1, 0], [0, 0, 0]]]) {
    const city = CityLayout.create(maze, 12);
    assert.equal(city.width, maze[0].length * 12);
    assert.equal(city.buildings.reduce((total, block) => total + block.cols * block.rows, 0), maze.flat().filter(cell => cell === 0).length);
  }
  for (const [maze, tile] of [[[], 16], [[[]], 16], [[[1], []], 16], [[[1]], 0], [[[1]], NaN]]) {
    assert.throws(() => CityLayout.create(maze, tile), TypeError);
  }
});

test('without WebGL the cached Canvas city draws lights, atmosphere and unchanged actors', () => {
  const game = boot();
  const before = game.run('JSON.stringify({ maze, player, ghosts })');
  game.drawing.length = 0;
  game.advance(3);
  assert.equal(game.elements.get('gameCanvas').dataset.renderer, 'canvas');
  assert.ok(game.drawing.some(([method]) => method === 'drawImage'));
  assert.ok(game.drawing.some(([method]) => method === 'createRadialGradient'));
  assert.ok(game.drawing.some(([method]) => method === 'translate'));
  assert.equal(game.drawing.filter(([method]) => method === 'fillText').length, 0, 'static rooftop/ground details are cached');
  assert.equal(game.run('JSON.stringify({ maze, player, ghosts })'), before);
  assert.equal(game.frames.length, 1);
});

test('an unavailable Three.js import never delays Start or stops Canvas rendering', async () => {
  const game = boot({ webgl: true });
  game.click();
  await new Promise(resolve => setImmediate(resolve));
  game.advance(20);
  assert.equal(game.elements.get('gameCanvas').dataset.renderer, 'canvas');
  assert.equal(game.run('gameState'), 'playing');
  assert.ok(game.run('player.x > 13.5 * TILE'));
  assert.equal(game.frames.length, 1);
});

test('player and enemy skins can be replaced independently without affecting gameplay', () => {
  const game = boot();
  game.run('globalThis.calls = []; GameRenderer.setActors({ player: (ctx, player, options) => calls.push([player.x, options.tile]) });');
  game.click();
  game.advance(3);
  assert.equal(game.run('calls.length'), 3);
  assert.equal(game.run('calls[0][1]'), 16);
  assert.ok(game.run('calls[2][0] > calls[0][0]'));
  assert.ok(game.drawing.some(([method]) => method === 'quadraticCurveTo'), 'classic ghosts still render');
  game.run('GameRenderer.setActors({ ghosts: (ctx, ghosts) => calls.push(ghosts.length) });');
  game.advance();
  assert.equal(game.run('calls.at(-1)'), 4);
  assert.throws(() => game.run('GameRenderer.setActors({ player: null })'), /renderer function/);
});

test('environments are replaceable and receive fresh layouts on reset, not on eating dots', () => {
  const game = boot();
  game.run(`globalThis.layouts = []; globalThis.disposals = 0;
    GameRenderer.setEnvironment({ name: 'test', setLayout: value => layouts.push(value),
      draw() {}, dispose() { disposals++; } });`);
  assert.equal(game.run('layouts.length'), 1);
  game.click();
  assert.equal(game.run('layouts.length'), 2);
  game.advance(10);
  assert.equal(game.run('layouts.length'), 2);
  game.run('resetLevel(false);');
  assert.equal(game.run('layouts.length'), 3);
  assert.equal(game.run('layouts[1] !== layouts[2]'), true);
  game.run("GameRenderer.setEnvironment({ name: 'other', setLayout() {}, draw() {} });");
  assert.equal(game.run('disposals'), 1);
  assert.throws(() => game.run('GameRenderer.setEnvironment({ draw() {} })'), /setLayout/);
});

test('a lost GPU or failed scene rebuild returns to Canvas and releases the old renderer', () => {
  for (const failure of ['draw', 'rebuild']) {
    const game = boot();
    game.run(`globalThis.disposals = 0; globalThis.builds = 0;
      GameRenderer.setEnvironment({ name: 'gpu',
        setLayout() { builds++; if (builds > 1 && '${failure}' === 'rebuild') throw new Error('GPU lost'); },
        draw() { if ('${failure}' === 'draw') throw new Error('GPU lost'); },
        dispose() { disposals++; }
      });`);
    if (failure === 'rebuild') game.run('resetLevel(false);');
    game.advance(2);
    assert.equal(game.elements.get('gameCanvas').dataset.renderer, 'canvas');
    assert.equal(game.run('disposals'), 1);
    assert.equal(game.frames.length, 1);
  }
});

test('consumed collectibles disappear without a stale static-dot layer', () => {
  const game = boot({ reducedMotion: true });
  game.drawing.length = 0;
  game.advance();
  const dotCount = game.drawing.filter(([method, , , radius]) => method === 'arc' && radius === 1.8).length;
  assert.ok(dotCount > 100);
  game.run('maze[1][1] = 1;');
  game.drawing.length = 0;
  game.advance();
  assert.equal(game.drawing.filter(([method, , , radius]) => method === 'arc' && radius === 1.8).length, dotCount - 1);
});

test('ghost-house barriers are drawn at their actual grid cells', () => {
  const game = boot();
  game.drawing.length = 0;
  game.advance();
  assert.ok(game.drawing.some(([method, x, y, width, height]) =>
    method === 'fillRect' && x === 13 * 16 && y === 9 * 16 + 16 * 0.4 && width === 16 && height === 2));
});

test('tunnel rendering adds translated actor copies without moving gameplay objects', () => {
  const game = boot({ reducedMotion: true });
  game.run(`globalThis.actorDraws = [];
    GameRenderer.setActors({
      player(ctx, actor) { actorDraws.push(['player', actor.x]); },
      ghosts(ctx, roster) { actorDraws.push(['ghosts', roster.map(actor => actor.x)]); }
    });
    Object.assign(player, { x: -4, y: 11.5 * TILE });
    ghosts = [{ ...ghosts[0], x: COLS * TILE - 12, y: 11.5 * TILE, mode: 'chase' }];`);
  const before = game.run('JSON.stringify({ player, ghosts, maze })');
  game.drawing.length = 0;
  game.advance();
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(actorDraws)')), [
    ['player', -4], ['player', -4], ['ghosts', [436]], ['ghosts', [436]]
  ]);
  for (const offset of [448, -448]) {
    assert.ok(game.drawing.some(([method, x, y]) => method === 'translate' && x === offset && y === 0));
  }
  assert.equal(game.run('JSON.stringify({ player, ghosts, maze })'), before);

  // Closed edges and actors in the middle must not acquire tunnel copies.
  for (const position of ['{ x: 8, y: 1.5 * TILE }', '{ x: 200, y: 11.5 * TILE }']) {
    game.run(`Object.assign(player, ${position}); ghosts = []; actorDraws.length = 0;`);
    game.advance();
    assert.equal(game.run("actorDraws.filter(([kind]) => kind === 'player').length"), 1);
  }
});

test('ambient time freezes on pause and respects reduced-motion preferences', () => {
  for (const reducedMotion of [false, true]) {
    const game = boot({ reducedMotion });
    game.run(`globalThis.visualFrames = []; GameRenderer.setEnvironment({ setLayout() {},
      draw(ctx, frame) { visualFrames.push({ ...frame }); } });`);
    game.click();
    game.advance(3);
    assert.equal(game.run('visualFrames.at(-1).reducedMotion'), reducedMotion);
    assert.ok(game.run('visualFrames.at(-1).time > visualFrames[0].time'));
    game.key('p');
    const time = game.run('visualFrames.at(-1).time');
    game.advance(20);
    assert.equal(game.run('visualFrames.at(-1).time'), time);
    game.key('p');
    game.advance();
    assert.ok(game.run('visualFrames.at(-1).time') > time);
  }
});
