const assert = require('node:assert/strict');
const test = require('node:test');
const GhostProfiles = require('../scripts/ghosts/profiles');
const GhostNavigation = require('../scripts/ghosts/navigation');
const GhostAI = require('../scripts/ghosts/ai');
const { arena, corridor, actor, player, tile } = require('./helpers/ghost-fixtures');

test('the roster has four immutable identities, not array-index-dependent behavior', () => {
  assert.equal(new Set(GhostProfiles.all.map(profile => profile.id)).size, 4);
  assert.equal(new Set(GhostProfiles.all.map(profile => profile.color)).size, 4);
  assert.equal(Object.isFrozen(GhostProfiles.all), true);
  assert.ok(GhostProfiles.all.every(profile => Object.isFrozen(profile) && Object.isFrozen(profile.order)));
  assert.equal(GhostProfiles.get({ id: 'inky', color: 0 }).name, 'Inky');
  assert.equal(GhostProfiles.get({ color: 3 }).id, 'clyde');
  assert.equal(GhostProfiles.get({}).id, 'blinky');
  const first = GhostProfiles.create(tile), second = GhostProfiles.create(tile);
  assert.deepEqual(first.map(ghost => ghost.houseTimer), [0, 60, 120, 180]);
  first[0].scared = true;
  assert.equal(second[0].scared, false);
});

for (const dir of [0, 1, 2, 3]) {
  test(`four search roles follow Pac-Man's heading ${dir} and reserve distinct reachable areas`, () => {
    const nav = GhostNavigation.create(arena(25), tile), pacman = player(12, 12, dir);
    const ghosts = GhostProfiles.all.map(profile => actor(profile.id, 8, 8));
    const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
    const hunter = GhostAI.desiredTarget(ghosts[0], pacman, ghosts, tile);
    assert.deepEqual(hunter, { x: pacman.x, y: pacman.y });
    const ambush = GhostAI.desiredTarget(ghosts[1], pacman, ghosts, tile);
    assert.deepEqual(ambush, { x: pacman.x + dx * tile * 4, y: pacman.y + dy * tile * 4 });
    const flank = GhostAI.desiredTarget(ghosts[2], pacman, ghosts, tile);
    assert.equal((flank.x - pacman.x) * dx + (flank.y - pacman.y) * dy, tile);
    const rear = GhostAI.desiredTarget(ghosts[3], pacman, ghosts, tile);
    assert.ok((rear.x - pacman.x) * dx + (rear.y - pacman.y) * dy < 0);
    const targets = GhostAI.plan(ghosts, pacman, nav);
    assert.equal(new Set([...targets.values()].map(cell => `${cell.col},${cell.row}`)).size, 4);
    for (const [ghost, target] of targets) assert.ok(Number.isFinite(nav.distance(nav.cellAt(ghost), target)));
    const reordered = GhostAI.plan(ghosts.slice().reverse(), pacman, nav);
    for (const ghost of ghosts) assert.deepEqual(reordered.get(ghost), targets.get(ghost));
  });
}

test('Inky changes flanks opposite Blinky and Clyde widens the rear sweep when close', () => {
  const pacman = player(9, 9), hunter = actor('blinky', 9, 13), inky = actor('inky', 4, 4);
  assert.ok(GhostAI.desiredTarget(inky, pacman, [hunter, inky], tile).y < pacman.y);
  hunter.y = 5.5 * tile;
  assert.ok(GhostAI.desiredTarget(inky, pacman, [hunter, inky], tile).y > pacman.y);
  hunter.mode = 'eyes';
  assert.ok(GhostAI.desiredTarget(inky, pacman, [hunter, inky], tile).y > pacman.y);
  const clyde = actor('clyde', 10, 9);
  const close = GhostAI.desiredTarget(clyde, pacman, [], tile);
  clyde.x = 1.5 * tile;
  assert.ok(close.x < GhostAI.desiredTarget(clyde, pacman, [], tile).x);
});

test('junction reservations split a group into four directions when the maze permits it', () => {
  const nav = GhostNavigation.create(arena(), tile), pacman = player(10, 8);
  const ghosts = GhostProfiles.all.map(profile => actor(profile.id, 8, 8, profile.id === 'clyde' ? 2 : 0));
  const targets = GhostAI.plan(ghosts, pacman, nav), reservations = [], directions = [];
  for (const ghost of ghosts) {
    const dir = GhostAI.chooseDirection(ghost, { navigation: nav, player: pacman, target: targets.get(ghost), reservations });
    directions.push(dir);
    reservations.push({ ghost, cell: nav.neighbors(nav.cellAt(ghost)).find(next => next.dir === dir) });
  }
  assert.equal(new Set(directions).size, 4, JSON.stringify(directions));
});

test('shortest-path routing takes a detour away from Pac-Man to get around a wall', () => {
  const maze = arena(9);
  for (let row = 1; row < 7; row++) maze[row][4] = 0;
  const nav = GhostNavigation.create(maze, tile), ghost = actor('blinky', 3, 2, 1), pacman = player(5, 2);
  assert.equal(GhostAI.chooseDirection(ghost, { navigation: nav, player: pacman, target: nav.cellAt(pacman) }), 1);
});

test('normal ghosts avoid reversing, but escape dead ends and may share a forced corridor', () => {
  const nav = GhostNavigation.create(corridor(10), tile), pacman = player(1, 3), ghost = actor('blinky', 5, 3);
  const options = { navigation: nav, player: pacman, target: nav.cellAt(pacman) };
  assert.equal(GhostAI.chooseDirection(ghost, options), 0);
  ghost.x = 8.5 * tile;
  assert.equal(GhostAI.chooseDirection(ghost, options), 2);
  ghost.x = 5.5 * tile;
  options.reservations = [{ ghost: actor('pinky', 5, 3), cell: { col: 6, row: 3 } }];
  assert.equal(GhostAI.chooseDirection(ghost, options), 0);
});

test('nearby Pac-Man is caught even by a ghost assigned to a different search area', () => {
  const nav = GhostNavigation.create(arena(), tile), ghost = actor('pinky', 8, 8, 1), pacman = player(9, 8);
  assert.equal(GhostAI.chooseDirection(ghost, { navigation: nav, player: pacman, target: { col: 1, row: 8 } }), 0);
});

test('frightened ghosts maximize path distance without frame-by-frame reversal; eyes return directly', () => {
  const nav = GhostNavigation.create(arena(), tile), ghost = actor('inky', 8, 8), pacman = player(10, 8);
  const options = { navigation: nav, player: pacman, target: nav.cellAt(pacman) };
  ghost.scared = true;
  assert.notEqual(GhostAI.chooseDirection(ghost, options), 0);
  ghost.reversePending = true;
  assert.equal(GhostAI.chooseDirection(ghost, options), 2);
  ghost.scared = false; ghost.reversePending = false; ghost.mode = 'eyes';
  options.target = { col: 1, row: 8 };
  assert.equal(GhostAI.chooseDirection(ghost, options), 2);
  assert.equal(GhostAI.plan([ghost], pacman, nav).size, 0);
});

test('invalid, unreachable or trapped destinations do not send a ghost into a wall', () => {
  const nav = GhostNavigation.create([[0, 0, 0, 0, 0], [0, 1, 0, 1, 0], [0, 0, 0, 0, 0]], tile);
  const ghost = actor('blinky', 1, 1), pacman = player(3, 1);
  assert.equal(GhostAI.chooseDirection(ghost, { navigation: nav, player: pacman, target: { col: 3, row: 1 } }), null);
  const open = GhostNavigation.create(arena(), tile);
  assert.equal(GhostAI.chooseDirection(ghost, { navigation: open, player: pacman, target: null }), null);
  assert.equal(GhostAI.chooseDirection(ghost, { navigation: open, player: pacman, target: { col: 0, row: 0 } }), null);
  assert.equal(GhostAI.plan([actor('inky', 0, 0)], pacman, open).size, 0);
  const hidden = actor('pinky', 2, 2), scared = actor('clyde', 2, 2);
  hidden.mode = 'house'; scared.scared = true;
  assert.equal(GhostAI.plan([hidden, scared], pacman, open).size, 0);
});
