const assert = require('node:assert/strict');
const test = require('node:test');
const { boot } = require('./helpers/game-harness');

const speedsByLevel = [
  [1.3, [1.2, 1.14, 1.1, 1.06]],
  [1.4, [1.28, 1.22, 1.18, 1.14]],
  [1.5, [1.36, 1.3, 1.26, 1.22]],
  [1.6, [1.44, 1.38, 1.34, 1.3]],
  [1.7, [1.52, 1.46, 1.42, 1.38]],
  [1.8, [1.6, 1.54, 1.5, 1.46]],
  [1.9, [1.68, 1.62, 1.58, 1.54]],
  [2, [1.76, 1.7, 1.66, 1.62]],
  [2.1, [1.84, 1.78, 1.74, 1.7]],
  [2.2, [1.9, 1.86, 1.82, 1.78]],
  [2.2, [1.9, 1.9, 1.9, 1.86]],
  [2.2, [1.9, 1.9, 1.9, 1.9]]
];

function assertSpeeds(game, level) {
  const [playerSpeed, ghostSpeeds] = speedsByLevel[Math.min(level, speedsByLevel.length) - 1];
  assert.equal(game.run('level'), level);
  assert.equal(game.run('player.speed'), playerSpeed);
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(ghosts.map(ghost => ghost.speed))')), ghostSpeeds);
}

function completeLevel(game) {
  game.run('dotsLeft = 0; updatePlayer();');
  assert.equal(game.run('gameState'), 'levelComplete');
}

const controls = {
  button: game => game.click('ovBtn'),
  Enter: game => game.key('Enter'),
  Space: game => game.key(' ')
};

test('the title and a new game use the gentler first-level speeds for every actor', () => {
  const game = boot();
  assertSpeeds(game, 1);
  game.click();
  assertSpeeds(game, 1);
});

for (const [name, proceed] of Object.entries(controls)) {
  test(`${name} advances cumulative level speeds up to their caps without changing score or lives`, () => {
    const game = boot();
    game.click();
    for (let level = 2; level <= speedsByLevel.length + 3; level++) {
      completeLevel(game);
      const score = game.run('score'), lives = game.run('lives');
      proceed(game);
      assert.equal(game.run('gameState'), 'playing');
      assert.equal(game.elements.get('overlay').style.display, 'none');
      assertSpeeds(game, level);
      assert.equal(game.run('score'), score);
      assert.equal(game.run('lives'), lives);
    }
    assert.deepEqual(JSON.parse(game.run('JSON.stringify(GhostProfiles.all.map(profile => profile.speed))')),
      speedsByLevel[0][1], 'level progression must not mutate the identity profiles');
  });
}

test('switching between button and keyboard keeps one progression and ignores repeated continuation', () => {
  const game = boot();
  game.click();
  let level = 1;
  for (const proceed of [controls.button, controls.Enter, controls.Space, controls.button]) {
    completeLevel(game);
    game.key('Enter', true);
    assert.equal(game.run('gameState'), 'levelComplete');
    assertSpeeds(game, level);
    proceed(game);
    level++;
    game.key('Enter');
    game.key(' ');
    game.click('ovBtn');
    assertSpeeds(game, level);
  }
});

test('the shared next-level transition cannot advance outside a completed level', () => {
  const game = boot();
  for (const state of ['title', 'playing', 'paused', 'gameOver']) {
    game.run(`gameState = '${state}'; nextLevel();`);
    assert.equal(game.run('gameState'), state);
    assertSpeeds(game, 1);
  }
});

test('life loss and same-level resets preserve earned speeds; pause does not advance the level', () => {
  const game = boot();
  game.click();
  for (let level = 2; level <= 4; level++) {
    completeLevel(game);
    controls.button(game);
  }
  game.run('ghosts[0].mode = "chase"; ghosts[0].x = player.x; ghosts[0].y = player.y; checkCollisions();');
  assert.equal(game.run('lives'), 2);
  game.respawn();
  assert.equal(game.run('player.alive'), true);
  assertSpeeds(game, 4);
  game.run('resetLevel(false);');
  assertSpeeds(game, 4);
  game.key('p');
  game.click('ovBtn');
  assertSpeeds(game, 4);
  completeLevel(game);
  controls.Enter(game);
  assertSpeeds(game, 5);
});

for (const [name, restart] of Object.entries(controls)) {
  test(`${name} restarts at level one after game over`, () => {
    const game = boot();
    game.click();
    for (let level = 2; level <= 3; level++) {
      completeLevel(game);
      controls.button(game);
    }
    game.run('lives = 1; ghosts[0].mode = "chase"; ghosts[0].x = player.x; ghosts[0].y = player.y; checkCollisions();');
    game.respawn();
    assert.equal(game.run('gameState'), 'gameOver');
    restart(game);
    assert.equal(game.run('gameState'), 'playing');
    assert.equal(game.run('score'), 0);
    assert.equal(game.run('lives'), 3);
    assertSpeeds(game, 1);
  });
}

test('level speeds affect actual player and ghost displacement, not only their properties', () => {
  for (const level of [1, 2, 3, 7, 10, 11, 12]) {
    const game = boot();
    game.click();
    for (let next = 2; next <= level; next++) {
      completeLevel(game);
      controls.button(game);
    }
    const [playerSpeed, ghostSpeeds] = speedsByLevel[Math.min(level, speedsByLevel.length) - 1];
    const x = game.run('player.x');
    game.run('for (let frame = 0; frame < 30; frame++) updatePlayer();');
    assert.ok(Math.abs(game.run('player.x') - x - 30 * playerSpeed) < 1e-6);
    for (let index = 0; index < ghostSpeeds.length; index++) {
      const distance = game.run(`(() => {
        const ghost = ghosts[${index}];
        Object.assign(ghost, { x: 13.5 * TILE, y: 22.5 * TILE, dir: 0, mode: 'chase' });
        let distance = 0;
        for (let frame = 0; frame < 30; frame++) {
          const x = ghost.x, y = ghost.y;
          ghostController.update([ghost], player, false);
          distance += Math.abs(ghost.x - x) + Math.abs(ghost.y - y);
        }
        return distance;
      })()`);
      assert.ok(Math.abs(distance - 30 * ghostSpeeds[index]) < 1e-6, `level ${level}, ghost ${index}`);
    }
  }
});

test('frightened and eye speeds override but never overwrite the earned chase speed', () => {
  const game = boot();
  game.click();
  for (let level = 2; level <= 4; level++) {
    completeLevel(game);
    controls.button(game);
  }
  for (let index = 0; index < 4; index++) {
    for (const [mode, scared, expectedSpeed] of [['chase', true, 0.9], ['eyes', true, 2.4],
      ['chase', false, speedsByLevel[3][1][index]]]) {
      const distance = game.run(`(() => {
        const ghost = ghosts[${index}];
        Object.assign(ghost, { x: 13.5 * TILE, y: 22.5 * TILE, dir: 0,
          mode: '${mode}', scared: ${scared}, reversePending: false });
        const x = ghost.x, y = ghost.y;
        ghostController.update([ghost], player, ${scared});
        return Math.hypot(ghost.x - x, ghost.y - y);
      })()`);
      assert.ok(Math.abs(distance - expectedSpeed) < 1e-6, `ghost ${index}, ${mode}, scared ${scared}`);
      assertSpeeds(game, 4);
    }
  }
});
