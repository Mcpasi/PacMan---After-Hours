const assert = require('node:assert/strict');
const test = require('node:test');
const FreezePowerUps = require('../scripts/freeze-powerups');
const GhostController = require('../scripts/ghosts/controller');
const GhostLearning = require('../scripts/ghosts/learning');
const GhostNavigation = require('../scripts/ghosts/navigation');
const { arena, actor, player: pacman, tile } = require('./helpers/ghost-fixtures');
const { boot } = require('./helpers/game-harness');

const origin = { x: 1.5 * tile, y: 1.5 * tile, alive: true };
const corridor = () => [Array(16).fill(0), [0, ...Array(14).fill(2), 0], Array(16).fill(0)];
const snapshot = game => game.run('JSON.stringify(ghosts)');

function start() {
  const game = boot({ random: () => 0 });
  game.click();
  return game;
}

function collect(game, index = 0) {
  game.run(`Object.assign(player, freezePowerUps.state.pickups[${index}], { speed: 0 }); updatePlayer();`);
}

test('two distinct, separated freeze finds are immediately available without replacing pellets or changing the maze', () => {
  const maze = corridor(), before = structuredClone(maze);
  const bonus = FreezePowerUps.create(maze, tile, { origin });
  assert.equal(bonus.state.pickups.length, 2);
  assert.deepEqual(bonus.state.pickups.map(pickup => pickup.kind), ['lantern', 'watch']);
  const [first, second] = bonus.state.pickups;
  assert.ok(Math.abs(first.x - second.x) >= tile * 5);
  for (const pickup of bonus.state.pickups) {
    assert.equal(pickup.x % tile, tile / 2);
    assert.equal(pickup.y % tile, tile / 2);
    assert.equal(maze[Math.floor(pickup.y / tile)][Math.floor(pickup.x / tile)], 2);
    assert.notEqual(pickup.x, origin.x);
  }
  assert.deepEqual(maze, before);
  assert.deepEqual(bonus.state, FreezePowerUps.create(maze, tile, { origin }).state, 'placement is deterministic');
});

test('placement never enters doors, the ghost house, power pellets or disconnected streets', () => {
  const maze = [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 2, 2, 4, 2, 2, 0],
    [0, 2, 3, 0, 0, 0, 0],
    [0, 0, 0, 2, 2, 0, 0],
    [0, 0, 0, 0, 0, 0, 0]
  ];
  const bonus = FreezePowerUps.create(maze, tile, { origin });
  assert.equal(bonus.state.pickups.length, 2);
  for (const point of bonus.state.pickups) {
    assert.ok(['2,1', '1,2'].includes(`${Math.floor(point.x / tile)},${Math.floor(point.y / tile)}`));
  }
});

test('reserved bonus positions stay clear, including across horizontal tunnel seams', () => {
  const maze = [Array(12).fill(0), Array(12).fill(2), Array(12).fill(0)];
  const reserved = [{ x: tile / 2, y: 1.5 * tile }], before = structuredClone({ maze, reserved });
  const bonus = FreezePowerUps.create(maze, tile, { origin: { x: 6.5 * tile, y: 1.5 * tile }, reserved });
  assert.equal(bonus.state.pickups.length, 2);
  for (const pickup of bonus.state.pickups) {
    const dx = Math.abs(pickup.x - reserved[0].x);
    assert.ok(Math.min(dx, 12 * tile - dx) >= tile * 1.5);
  }
  assert.deepEqual({ maze, reserved }, before);
  assert.deepEqual(FreezePowerUps.create([[2, 2]], tile, { origin: { x: tile / 2, y: tile / 2 },
    reserved: [{ x: 1.5 * tile, y: tile / 2 }] }).state.pickups, [], 'small maps never force overlapping finds');
  for (const reserved of [null, {}, [null], [{ x: NaN, y: 0 }], [{ x: 0, y: Infinity }]]) {
    assert.throws(() => FreezePowerUps.create(maze, tile, { origin, reserved }), TypeError);
  }
});

test('reachability and collection use horizontal tunnels but never vertical wrapping', () => {
  const maze = [[0, 0, 2, 0, 0, 0, 0], [2, 0, 0, 0, 0, 2, 2], [0, 0, 2, 0, 0, 0, 0]];
  const bonus = FreezePowerUps.create(maze, tile, { origin: { ...origin, x: tile / 2 } });
  assert.equal(bonus.state.pickups.length, 2);
  assert.ok(bonus.state.pickups.every(point => point.y === origin.y && point.x >= 5.5 * tile));
  const edge = bonus.state.pickups.find(point => point.x === 6.5 * tile);
  assert.equal(bonus.collect({ ...edge, x: 0, y: edge.y + tile, alive: true }), false);
  assert.equal(bonus.collect({ ...edge, x: 0, alive: false }), false);
  assert.equal(bonus.collect({ ...edge, x: -tile / 2, alive: true }), true);
  assert.equal(bonus.state.pickups.length, 1);
});

test('only a living player in range collects a find, and each can be used just once', () => {
  const bonus = FreezePowerUps.create(corridor(), tile, { origin });
  const point = { ...bonus.state.pickups[0], alive: true };
  assert.equal(bonus.collect({ ...point, alive: false }), false);
  assert.equal(bonus.collect({ ...point, x: point.x - tile * 0.66 }), false);
  assert.equal(bonus.collect({ ...point, x: point.x - tile * 0.64 }), true);
  assert.equal(bonus.collect(point), false);
  assert.equal(bonus.state.pickups.length, 1);
  assert.equal(bonus.state.remainingTicks, 240);
});

for (const ticksPerSecond of [20, 60, 120]) {
  test(`freeze suppresses exactly four seconds of simulation at ${ticksPerSecond} Hz, including the last tick`, () => {
    const bonus = FreezePowerUps.create(corridor(), tile, { origin, ticksPerSecond });
    assert.equal(bonus.update(), false);
    assert.equal(bonus.collect({ ...bonus.state.pickups[0], alive: true }), true);
    for (let tick = 0; tick < ticksPerSecond * 4; tick++) assert.equal(bonus.update(), true);
    assert.equal(bonus.state.remainingTicks, 0);
    assert.equal(bonus.update(), false);
    assert.equal(bonus.state.remainingTicks, 0);
  });
}

test('the second find refreshes four seconds; respawn cleanup never restores spent finds', () => {
  const bonus = FreezePowerUps.create(corridor(), tile, { origin });
  bonus.collect({ ...bonus.state.pickups[0], alive: true });
  for (let tick = 0; tick < 150; tick++) bonus.update();
  assert.equal(bonus.state.remainingTicks, 90);
  bonus.collect({ ...bonus.state.pickups[0], alive: true });
  assert.equal(bonus.state.remainingTicks, 240);
  assert.deepEqual(bonus.state.pickups, []);
  bonus.resetEffect();
  assert.equal(bonus.state.remainingTicks, 0);
  for (let tick = 0; tick < 1000; tick++) bonus.update();
  assert.deepEqual(bonus.state.pickups, []);
});

test('small or blocked custom maps stay bounded, and invalid inputs are rejected', () => {
  const tinyOrigin = { x: tile / 2, y: tile / 2 };
  for (const maze of [[[0, 2]], [[1]], [[3]]]) {
    assert.deepEqual(FreezePowerUps.create(maze, tile, { origin: tinyOrigin }).state.pickups, []);
  }
  assert.equal(FreezePowerUps.create([[1, 2]], tile, { origin: tinyOrigin }).state.pickups.length, 1);
  for (const [maze, size, rate, spawn] of [[[], tile, 60, origin], [[[]], tile, 60, origin],
    [[[1], []], tile, 60, origin], [[[1]], 0, 60, origin], [[[1]], NaN, 60, origin],
    [[[1]], tile, 0, origin], [[[1]], tile, NaN, origin], [[[1]], tile, 60, undefined]]) {
    assert.throws(() => FreezePowerUps.create(maze, size, { origin: spawn, ticksPerSecond: rate }), TypeError);
  }
});

test('the controller suspends all four ghost states verbatim and resumes the original routing after thaw', () => {
  const maze = arena(), controller = GhostController.create(maze, tile);
  const ghosts = [actor('blinky', 4, 3), actor('pinky', 5, 3), actor('inky', 6, 3), actor('clyde', 7, 3)];
  ghosts[0].x += 2.75; ghosts[0].speed = 1.73;
  ghosts[1].scared = true; ghosts[1].reversePending = true;
  ghosts[2].mode = 'eyes';
  ghosts[3].mode = 'house'; ghosts[3].houseTimer = 1;
  const before = structuredClone(ghosts), control = structuredClone(ghosts);
  for (let tick = 0; tick < 240; tick++) controller.update(ghosts, pacman(12, 3), true, { frozen: true });
  assert.deepEqual(ghosts, before, 'positions, directions, targets, speeds, modes and releases must all survive');
  controller.update(ghosts, pacman(12, 3), true);
  GhostController.create(maze, tile).update(control, pacman(12, 3), true);
  assert.deepEqual(ghosts, control, 'thaw is exactly the next ordinary controller tick');
  assert.equal(ghosts[1].reversePending, false);
  assert.equal(ghosts[2].mode, 'eyes');
  assert.equal(ghosts[3].mode, 'chase');
});

test('frozen ghosts retain previously learned routes and keep observing new legal player choices', () => {
  const maze = arena(), navigation = GhostNavigation.create(maze, tile), learning = GhostLearning.create();
  const controller = GhostController.create(maze, tile, { learning });
  function train(route, frozen) {
    for (let pass = 0; pass < 3; pass++) {
      learning.resetObservation();
      route.forEach(([col, row, dir]) => controller.update([], pacman(col, row, dir), false, { frozen }));
    }
  }
  train([[7, 8, 0], [8, 8, 0], [8, 9, 1], [8, 10, 1], [8, 11, 1], [8, 12, 1], [8, 13, 1], [8, 14, 1]], false);
  const before = learning.predict(pacman(8, 8), navigation);
  assert.deepEqual(before[0], { col: 8, row: 9 });
  train([[10, 5, 0], [11, 5, 0], [11, 6, 1], [11, 7, 1]], true);
  assert.deepEqual(learning.predict(pacman(8, 8), navigation), before);
  assert.deepEqual(learning.predict(pacman(11, 5), navigation)[0], { col: 11, row: 6 });
  const pinky = actor('pinky', 8, 10);
  controller.update([pinky], pacman(8, 8), false);
  assert.equal(pinky.dir, 1, 'the learned intercept is used immediately after thaw');
});

test('game pickup freezes every ghost for 240 ticks while Pac-Man still moves and collects lights', () => {
  const game = start();
  collect(game);
  const before = snapshot(game);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 240);
  game.run(`Object.assign(player, { x: 13.5 * TILE, y: 22.5 * TILE, dir: 0, nextDir: 0, speed: 1.3 });
    globalThis.savedController = ghostController; globalThis.savedLearning = ghostLearning;
    for (let tick = 0; tick < 240; tick++) { updatePlayer(); updateGhosts(); }`);
  assert.equal(snapshot(game), before);
  assert.ok(game.run('player.x > 13.5 * TILE'));
  assert.ok(game.run('score > 10'));
  assert.equal(game.run('ghostController === savedController && ghostLearning === savedLearning'), true);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 0);
  game.run('updateGhosts();');
  assert.notEqual(snapshot(game), before);
});

test('freeze does not change frightened durations, reversal, eaten-eye scoring or lethal collision rules', () => {
  const game = start();
  collect(game);
  game.run(`Object.assign(player, { x: 1.5 * TILE, y: 3.5 * TILE });
    ghosts.forEach(ghost => { ghost.mode = 'chase'; }); updatePlayer();`);
  assert.equal(game.run('powerTimer'), 480);
  assert.equal(game.run('ghosts.every(ghost => ghost.scared && ghost.reversePending)'), true);
  const before = snapshot(game);
  game.run('for (let tick = 0; tick < 120; tick++) updateGhosts();');
  assert.equal(snapshot(game), before);
  assert.equal(game.run('powerTimer'), 360, 'the existing eight-second pellet clock stays independent');
  const score = game.run('score');
  game.run('Object.assign(ghosts[0], { x: player.x, y: player.y }); checkCollisions();');
  assert.equal(game.run('score'), score + 200);
  assert.equal(game.run('ghosts[0].mode'), 'eyes');
  game.run('powerTimer = 1; updateGhosts();');
  assert.equal(game.run('powerMode'), false);
  assert.equal(game.run('ghosts.every(ghost => !ghost.scared && !ghost.reversePending)'), true);
  game.run('Object.assign(ghosts[1], { x: player.x, y: player.y }); checkCollisions();');
  assert.equal(game.run('lives'), 2, 'freeze is immobilization, not invulnerability or frightened mode');
});

test('death keeps the level inventory, respawn clears only the effect, and each new level or game offers two finds', () => {
  const game = start();
  collect(game);
  game.run(`globalThis.savedFreeze = freezePowerUps;
    Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
  const before = game.run('JSON.stringify(freezePowerUps.state)');
  game.advance(20);
  assert.equal(game.run('JSON.stringify(freezePowerUps.state)'), before, 'death spends no freeze ticks');
  game.respawn();
  assert.equal(game.run('freezePowerUps === savedFreeze'), true);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 0);
  assert.equal(game.run('freezePowerUps.state.pickups.length'), 1);
  collect(game);
  assert.equal(game.run('freezePowerUps.state.pickups.length'), 0);
  game.run('resetActors();');
  assert.equal(game.run('freezePowerUps.state.pickups.length'), 0);
  game.run('gameState = "levelComplete"; nextLevel();');
  assert.equal(game.run('freezePowerUps === savedFreeze'), false);
  assert.equal(game.run('freezePowerUps.state.pickups.length'), 2);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 0);
  collect(game);
  game.click();
  assert.equal(game.run('level'), 1);
  assert.equal(game.run('freezePowerUps.state.pickups.length'), 2);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 0);
});

test('freeze inventory and timer survive a world transition without changing ghosts or their learned knowledge', () => {
  const game = start();
  collect(game);
  const before = game.run('JSON.stringify({ ghosts, freeze: freezePowerUps.state })');
  game.run(`globalThis.savedLearning = ghostLearning; retroWorld.trigger();
    for (let tick = 0; tick < 570; tick++) retroWorld.update();`);
  assert.equal(game.run('retroWorld.state.mix'), 1);
  assert.equal(game.run('JSON.stringify({ ghosts, freeze: freezePowerUps.state })'), before);
  assert.equal(game.run('ghostLearning === savedLearning'), true);
  game.run('updateGhosts();');
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 239);
});

test('real learned player routes survive pickup, thaw, death and level changes; only a new game clears them', () => {
  const game = start();
  game.run(`globalThis.routeNavigation = GhostNavigation.create(maze, TILE);
    globalThis.forecast = () => ghostLearning.predict({ x: 6.5 * TILE, y: 1.5 * TILE, dir: 0, alive: true }, routeNavigation);
    ghosts = [];
    for (let pass = 0; pass < 3; pass++) {
      ghostLearning.resetObservation();
      Object.assign(player, { x: 5.5 * TILE, y: 1.5 * TILE, dir: 0, nextDir: 0, speed: TILE / 4 });
      updateGhosts();
      for (const dir of [0, 1, 1, 1]) {
        player.nextDir = dir;
        for (let tick = 0; tick < 4; tick++) { updatePlayer(); updateGhosts(); }
      }
    }
    globalThis.learnedForecast = JSON.stringify(forecast());
    globalThis.savedLearning = ghostLearning;`);
  assert.equal(game.run('forecast()[0].row'), 2);
  collect(game);
  game.run('for (let tick = 0; tick < 241; tick++) updateGhosts();');
  assert.equal(game.run('JSON.stringify(forecast())'), game.run('learnedForecast'));
  game.run(`ghosts = GhostProfiles.create(TILE);
    Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
  game.respawn();
  assert.equal(game.run('JSON.stringify(forecast())'), game.run('learnedForecast'));
  game.run('gameState = "levelComplete"; nextLevel();');
  assert.equal(game.run('ghostLearning === savedLearning'), true);
  assert.equal(game.run('JSON.stringify(forecast())'), game.run('learnedForecast'));
  assert.equal(game.run('freezePowerUps.state.pickups.length'), 2);
  game.click();
  assert.equal(game.run('ghostLearning === savedLearning'), false);
  assert.equal(game.run('forecast().length'), 0);
});

for (const fps of [20, 60, 144]) {
  test(`the real loop freezes exactly four active seconds at ${fps} rendering FPS and stops the timer on overlays`, () => {
    const game = start();
    collect(game);
    game.run('GameRenderer.render = () => {};');
    const before = snapshot(game);
    game.frameAt(0);
    for (let frame = 1; frame * 1000 / fps < 4000; frame++) game.frameAt(frame * 1000 / fps);
    assert.ok(game.run('freezePowerUps.state.remainingTicks > 0'));
    assert.equal(snapshot(game), before);
    game.frameAt(4000);
    assert.equal(game.run('animFrame'), 240);
    assert.equal(game.run('freezePowerUps.state.remainingTicks'), 0);
    assert.equal(snapshot(game), before, 'the 240th tick is still frozen');
    game.frameAt(4000 + 1000 / 60);
    assert.notEqual(snapshot(game), before);
    collect(game);
    for (const state of ['paused', 'levelComplete', 'gameOver', 'title']) {
      game.run(`gameState = '${state}';`);
      const freeze = game.run('JSON.stringify(freezePowerUps.state)'), ghosts = snapshot(game);
      game.advance(10);
      assert.equal(game.run('JSON.stringify(freezePowerUps.state)'), freeze);
      assert.equal(snapshot(game), ghosts);
    }
  });
}

test('pause and resume keep the remaining duration without catching up paused time', () => {
  const game = start();
  collect(game);
  game.frameAt(0); game.frameAt(100);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 234);
  game.key('p'); game.frameAt(60000);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 234);
  game.key('p'); game.frameAt(120000);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 234);
  game.frameAt(120000 + 1000 / 60);
  assert.equal(game.run('freezePowerUps.state.remainingTicks'), 233);
});
