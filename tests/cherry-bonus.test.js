const assert = require('node:assert/strict');
const test = require('node:test');
const CherryBonus = require('../scripts/cherry-bonus');
const GhostNavigation = require('../scripts/ghosts/navigation');
const { boot } = require('./helpers/game-harness');

const tile = 16;
const origin = { x: 1.5 * tile, y: 1.5 * tile, alive: true };
const retro = { mix: 1 };
const house = () => [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 2, 2, 2, 2, 2, 2, 0],
  [0, 2, 0, 0, 4, 0, 0, 2, 0],
  [0, 2, 0, 1, 1, 1, 0, 2, 0],
  [0, 2, 0, 0, 0, 0, 0, 2, 0],
  [0, 2, 2, 2, 2, 2, 2, 2, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0]
];

function start() {
  const game = boot({ random: () => 0 });
  game.click();
  game.run('ghosts = []; player.speed = 0;');
  return game;
}

function visit(game) {
  game.run(`retroWorld.trigger();
    for (let tick = 0; tick < 570; tick++) retroWorld.update();
    cherryBonus.update(retroWorld.state);`);
  assert.equal(game.run('retroWorld.state.phase'), 'hold');
  assert.ok(game.run('cherryBonus.state.fruit !== null'));
}

function collect(game) {
  game.run('Object.assign(player, cherryBonus.state.fruit, { speed: 0 }); updatePlayer();');
}

test('a cherry uses the reachable street behind the house without changing its maze or covering the door', () => {
  const maze = house(), before = structuredClone(maze);
  const cherry = CherryBonus.create(maze, tile, { origin });
  assert.deepEqual(cherry.state, { fruit: null, collected: false });
  cherry.update(retro);
  assert.deepEqual(cherry.state.fruit, { x: 4.5 * tile, y: 5.5 * tile });
  assert.deepEqual(maze, before);

  const game = start();
  visit(game);
  const liveMaze = JSON.parse(game.run('JSON.stringify(maze)'));
  const fruit = JSON.parse(game.run('JSON.stringify(cherryBonus.state.fruit)'));
  assert.deepEqual(fruit, { x: 14 * tile, y: 14.5 * tile }, 'centered below the original two-tile door');
  const pickups = JSON.parse(game.run('JSON.stringify(freezePowerUps.state.pickups)'));
  assert.equal(pickups.length, 2, 'reserving the fruit still leaves room for both freeze finds');
  assert.ok(pickups.every(point => Math.hypot(point.x - fruit.x, point.y - fruit.y) >= tile * 1.5),
    'freeze artwork and collection areas must not overlap the fixed fruit position');
  const navigation = GhostNavigation.create(liveMaze, tile);
  for (const col of [13, 14]) {
    assert.equal(liveMaze[13][col], 0, 'the house back wall stays solid');
    assert.equal(liveMaze[14][col], 1);
    assert.ok(Number.isFinite(navigation.distance(navigation.cellAt({ x: 13.5 * tile, y: 22.5 * tile }), { col, row: 14 })));
  }
});

test('the fruit exists only while the retro world is visible and each visit offers exactly one 100-point pickup', () => {
  const cherry = CherryBonus.create(house(), tile, { origin });
  const player = { x: 4.5 * tile, y: 5.5 * tile, alive: true };
  for (const world of [undefined, { phase: 'idle', mix: 0 }, { phase: 'delay', mix: 0 }, { phase: 'fadeIn', mix: 0 }]) {
    assert.equal(cherry.collect(player, world), 0);
    assert.equal(cherry.state.fruit, null);
  }
  cherry.update({ phase: 'fadeIn', mix: 0.001 });
  assert.ok(cherry.state.fruit);
  assert.equal(cherry.collect({ ...player, alive: false }, retro), 0);
  assert.equal(cherry.collect({ ...player, x: player.x - tile * 0.66 }, retro), 0);
  assert.equal(cherry.collect({ ...player, y: player.y + tile }, retro), 0);
  const before = structuredClone({ player, retro });
  assert.equal(cherry.collect({ ...player, x: player.x - tile * 0.64 }, retro), 100);
  assert.deepEqual({ player, retro }, before);
  assert.deepEqual(cherry.state, { fruit: null, collected: true });
  for (const mix of [1, 0.99, 0.5, 0.001]) {
    assert.equal(cherry.collect(player, { mix }), 0, 'hold and fade-out must not restore a spent cherry');
  }
  assert.equal(cherry.collect(player, { mix: 0 }), 0);
  assert.deepEqual(cherry.state, { fruit: null, collected: false });
  assert.equal(cherry.collect(player, retro), 100, 'a later visit offers a new cherry');
});

test('an uncollected cherry fades with the retro world and is removed on the exact return to the city', () => {
  const cherry = CherryBonus.create(house(), tile, { origin });
  for (const mix of [0.001, 0.5, 1, 0.5, 0.001]) {
    cherry.update({ mix });
    assert.deepEqual(cherry.state.fruit, { x: 4.5 * tile, y: 5.5 * tile });
  }
  cherry.update({ mix: 0 });
  assert.equal(cherry.state.fruit, null);
});

test('maps without a complete reachable house never invent a fruit position; invalid inputs are rejected', () => {
  const missingDoor = house(); missingDoor[2][4] = 0;
  const blockedStreet = house(); blockedStreet[5][4] = 0;
  const disconnected = house(); disconnected[4][1] = disconnected[4][7] = 0;
  const missingBack = house(); missingBack[4][4] = 1;
  const splitDoor = house(); splitDoor[2][6] = 4;
  for (const maze of [[[1]], missingDoor, blockedStreet, disconnected, missingBack, splitDoor]) {
    const cherry = CherryBonus.create(maze, tile, { origin });
    cherry.update(retro);
    assert.equal(cherry.state.fruit, null);
    assert.equal(cherry.collect(origin, retro), 0);
  }
  const blockedOrigin = CherryBonus.create(house(), tile, { origin: { x: tile / 2, y: tile / 2 } });
  blockedOrigin.update(retro);
  assert.equal(blockedOrigin.state.fruit, null);
  for (const [maze, size, spawn] of [[[], tile, origin], [[[]], tile, origin], [[[1], []], tile, origin],
    [house(), 0, origin], [house(), NaN, origin], [house(), Infinity, origin],
    [house(), tile, undefined], [house(), tile, { x: NaN, y: 0 }]]) {
    assert.throws(() => CherryBonus.create(maze, size, { origin: spawn }), TypeError);
  }
});

test('rebinding a level keeps the current visit inventory and recomputes placement from its house', () => {
  const cherry = CherryBonus.create(house(), tile, { origin });
  cherry.update(retro);
  const shifted = [Array(9).fill(0), ...house()];
  cherry.setMaze(shifted, { origin: { ...origin, y: origin.y + tile } });
  assert.deepEqual(cherry.state.fruit, { x: 4.5 * tile, y: 6.5 * tile });
  assert.equal(cherry.collect({ ...cherry.state.fruit, alive: true }, retro), 100);
  cherry.setMaze(house(), { origin });
  cherry.update(retro);
  assert.deepEqual(cherry.state, { fruit: null, collected: true });
});

test('collecting in the game awards exactly 100 score and high-score points, not lives or pellet progress', () => {
  const game = start();
  visit(game);
  const before = game.run('JSON.stringify({ maze, dotsLeft, lives, powerMode, powerTimer, ghosts, freeze: freezePowerUps.state })');
  collect(game);
  assert.equal(game.run('score'), 100);
  assert.equal(game.run('highScore'), 100);
  assert.equal(game.elements.get('score').textContent, 'SCORE: 100');
  assert.equal(game.elements.get('highScore').textContent, 'HIGH: 100');
  assert.equal(game.storage.get('pacmanHigh'), '100');
  assert.equal(game.run('JSON.stringify({ maze, dotsLeft, lives, powerMode, powerTimer, ghosts, freeze: freezePowerUps.state })'), before);
  game.run('for (let tick = 0; tick < 50; tick++) updatePlayer();');
  assert.equal(game.run('score'), 100);
  assert.equal(game.run('cherryBonus.state.fruit'), null);
});

test('collecting the last pellet and the cherry together adds both scores before completing the level', () => {
  const game = start();
  visit(game);
  game.run('maze[14][14] = 2; dotsLeft = 1;');
  collect(game);
  assert.equal(game.run('score'), 110);
  assert.equal(game.run('dotsLeft'), 0);
  assert.equal(game.run('gameState'), 'levelComplete');
  assert.equal(game.run('cherryBonus.state.collected'), true);
});

for (const collected of [false, true]) {
  test(`death, respawn and level changes preserve the ${collected ? 'spent' : 'available'} cherry; restart clears the visit`, () => {
    const game = start();
    visit(game);
    if (collected) collect(game);
    game.run(`globalThis.savedCherry = cherryBonus;
      ghosts = GhostProfiles.create(TILE);
      Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
    const before = game.run('JSON.stringify(cherryBonus.state)');
    game.advance(10);
    assert.equal(game.run('JSON.stringify(cherryBonus.state)'), before);
    game.respawn();
    assert.equal(game.run('cherryBonus === savedCherry'), true);
    assert.equal(game.run('JSON.stringify(cherryBonus.state)'), before);
    game.run("gameState = 'levelComplete'; nextLevel();");
    assert.equal(game.run('cherryBonus === savedCherry'), true);
    assert.equal(game.run('JSON.stringify(cherryBonus.state)'), before);
    game.click();
    assert.equal(game.run('cherryBonus === savedCherry'), false);
    assert.equal(game.run('cherryBonus.state.fruit'), null);
    assert.equal(game.run('cherryBonus.state.collected'), false);
    assert.equal(game.run('score'), 0);
  });
}

test('title, pause, level-complete and game-over overlays cannot collect or remove an available cherry', () => {
  const game = start();
  visit(game);
  game.run('Object.assign(player, cherryBonus.state.fruit);');
  const before = game.run('JSON.stringify(cherryBonus.state)');
  for (const state of ['title', 'paused', 'levelComplete', 'gameOver']) {
    game.run(`gameState = '${state}';`);
    game.advance(10);
    assert.equal(game.run('JSON.stringify(cherryBonus.state)'), before);
    assert.equal(game.run('score'), 0);
  }
});

for (const fps of [20, 60, 144]) {
  test(`the real loop spawns and removes the fruit with the world crossfade at ${fps} FPS`, () => {
    const game = start();
    game.run(`globalThis.fruitFrame = null;
      GameRenderer.render = (time, state) => fruitFrame = state.cherryBonus.fruit;
      retroWorld.trigger(); level256Glitch.state.ticksUntilGlitch = 100000;`);
    game.frameAt(0);
    let previous = 0;
    for (const [end, visible] of [[1500, false], [1500 + 1000 / 60, true], [9500, true],
      [39500, true], [45500 - 1000 / 60, true], [45500, false]]) {
      for (let frame = 1; previous + frame * 1000 / fps < end - 1e-7; frame++) {
        game.frameAt(previous + frame * 1000 / fps);
      }
      game.frameAt(end);
      assert.equal(game.run('cherryBonus.state.fruit !== null'), visible, `at ${end}ms`);
      assert.equal(game.run('fruitFrame !== null'), visible, 'the renderer receives the current fruit state');
      previous = end;
    }
    game.run('Object.assign(player, { x: 14 * TILE, y: 14.5 * TILE }); updatePlayer();');
    assert.equal(game.run('score'), 10, 'the city cannot award points for the vanished fruit');
    visit(game);
    const score = game.run('score');
    collect(game);
    assert.equal(game.run('score'), score + 100);
  });
}
