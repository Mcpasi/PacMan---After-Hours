const assert = require('node:assert/strict');
const test = require('node:test');
const { boot } = require('./helpers/game-harness');

test('the new street plan keeps the tunnels, a closed ghost depot and a connected player route network', () => {
  const game = boot();
  const plan = game.run(`(() => {
    const nav = GhostNavigation.create(maze, TILE);
    const start = nav.cellAt(player);
    const layout = CityLayout.create(maze, TILE);
    const home = GhostProfiles.home, exit = GhostProfiles.exit;
    const rows = maze.length, cols = maze[0].length;
    const streetCells = layout.streets.filter(({ row, col }) => maze[row][col] !== 4);
    const accessible = streetCells.filter(cell => Number.isFinite(nav.distance(start, cell)));
    return {
      dimensions: [cols, rows],
      valid: maze.every(row => row.length === cols && row.every(cell => [0, 1, 2, 3, 4].includes(cell))),
      tunnels: layout.tunnels,
      unreachable: streetCells.length - accessible.length,
      depotTiles: streetCells.filter(cell => Number.isFinite(nav.distance(home, cell))).length,
      deadEnds: accessible.filter(cell => nav.neighbors(cell).length < 2).length,
      depotClosed: nav.distance(home, exit) === Infinity,
      ghostRoute: nav.distance(home, exit, true),
      southernLights: maze.slice(24).flat().filter(cell => cell === 2 || cell === 3).length,
      powerLights: maze.flat().filter(cell => cell === 3).length
    };
  })()`);
  assert.deepEqual(Array.from(plan.dimensions), [28, 31]);
  assert.equal(plan.valid, true);
  assert.deepEqual(Array.from(plan.tunnels), [11]);
  assert.equal(plan.unreachable, plan.depotTiles);
  assert.equal(plan.deadEnds, 0);
  assert.equal(plan.depotClosed, true);
  assert.ok(Number.isFinite(plan.ghostRoute) && plan.ghostRoute > 0);
  assert.ok(plan.southernLights > 40);
  assert.equal(plan.powerLights, 4);
});

test('steering along the new streets can collect every light and advance to a fresh level', () => {
  const game = boot({ random: () => 0 });
  game.click();
  const initial = game.run('JSON.stringify(maze)');
  const expectedScore = game.run('maze.flat().reduce((total, cell) => total + (cell === 2 ? 10 : cell === 3 ? 50 : 0), 0)');
  game.run(`
    ghosts = [];
    player.speed = TILE;
    const nav = GhostNavigation.create(maze, TILE);
    const targets = CityLayout.create(maze, TILE).collectibles;
    for (const target of targets) {
      while (maze[target.row][target.col] === 2 || maze[target.row][target.col] === 3) {
        const current = nav.cellAt(player);
        const distance = nav.distance(current, target);
        if (!Number.isFinite(distance)) throw new Error('Unreachable light at ' + JSON.stringify(target));
        // Step off the starting dot and back if it is the next target.
        const next = nav.neighbors(current).find(cell => distance === 0 || nav.distance(cell, target) === distance - 1);
        if (!next) throw new Error('No route from ' + JSON.stringify(current));
        player.nextDir = next.dir;
        updatePlayer();
        if (nav.cellAt(player).index !== next.index) throw new Error('Turn blocked at ' + JSON.stringify(current));
      }
    }
  `);
  assert.equal(game.run('dotsLeft'), 0);
  assert.equal(game.run('score'), expectedScore);
  assert.equal(game.run('gameState'), 'levelComplete');
  game.key('Enter');
  assert.equal(game.run('level'), 2);
  assert.equal(game.run('JSON.stringify(maze)'), initial);
});

for (const cell of [2, 3]) {
  test(`a tunnel-end ${cell === 2 ? 'dot' : 'power pellet'} is collected at its wrapped center and completes the level`, () => {
    const game = boot({ random: () => 0 });
    game.click();
    game.run(`maze = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      maze[11][0] = 1; maze[11][COLS - 1] = ${cell}; dotsLeft = 1;
      Object.assign(player, { x: TILE / 2, y: 11.5 * TILE, dir: 2, nextDir: 2, speed: 1.6 });
      bonusLife = BonusLife.create(maze, TILE, { origin: player });
      for (let tick = 0; tick < 10; tick++) updatePlayer();`);

    assert.equal(game.run('player.x'), -8, 'the player reaches the last column through the left tunnel');
    assert.equal(game.run('GhostNavigation.create(maze, TILE).cellAt(player).col'), 27);
    assert.equal(game.run('maze[11][COLS - 1]'), 1, 'the wrapped tile must be consumed');
    assert.equal(game.run('dotsLeft'), 0);
    assert.equal(game.run('score'), cell === 2 ? 10 : 50);
    assert.equal(game.run('powerMode'), cell === 3);
    assert.equal(game.run('gameState'), 'levelComplete');
    game.run('updatePlayer();');
    assert.equal(game.run('score'), cell === 2 ? 10 : 50, 'the same tile cannot score twice');
  });
}

for (const scared of [false, true]) {
  for (const reversed of [false, true]) {
    test(`${scared ? 'frightened' : 'lethal'} ghost collisions cross the tunnel seam (${reversed ? 'ghost' : 'player'} outside)`, () => {
      const game = boot();
      game.click();
      game.run(`Object.assign(player, { x: ${reversed ? '27.5' : '-0.5'} * TILE, y: 11.5 * TILE });
        Object.assign(ghosts[0], { x: ${reversed ? '-0.5' : '27.5'} * TILE, y: player.y,
          mode: 'chase', scared: ${scared} });
        checkCollisions(); checkCollisions();`);

      assert.equal(game.run('player.alive'), scared);
      assert.equal(game.run('lives'), scared ? 3 : 2, 'a lethal contact costs exactly one life');
      assert.equal(game.run('ghosts[0].mode'), scared ? 'eyes' : 'chase');
      assert.equal(game.run('score'), scared ? 200 : 0, 'a frightened ghost scores exactly once');
      assert.equal(game.run('playerDeath !== null'), !scared);
    });
  }
}

test('tunnel collisions still respect distance, vertical separation and inactive ghost modes', () => {
  for (const { x, row, mode } of [
    { x: 16, row: 11.5, mode: 'chase' },
    { x: -8, row: 10.5, mode: 'chase' },
    { x: -8, row: 11.5, mode: 'house' },
    { x: -8, row: 11.5, mode: 'eyes' }
  ]) {
    const game = boot();
    game.click();
    game.run(`Object.assign(player, { x: ${x}, y: ${row} * TILE });
      Object.assign(ghosts[0], { x: 27.5 * TILE, y: 11.5 * TILE, mode: '${mode}', scared: false });
      checkCollisions();`);
    assert.equal(game.run('player.alive'), true);
    assert.equal(game.run('lives'), 3);
    assert.equal(game.run('score'), 0);
  }
});
