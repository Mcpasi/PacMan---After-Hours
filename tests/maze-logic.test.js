const assert = require('node:assert/strict');
const test = require('node:test');
const { boot } = require('./helpers/game-harness');

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
