const assert = require('node:assert/strict');
const test = require('node:test');
const { boot } = require('./helpers/game-harness');

const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function start() {
  const game = boot();
  game.click();
  return game;
}

function swipe(game, dir, options = {}) {
  const [dx, dy] = directions[dir];
  game.pointer('pointerdown', 100, 100, 1, options);
  game.pointer('pointerup', 100 + dx * 30, 100 + dy * 30, 1, options);
}

function crossing(game, dir, offset, speed = 1.3) {
  const [dx, dy] = directions[dir];
  game.run(`
    maze = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    for (let n = 3; n <= 9; n++) { maze[6][n] = 1; maze[n][6] = 1; }
    dotsLeft = 1;
    Object.assign(player, { x: 6.5 * TILE + ${dx * offset}, y: 6.5 * TILE + ${dy * offset},
      dir: ${dir}, nextDir: ${dir}, speed: ${speed} });
  `);
}

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} instead of ${expected}`);
}

test('taps and sub-threshold jitter do not steer; small moves accumulate into the same swipe', () => {
  const game = start();
  game.pointer('pointerdown', 100, 100);
  game.pointer('pointermove', 98, 96);
  game.pointer('pointerup', 101, 101);
  assert.equal(game.run('player.nextDir'), 0);
  game.pointer('pointerdown', 100, 100);
  for (const x of [97, 94, 91]) game.pointer('pointermove', x, 100);
  assert.equal(game.run('player.nextDir'), 0);
  game.pointer('pointermove', 88, 100);
  assert.equal(game.run('player.nextDir'), 2, 'the existing 12 CSS-pixel threshold is retained');
});

test('an ambiguous diagonal does not choose a direction until the swipe becomes clear', () => {
  const game = start();
  game.pointer('pointerdown', 100, 100);
  game.pointer('pointermove', 120, 121);
  assert.equal(game.run('player.nextDir'), 0);
  game.pointer('pointermove', 121, 140);
  assert.equal(game.run('player.nextDir'), 1);
});

test('diagonal finger drift cannot overwrite a buffered turn, but a clear continuous turn can', () => {
  const game = start();
  game.pointer('pointerdown', 100, 100);
  game.pointer('pointermove', 60, 100);
  game.pointer('pointermove', 73, 114);
  assert.equal(game.run('player.nextDir'), 2);
  game.pointer('pointermove', 62, 130);
  assert.equal(game.run('player.nextDir'), 1);
  game.pointer('pointermove', 62, 100);
  assert.equal(game.run('player.nextDir'), 3, 'reversing does not require lifting the finger');
});

test('a second pointer cannot replace an active swipe, even if it reports itself as primary', () => {
  const game = start();
  game.pointer('pointerdown', 100, 100);
  game.pointer('pointerdown', 200, 200, 2);
  game.pointer('pointermove', 240, 200, 2);
  game.pointer('pointercancel', 240, 200, 2);
  game.pointer('pointerup', 60, 100);
  assert.equal(game.run('player.nextDir'), 2);
});

for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  test(`${ending} ends capture without discarding an already buffered direction`, () => {
    const game = start();
    const canvas = game.elements.get('gameCanvas');
    game.pointer('pointerdown', 100, 100);
    assert.equal(canvas.hasPointerCapture(1), true);
    game.pointer('pointermove', 100, 60);
    if (ending === 'lostpointercapture') canvas.releasePointerCapture(1);
    else game.pointer(ending, 100, 60);
    assert.equal(canvas.hasPointerCapture(1), false);
    game.pointer('pointermove', 140, 60);
    assert.equal(game.run('player.nextDir'), 3);
    swipe(game, 2);
    assert.equal(game.run('player.nextDir'), 2, 'a fresh swipe remains usable');
  });
}

const interruptions = {
  pause: game => { game.key('p'); game.key('p'); },
  blur: game => game.run('window.emit("blur");'),
  hidden: game => game.run('document.hidden = true; document.emit("visibilitychange"); document.hidden = false;'),
  respawn: game => {
    game.run('ghosts[0].mode = "chase"; ghosts[0].x = player.x; ghosts[0].y = player.y; checkCollisions();');
    game.respawn();
  },
  restart: game => game.click(),
  level: game => game.run('gameState = "levelComplete"; showOverlay("LEVEL COMPLETE!"); nextLevel();')
};

for (const [name, interrupt] of Object.entries(interruptions)) {
  test(`${name} discards an old finger so it cannot steer after returning to play`, () => {
    const game = start();
    game.pointer('pointerdown', 100, 100);
    interrupt(game);
    const dir = game.run('player.nextDir');
    game.pointer('pointerup', 60, 100);
    assert.equal(game.run('player.nextDir'), dir);
    assert.equal(game.elements.get('gameCanvas').hasPointerCapture(1), false);
    swipe(game, 3);
    assert.equal(game.run('player.nextDir'), 3);
  });
}

test('death immediately releases an active finger rather than waiting for respawn', () => {
  const game = start();
  game.pointer('pointerdown', 100, 100);
  game.run('ghosts[0].mode = "chase"; ghosts[0].x = player.x; ghosts[0].y = player.y; checkCollisions();');
  assert.equal(game.elements.get('gameCanvas').hasPointerCapture(1), false);
  game.pointer('pointermove', 60, 100);
  assert.equal(game.run('player.nextDir'), 0);
});

test('a failed pointer capture is harmless and releasing outside the canvas still ends the swipe', () => {
  const game = start();
  game.elements.get('gameCanvas').setPointerCapture = () => { throw new Error('Inactive pointer'); };
  assert.doesNotThrow(() => game.pointer('pointerdown', 100, 100));
  game.run('window.emit("pointerup", { pointerId: 1, clientX: 60, clientY: 100, pointerType: "touch" });');
  assert.equal(game.run('player.nextDir'), 2);
  game.pointer('pointermove', 100, 140);
  assert.equal(game.run('player.nextDir'), 2);
});

test('non-primary fingers, right mouse buttons and inactive games do not start swipes', () => {
  for (const setup of ['gameState = "title";', 'gameState = "paused";', 'player.alive = false;', '']) {
    for (const options of [{}, { isPrimary: false }, { pointerType: 'mouse', button: 2 }]) {
      if (!setup && !Object.keys(options).length) continue;
      const game = start();
      game.run(setup);
      swipe(game, 2, options);
      assert.equal(game.run('player.nextDir'), 0);
    }
  }
});

test('slightly late touch turns recover the crossing in all directions and at fractional speeds', () => {
  for (const speed of [1.3, 1.6, 2.2]) {
    for (let dir = 0; dir < 4; dir++) {
      for (const turn of [(dir + 1) % 4, (dir + 3) % 4]) {
        const game = start();
        crossing(game, dir, 3, speed);
        swipe(game, turn);
        game.run('updatePlayer();');
        const label = `${dir} -> ${turn} at ${speed}`;
        assert.equal(game.run('player.dir'), turn, label);
        near(game.run('player.x'), 104 + directions[turn][0] * speed, label);
        near(game.run('player.y'), 104 + directions[turn][1] * speed, label);
        game.run('for (let i = 0; i < 10; i++) updatePlayer();');
        near(game.run('player.x'), 104 + directions[turn][0] * speed * 11, label);
        near(game.run('player.y'), 104 + directions[turn][1] * speed * 11, label);
      }
    }
  }
});

test('touch turn forgiveness is bounded to a quarter tile and only applies after a center', () => {
  for (const offset of [-5, 4, 4.01]) {
    const game = start();
    crossing(game, 0, offset);
    swipe(game, 3);
    game.run('updatePlayer();');
    assert.equal(game.run('player.dir'), offset === 4 ? 3 : 0);
    near(game.run('player.x'), offset === 4 ? 104 : 104 + offset + 1.3, `offset ${offset}`);
    if (offset < 0) {
      game.run('for (let i = 0; i < 7; i++) updatePlayer();');
      assert.equal(game.run('player.dir'), 3, 'early swipes stay buffered until the actual center');
      near(game.run('player.x'), 104, 'turn center');
      near(game.run('player.y'), 104 - (8 * 1.3 - 5), 'remaining movement after the turn');
    }
  }
});

test('late touch assistance never cuts through walls or the ghost-house door', () => {
  for (const blocked of [0, 4]) {
    const game = start();
    crossing(game, 0, 3);
    game.run(`maze[5][6] = ${blocked};`);
    swipe(game, 3);
    game.run('updatePlayer();');
    assert.equal(game.run('player.dir'), 0);
    near(game.run('player.x'), 108.3, 'blocked turn must not snap backwards');
    near(game.run('player.y'), 104, 'blocked turn must stay in the corridor');
    assert.equal(game.run('player.nextDir'), 3, 'an unavailable turn remains buffered');
  }
});

test('a buffered touch turn survives release and a wall stop, then turns when the path opens', () => {
  const game = start();
  crossing(game, 0, -5);
  game.run('maze[6][7] = 0; maze[5][6] = 0;');
  swipe(game, 3);
  game.run('for (let i = 0; i < 30; i++) updatePlayer();');
  near(game.run('player.x'), 104, 'stopped at wall');
  assert.equal(game.run('player.nextDir'), 3);
  game.run('maze[5][6] = 1; updatePlayer();');
  assert.equal(game.run('player.dir'), 3);
  assert.ok(game.run('player.y < 104'));
});

test('keyboard input and mouse drags keep exact-center turning, including after a touch request', () => {
  for (const input of ['keyboard', 'keyboardAfterTouch', 'mouse']) {
    const game = start();
    crossing(game, 0, 3);
    if (input === 'keyboardAfterTouch') swipe(game, 3);
    if (input === 'mouse') swipe(game, 3, { pointerType: 'mouse' });
    else game.key('ArrowUp');
    game.run('updatePlayer();');
    assert.equal(game.run('player.dir'), 0, input);
    near(game.run('player.x'), 108.3, input);
  }
});

test('touch reversals between centers are immediate and never snap back to a center', () => {
  const game = start();
  crossing(game, 0, 3);
  swipe(game, 2);
  game.run('updatePlayer();');
  assert.equal(game.run('player.dir'), 2);
  near(game.run('player.x'), 105.7, 'immediate reversal');
});

test('repeated touch turns around real maze corners never stick or drift off the corridor centers', () => {
  for (const speed of [1.3, 2.2]) {
    const game = start();
    game.run(`Object.assign(player, { x: 1.5 * TILE, y: 22.5 * TILE, speed: ${speed} });`);
    for (let lap = 0; lap < 10; lap++) {
      for (const [col, row, turn] of [[6, 22, 3], [6, 20, 2], [1, 20, 1], [1, 22, 0]]) {
        const arrived = game.run(`(() => {
          const x = (${col} + 0.5) * TILE, y = (${row} + 0.5) * TILE;
          for (let tick = 0; tick < 100; tick++) {
            const passed = (player.x - x) * DIRS[player.dir][0] + (player.y - y) * DIRS[player.dir][1];
            if (passed >= 0.5 || (Math.abs(player.x - x) < 1e-6 && Math.abs(player.y - y) < 1e-6 &&
                !canMove(x, y, player.dir))) return true;
            updatePlayer();
          }
          return false;
        })()`);
        assert.equal(arrived, true, `speed ${speed}, lap ${lap}, corner ${col},${row}`);
        swipe(game, turn);
        game.run('updatePlayer();');
        assert.equal(game.run('player.dir'), turn);
        near(game.run('player.x'), (col + 0.5) * 16 + directions[turn][0] * speed, 'corner x');
        near(game.run('player.y'), (row + 0.5) * 16 + directions[turn][1] * speed, 'corner y');
      }
    }
  }
});

test('touch turns cannot leave the horizontal tunnel vertically while wrapping', () => {
  for (const dir of [0, 2]) {
    const game = start();
    game.run(`Object.assign(player, { x: ${dir === 0 ? 27.5 : -0.5} * TILE,
      y: 11.5 * TILE, dir: ${dir}, nextDir: ${dir} });`);
    swipe(game, 3);
    game.run('for (let i = 0; i < 20; i++) updatePlayer();');
    near(game.run('player.y'), 11.5 * 16, 'tunnel row');
    assert.equal(game.run('player.dir'), dir);
    assert.ok(dir === 0 ? game.run('player.x < 40') : game.run('player.x > 400'));
  }
});
