const assert = require('node:assert/strict');
const test = require('node:test');
const GhostProfiles = require('../scripts/ghosts/profiles');
const GhostController = require('../scripts/ghosts/controller');
const GhostNavigation = require('../scripts/ghosts/navigation');
const { arena, corridor, actor, player, tile } = require('./helpers/ghost-fixtures');
const { boot } = require('./helpers/game-harness');

test('the four ghosts leave their house on schedule at a centered, walkable exit', () => {
  const game = boot();
  for (const [frames, index] of [[1, 0], [59, 1], [60, 2], [60, 3]]) {
    game.run(`for (let frame = 0; frame < ${frames}; frame++) updateGhosts();`);
    assert.equal(game.run(`ghosts[${index}].mode`), 'chase');
    assert.equal(game.run(`ghosts[${index}].x`), 13.5 * tile);
    assert.equal(game.run(`ghosts[${index}].y`), 8.5 * tile);
    assert.equal(game.run(`maze[Math.floor(ghosts[${index}].y / TILE)][Math.floor(ghosts[${index}].x / TILE)]`), 1);
    if (index < 3) assert.equal(game.run(`ghosts[${index + 1}].mode`), 'house');
  }
});

for (const profile of GhostProfiles.all) {
  test(`${profile.name} preserves fractional speed and turns only at tile centers`, () => {
    const maze = corridor(), controller = GhostController.create(maze, tile);
    const ghost = actor(profile.id, 5, 3), pacman = player(25, 3);
    const x = ghost.x;
    for (let frame = 0; frame < 80; frame++) controller.update([ghost], pacman, false);
    assert.ok(Math.abs(ghost.x - x - 80 * profile.speed) < 1e-6);
    assert.equal(ghost.y, 3.5 * tile);
  });
}

test('a ghost crosses a corner without clipping a wall or losing fractional movement', () => {
  const maze = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let col = 1; col <= 5; col++) maze[1][col] = 1;
  for (let row = 1; row <= 5; row++) maze[row][5] = 1;
  const controller = GhostController.create(maze, tile), ghost = actor('blinky', 3, 1), pacman = player(5, 5);
  for (let frame = 0; frame < 40; frame++) {
    controller.update([ghost], pacman, false);
    assert.equal(maze[Math.floor(ghost.y / tile)][Math.floor(ghost.x / tile)], 1);
    assert.ok(ghost.x % tile === tile / 2 || ghost.y % tile === tile / 2);
  }
  assert.equal(ghost.x, 5.5 * tile);
  assert.ok(Math.abs(ghost.y - (1.5 * tile + 40 * GhostProfiles.get(ghost).speed - 2 * tile)) < 1e-6);
  assert.equal(ghost.dir, 1);
});

test('dead ends reverse safely and an isolated ghost stays in its tile', () => {
  const controller = GhostController.create(corridor(10), tile), ghost = actor('blinky', 8, 3);
  controller.update([ghost], player(1, 3), false);
  assert.equal(ghost.dir, 2);
  assert.equal(ghost.x, 8.5 * tile - GhostProfiles.get(ghost).speed);
  const trapped = arena(5).map(row => row.map(() => 0));
  trapped[2][2] = 1;
  const isolated = actor('inky', 2, 2), before = { x: isolated.x, y: isolated.y };
  GhostController.create(trapped, tile).update([isolated], player(1, 1), false);
  assert.deepEqual({ x: isolated.x, y: isolated.y }, before);
});

test('both ghost tunnel directions preserve speed and wrap without an off-grid turn', () => {
  const game = boot(), maze = JSON.parse(game.run('JSON.stringify(maze)'));
  for (const dir of [0, 2]) {
    const controller = GhostController.create(maze, tile), ghost = actor('blinky', dir === 0 ? 27 : 0, 11, dir);
    const pacman = player(dir === 0 ? 2 : 25, 11);
    for (let frame = 0; frame < 20; frame++) controller.update([ghost], pacman, false);
    assert.ok(Math.abs(ghost.x - (dir === 0 ? 16 : 432)) < 1e-6, `direction ${dir}: ${ghost.x}`);
    assert.equal(ghost.y, 11.5 * tile);
  }
});

test('frightened ghosts reverse once and flee continuously at the slower speed', () => {
  const controller = GhostController.create(corridor(), tile), ghost = actor('blinky', 8, 3), pacman = player(12, 3);
  ghost.scared = true; ghost.reversePending = true;
  const x = ghost.x;
  for (let frame = 0; frame < 40; frame++) controller.update([ghost], pacman, true);
  assert.ok(Math.abs(ghost.x - x + 40 * 0.9) < 1e-6);
  assert.equal(ghost.dir, 2);
  assert.equal(ghost.reversePending, false);
});

test('eaten eyes navigate through the door, wait at home, and rejoin an ongoing power mode', () => {
  const game = boot(), maze = JSON.parse(game.run('JSON.stringify(maze)'));
  const nav = GhostNavigation.create(maze, tile), controller = GhostController.create(maze, tile);
  const ghost = actor('inky', 1, 1), pacman = player(20, 22);
  controller.update([ghost], pacman, false); // Being eaten between centers must also be safe.
  ghost.mode = 'eyes'; ghost.scared = false;
  let frames = 0, visitedDoor = false;
  while (ghost.mode === 'eyes' && frames++ < 2000) {
    controller.update([ghost], pacman, false);
    const cell = nav.cellAt(ghost);
    assert.notEqual(maze[cell.row][cell.col], 0);
    visitedDoor ||= maze[cell.row][cell.col] === 4;
  }
  assert.ok(frames < 2000, 'eyes must not oscillate outside their home');
  assert.equal(visitedDoor, true);
  assert.equal(ghost.mode, 'house');
  assert.equal(ghost.houseTimer, 60);
  assert.deepEqual({ x: ghost.x, y: ghost.y }, nav.point(GhostProfiles.home));
  for (let frame = 0; frame < 60; frame++) controller.update([ghost], pacman, true);
  assert.equal(ghost.mode, 'chase');
  assert.equal(ghost.scared, true);
  assert.deepEqual({ x: ghost.x, y: ghost.y }, nav.point(GhostProfiles.exit));
});

test('long-running coordinated searches stay on streets, leave the house and keep all four ghosts moving', () => {
  const game = boot(), maze = JSON.parse(game.run('JSON.stringify(maze)')), before = structuredClone(maze);
  const nav = GhostNavigation.create(maze, tile), controller = GhostController.create(maze, tile);
  const ghosts = GhostProfiles.create(tile), visited = ghosts.map(() => new Set()), headings = new Set();
  const positions = [[13, 22], [1, 1], [26, 4], [6, 18], [21, 11], [12, 6]];
  for (let frame = 0; frame < 6000; frame++) {
    const pos = positions[Math.floor(frame / 500) % positions.length], pacman = player(...pos, Math.floor(frame / 240) % 4);
    controller.update(ghosts, pacman, false);
    const dirs = [];
    ghosts.forEach((ghost, index) => {
      const cell = nav.cellAt(ghost);
      assert.notEqual(maze[cell.row][cell.col], 0, `${ghost.id} clipped a wall at frame ${frame}`);
      if (ghost.mode !== 'chase') return;
      assert.notEqual(maze[cell.row][cell.col], 4, 'chasing ghosts must not enter their house');
      assert.ok(Math.abs(ghost.x / tile % 1 - 0.5) < 1e-6 || Math.abs(ghost.y / tile % 1 - 0.5) < 1e-6);
      visited[index].add(`${cell.col},${cell.row}`);
      dirs.push(ghost.dir);
    });
    if (dirs.length === 4) headings.add(new Set(dirs).size);
  }
  for (const [index, cells] of visited.entries()) assert.ok(cells.size > 40, `${ghosts[index].id}: only ${cells.size} visited cells`);
  assert.ok(headings.has(3) || headings.has(4), 'searches must not remain a single-direction convoy');
  assert.deepEqual(maze, before);
});

test('power pellets, frightened collision scores and timer expiration preserve every ghost state', () => {
  const game = boot();
  game.run(`ghosts.forEach(g => { g.mode = 'chase'; });
    ghosts[2].mode = 'eyes'; ghosts[3].mode = 'house';
    player.x = 1.5 * TILE; player.y = 3.5 * TILE; player.speed = 0;
    updatePlayer();`);
  assert.equal(game.run('powerMode'), true);
  assert.equal(game.run('powerTimer'), 480);
  assert.equal(game.run('ghosts.filter(g => g.scared && g.reversePending).length'), 2);
  game.run('ghosts[0].x = ghosts[1].x = player.x; ghosts[0].y = ghosts[1].y = player.y; checkCollisions();');
  assert.equal(game.run('score'), 50 + 200 + 400);
  assert.equal(game.run('ghostEatCombo'), 2);
  assert.equal(game.run('ghosts.filter(g => g.mode === "eyes").length'), 3);
  assert.equal(game.run('player.alive'), true);
  game.run('ghosts[3].houseTimer = 1; updateGhosts();');
  assert.equal(game.run('ghosts[3].scared'), true);
  game.run('powerTimer = 1; updateGhosts();');
  assert.equal(game.run('powerMode'), false);
  assert.equal(game.run('ghosts.every(g => !g.scared && !g.reversePending)'), true);
});

test('level reset creates fresh routing and identities without stale frightened or eye states', () => {
  const game = boot();
  game.run('ghosts[0].mode = "eyes"; ghosts[1].scared = true; ghosts[1].reversePending = true; globalThis.previousController = ghostController; resetLevel(false);');
  assert.equal(game.run('ghostController !== previousController'), true);
  assert.equal(game.run('ghosts.every(g => g.mode === "house" && !g.scared && !g.reversePending && g.target === null)'), true);
  assert.equal(game.run('new Set(ghosts.map(g => g.id)).size'), 4);
});

test('a coordinated collision costs one life even when several ghosts arrive together', () => {
  const game = boot();
  game.run('ghosts.forEach(g => { g.mode = "chase"; g.x = player.x; g.y = player.y; }); checkCollisions();');
  assert.equal(game.run('lives'), 2);
  assert.equal(game.run('player.alive'), false);
  game.run('checkCollisions();');
  assert.equal(game.run('lives'), 2);
  game.respawn();
  assert.equal(game.run('player.alive'), true);
});
