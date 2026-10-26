const assert = require('node:assert/strict');
const test = require('node:test');
const { boot } = require('./helpers/game-harness');

function eatAt(game, col, row) {
  game.run(`Object.assign(player, { x: ${col + 0.5} * TILE, y: ${row + 0.5} * TILE, speed: 0 }); updatePlayer();`);
  assert.equal(game.run(`maze[${row}][${col}]`), 1);
}

function collide(game) {
  game.run(`Object.assign(ghosts[0], { mode: 'chase', scared: false, x: player.x, y: player.y }); checkCollisions();`);
  assert.equal(game.run('player.alive'), false);
}

for (const level of [1, 4]) {
  test(`the first two deaths preserve dots, power pellets, score and level ${level}`, () => {
    const game = boot();
    game.click();
    game.run(`level = ${level}; resetLevel(false); globalThis.progressMaze = maze;`);
    eatAt(game, 1, 3);
    game.run('powerTimer = 1; updateGhosts();');

    for (const remainingLives of [2, 1]) {
      const col = 3 - remainingLives;
      eatAt(game, col, 1);
      const maze = game.run('JSON.stringify(maze)');
      const score = game.run('score'), dotsLeft = game.run('dotsLeft');
      collide(game);
      assert.equal(game.run('lives'), remainingLives);
      game.run('checkCollisions();');
      assert.equal(game.run('lives'), remainingLives, 'a dead player cannot lose another life');
      game.respawn();

      assert.equal(game.run('player.alive'), true);
      assert.equal(game.run('gameState'), 'playing');
      assert.equal(game.run('level'), level);
      assert.equal(game.run('maze === progressMaze'), true);
      assert.equal(game.run('JSON.stringify(maze)'), maze);
      assert.equal(game.run('dotsLeft'), dotsLeft);
      assert.equal(game.run('dotsLeft'), game.run('maze.flat().filter(cell => cell === 2 || cell === 3).length'));
      assert.equal(game.run('score'), score);
      assert.equal(game.run('highScore'), score);
      assert.equal(game.elements.get('score').textContent, 'SCORE: ' + score);
      assert.equal(game.elements.get('lives').children.length, remainingLives);

      eatAt(game, col, 1);
      eatAt(game, 1, 3);
      assert.equal(game.run('score'), score, 'consumed tiles cannot award points again');
      assert.equal(game.run('dotsLeft'), dotsLeft);
      assert.equal(game.run('powerMode'), false, 'a consumed power pellet cannot activate again');
    }
  });
}

test('respawn resets actors, temporary power state and the clock without rebuilding the maze or renderer', () => {
  const game = boot({ reducedMotion: true });
  game.click();
  game.run('level = 4; resetLevel(false);');
  const actors = game.run('JSON.stringify({ player, ghosts })');
  game.run(`globalThis.layouts = [];
    GameRenderer.setEnvironment({ name: 'test', setLayout: layout => layouts.push(layout), draw() {} });`);
  eatAt(game, 1, 3);
  const maze = game.run('JSON.stringify(maze)');
  game.run(`player.dir = 2; player.nextDir = 3; player.mouth = 0.3; player.mouthDir = -1;
    Object.assign(ghosts[1], { mode: 'eyes', scared: true, reversePending: true, target: { x: 24, y: 24 } });
    Object.assign(ghosts[2], { mode: 'chase', scared: true, houseTimer: 0 });
    ghosts[3].houseTimer = 1;
    powerTimer = 123; ghostEatCombo = 3; lastTime = 17; simulationAccumulator = 5;`);
  collide(game);
  game.respawn();

  assert.equal(game.run('JSON.stringify({ player, ghosts })'), actors);
  assert.equal(game.run('powerMode'), false);
  assert.equal(game.run('powerTimer'), 0);
  assert.equal(game.run('ghostEatCombo'), 0);
  assert.equal(game.run('lastTime'), null);
  assert.equal(game.run('simulationAccumulator'), 0);
  assert.equal(game.run('JSON.stringify(maze)'), maze);
  assert.equal(game.run('layouts.length'), 1);

  game.drawing.length = 0;
  game.advance(); // Establish the new clock and render without a simulation tick.
  assert.equal(game.drawing.filter(([method, , , radius]) => method === 'arc' && radius === 1.8).length,
    game.run('maze.flat().filter(cell => cell === 2).length'));
  assert.equal(game.drawing.some(([method, x, y, radius]) =>
    method === 'arc' && x === 1.5 * 16 && y === 3.5 * 16 && radius === 4.5), false);
});

test('the final remaining dot still completes the level after respawn and the next level restores all collectibles', () => {
  const game = boot();
  game.click();
  const freshMaze = game.run('JSON.stringify(maze)'), totalDots = game.run('dotsLeft');
  game.run(`player.speed = 0;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if ((row === 1 && col === 1) || (maze[row][col] !== 2 && maze[row][col] !== 3)) continue;
        player.x = (col + 0.5) * TILE; player.y = (row + 0.5) * TILE;
        updatePlayer();
      }
    }
    powerTimer = 1; updateGhosts();`);
  assert.equal(game.run('dotsLeft'), 1);
  collide(game);
  game.respawn();
  assert.equal(game.run('dotsLeft'), 1);
  assert.equal(game.run('gameState'), 'playing');

  const score = game.run('score');
  eatAt(game, 1, 1);
  assert.equal(game.run('score'), score + 10);
  assert.equal(game.run('dotsLeft'), 0);
  assert.equal(game.run('gameState'), 'levelComplete');
  game.click('ovBtn');
  assert.equal(game.run('gameState'), 'playing');
  assert.equal(game.run('level'), 2);
  assert.equal(game.run('lives'), 2);
  assert.equal(game.run('score'), score + 10);
  assert.equal(game.run('dotsLeft'), totalDots);
  assert.equal(game.run('JSON.stringify(maze)'), freshMaze);
});

const restartControls = {
  button: game => game.click('ovBtn'),
  Enter: game => game.key('Enter'),
  Space: game => game.key(' ')
};

for (const [name, restart] of Object.entries(restartControls)) {
  test(`only the third death ends the game, then ${name} restarts with a fresh maze`, () => {
    const game = boot();
    game.click();
    game.run('level = 3; resetLevel(false);');
    const freshMaze = game.run('JSON.stringify(maze)'), totalDots = game.run('dotsLeft');
    eatAt(game, 1, 1);
    eatAt(game, 1, 3);
    game.run('powerTimer = 1; updateGhosts();');
    const progress = game.run('JSON.stringify(maze)'), score = game.run('score');

    for (const remainingLives of [2, 1, 0]) {
      collide(game);
      assert.equal(game.run('lives'), remainingLives);
      assert.equal(game.run('gameState'), 'playing', 'keep the death delay before showing game over');
      game.respawn();
      assert.equal(game.run('gameState'), remainingLives > 0 ? 'playing' : 'gameOver');
      assert.equal(game.run('player.alive'), remainingLives > 0);
      assert.equal(game.run('level'), 3);
      assert.equal(game.run('score'), score);
      assert.equal(game.run('JSON.stringify(maze)'), progress);
      assert.equal(game.run('dotsLeft'), totalDots - 2);
    }

    assert.match(game.elements.get('overlay').innerHTML, /GAME OVER/);
    assert.ok(game.elements.get('overlay').innerHTML.includes('Final Score: ' + score));
    restart(game);
    assert.equal(game.run('gameState'), 'playing');
    assert.equal(game.run('player.alive'), true);
    assert.equal(game.run('level'), 1);
    assert.equal(game.run('lives'), 3);
    assert.equal(game.run('score'), 0);
    assert.equal(game.run('highScore'), score);
    assert.equal(game.run('JSON.stringify(maze)'), freshMaze);
    assert.equal(game.run('dotsLeft'), totalDots);
    assert.equal(game.elements.get('overlay').style.display, 'none');
    assert.equal(game.elements.get('score').textContent, 'SCORE: 0');
    assert.equal(game.elements.get('lives').children.length, 3);
  });
}
