const assert = require('node:assert/strict');
const test = require('node:test');
const GhostNavigation = require('../scripts/ghosts/navigation');
const { arena, tile } = require('./helpers/ghost-fixtures');

test('navigation validates dimensions and handles isolated tiles', () => {
  for (const [maze, size] of [[[], tile], [[[]], tile], [[[1], []], tile], [[[1]], 0], [[[1]], NaN]]) {
    assert.throws(() => GhostNavigation.create(maze, size), TypeError);
  }
  const nav = GhostNavigation.create([[0, 0, 0], [0, 1, 0], [0, 0, 0]], tile);
  assert.deepEqual(nav.neighbors({ col: 1, row: 1 }), []);
  assert.equal(nav.distance({ col: 1, row: 1 }, { col: 1, row: 1 }), 0);
  assert.equal(nav.nearest({ x: 0, y: 0 }, { col: 0, row: 0 }), null);
  assert.deepEqual(nav.neighbors(null), []);
  assert.equal(nav.distance(null, { col: 1, row: 1 }), Infinity);
});

test('path distance goes around walls rather than following the air-line distance', () => {
  const maze = arena(9);
  for (let row = 1; row <= 6; row++) maze[row][4] = 0;
  const nav = GhostNavigation.create(maze, tile);
  assert.equal(nav.distance({ col: 3, row: 2 }, { col: 5, row: 2 }), 12);
  assert.equal(nav.distance({ col: 3, row: 2 }, { col: 4, row: 2 }), Infinity);
  assert.equal(nav.neighbors({ col: 3, row: 2 }).some(next => next.dir === 0), false);
  assert.equal(nav.distance({ col: 3, row: 2 }, { col: 5, row: 2 }), 12, 'cached field is identical');
});

test('projected wall and out-of-map targets are snapped to the origin component', () => {
  const maze = arena(9);
  for (let row = 1; row < 8; row++) maze[row][4] = 0;
  const nav = GhostNavigation.create(maze, tile), origin = { col: 2, row: 3 };
  for (const target of [{ x: 10000, y: 40 }, { x: -1000, y: -1000 }, { x: 72, y: 56 }]) {
    const cell = nav.nearest(target, origin);
    assert.ok(cell.col > 0 && cell.col < 4 && cell.row > 0 && cell.row < 8);
    assert.ok(Number.isFinite(nav.distance(origin, cell)));
  }
  assert.equal(nav.distance(origin, { col: 6, row: 3 }), Infinity);
});

test('ghost doors are available only to the returning-eyes topology', () => {
  const maze = [[0, 0, 0, 0, 0], [0, 1, 4, 1, 0], [0, 0, 0, 0, 0]];
  const nav = GhostNavigation.create(maze, tile), outside = { col: 1, row: 1 }, inside = { col: 3, row: 1 };
  assert.equal(nav.distance(outside, inside), Infinity);
  assert.equal(nav.distance(outside, inside, true), 2);
  assert.equal(nav.neighbors(outside).length, 0);
  assert.equal(nav.neighbors(outside, true)[0].dir, 0);
  assert.equal(nav.nearest(nav.point(inside), outside).col, 1);
  assert.equal(nav.nearest(nav.point(inside), outside, { allowDoor: true }).col, 3);
});

test('only open horizontal edges wrap, preserving cell centers in both directions', () => {
  const nav = GhostNavigation.create([[1, 0, 0, 0, 1], [0, 0, 0, 0, 0], [1, 0, 0, 0, 0]], tile);
  assert.equal(nav.distance({ col: 0, row: 0 }, { col: 4, row: 0 }), 1);
  assert.equal(nav.neighbors({ col: 0, row: 0 })[0].dir, 2);
  assert.equal(nav.neighbors({ col: 4, row: 0 })[0].dir, 0);
  assert.deepEqual(nav.neighbors({ col: 0, row: 2 }), []);
  assert.equal(nav.distance({ col: 0, row: 0 }, { col: 0, row: 2 }), Infinity);
  assert.equal(nav.cellAt({ x: -8, y: 8 }).col, 4);
  assert.equal(nav.cellAt({ x: 88, y: 8 }).col, 0);
  assert.equal(nav.cellAt({ x: 8, y: -8 }), null);
  assert.equal(nav.cellAt({ x: 8, y: 56 }), null);
  assert.deepEqual(nav.point({ col: 4, row: 0 }), { x: 72, y: 8 });
});

test('reserved search areas spread out but a single-tile region remains usable', () => {
  const nav = GhostNavigation.create(arena(9), tile), origin = { col: 4, row: 4 };
  const first = nav.nearest(nav.point(origin), origin);
  const second = nav.nearest(nav.point(origin), origin, { reserved: [first] });
  assert.ok(Math.abs(first.col - second.col) + Math.abs(first.row - second.row) >= 2);
  const single = GhostNavigation.create([[0, 0, 0], [0, 1, 0], [0, 0, 0]], tile);
  assert.equal(single.nearest({ x: 24, y: 24 }, { col: 1, row: 1 }, { reserved: [{ col: 1, row: 1 }] }).col, 1);
});

test('navigation does not mutate the maze and cached fields survive consumed pellets and eviction', () => {
  const maze = arena(12).map(row => row.map(cell => cell ? 2 : 0)), before = structuredClone(maze);
  const nav = GhostNavigation.create(maze, tile), origin = { col: 1, row: 1 };
  for (let row = 1; row <= 8; row++) {
    for (let col = 1; col <= 8; col++) assert.equal(nav.distance(origin, { col, row }), col + row - 2);
  }
  assert.deepEqual(maze, before);
  maze[1][2] = 1;
  assert.equal(nav.distance(origin, { col: 8, row: 8 }), 14);
  assert.equal(nav.distance(origin, { col: 1, row: 1 }), 0);
});
