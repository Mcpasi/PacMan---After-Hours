const assert = require('node:assert/strict');
const test = require('node:test');
const { boot } = require('./helpers/game-harness');

const step = 1000 / 60;
const rates = [20, 30, 60, 120, 144, 240];

function start(setup = '', render = false) {
  const game = boot();
  game.click();
  game.run(setup);
  if (!render) game.run('globalThis.renderCalls = 0; GameRenderer.render = () => { renderCalls++; };');
  game.frameAt(0);
  return game;
}

function advanceUntil(game, end, fps) {
  for (let frame = 1; frame * 1000 / fps < end - 1e-7; frame++) {
    game.frameAt(frame * 1000 / fps);
  }
  game.frameAt(end);
}

function snapshot(game) {
  return game.run(`JSON.stringify({ maze, player, ghosts, score, lives, dotsLeft,
    powerMode, powerTimer, ghostEatCombo, animFrame, gameState })`);
}

for (const level of [1, 4, 12]) {
  test(`level ${level} movement, AI and collectibles are identical at different rendering rates`, () => {
    let expected;
    for (const fps of rates) {
      const game = start(`level = ${level}; resetLevel(false);`);
      const x = game.run('player.x'), speed = { 1: 1.3, 4: 1.6, 12: 2.2 }[level];
      assert.equal(game.run('player.speed'), speed);
      advanceUntil(game, 1000, fps);
      assert.equal(game.run('animFrame'), 60, `${fps} FPS`);
      assert.ok(Math.abs(game.run('player.x') - x - speed * 60) < 1e-6, `${fps} FPS`);
      assert.ok(game.run('score') > 0);
      expected ??= snapshot(game);
      assert.equal(snapshot(game), expected, `${fps} FPS`);
      assert.equal(game.run('renderCalls'), fps + 1, 'rendering must not be limited to simulation ticks');
      assert.equal(game.frames.length, 1, 'rendering must keep scheduling exactly one callback');
    }
  });
}

test('uneven frames retain partial ticks and produce the same simulation as steady 60 FPS', () => {
  const steady = start(), uneven = start();
  advanceUntil(steady, 1000, 60);
  const intervals = [4, 7, 31, 2, 80, 13, 23, 1];
  let timestamp = 0, index = 0;
  while (timestamp < 1000) {
    timestamp = Math.min(1000, timestamp + intervals[index++ % intervals.length]);
    uneven.frameAt(timestamp);
  }
  assert.equal(snapshot(uneven), snapshot(steady));
});

for (const fps of rates) {
  test(`power pellets last eight simulation seconds at ${fps} FPS`, () => {
    const game = start(`player.x = 1.5 * TILE; player.y = 3.5 * TILE; player.speed = 0;
      ghosts.forEach(ghost => { ghost.mode = 'chase'; }); updatePlayer();`);
    assert.equal(game.run('powerMode'), true);
    advanceUntil(game, 8000 - step, fps);
    assert.equal(game.run('powerTimer'), 1);
    assert.equal(game.run('powerMode'), true);
    assert.equal(game.run('ghosts.every(ghost => ghost.scared)'), true);
    game.frameAt(8000);
    assert.equal(game.run('powerTimer'), 0);
    assert.equal(game.run('powerMode'), false);
    assert.equal(game.run('ghosts.every(ghost => !ghost.scared && !ghost.reversePending)'), true);
    assert.equal(game.run('player.alive'), true);
  });

  test(`ghost-house releases keep their one-second spacing at ${fps} FPS`, () => {
    const game = start();
    for (let frame = 1; frame <= fps * 3; frame++) {
      game.frameAt(frame * 1000 / fps);
      if (frame % fps === 0) {
        const seconds = frame / fps;
        assert.equal(game.run('ghosts.filter(ghost => ghost.mode === "chase").length'), seconds + 1);
      }
    }
  });
}

const resumeControls = {
  P: game => game.key('p'),
  Escape: game => game.key('Escape'),
  Enter: game => game.key('Enter'),
  Space: game => game.key(' '),
  button: game => game.click('ovBtn')
};

for (const [name, resume] of Object.entries(resumeControls)) {
  test(`${name} resumes without accumulating paused time or retaining an old partial tick`, () => {
    const game = start('powerMode = true; powerTimer = 480;');
    game.frameAt(step / 2);
    game.key('p');
    const before = snapshot(game);
    game.frameAt(60000);
    assert.equal(snapshot(game), before);
    resume(game);
    const resumed = snapshot(game);
    game.frameAt(120000);
    game.frameAt(120000 + step / 2);
    assert.equal(snapshot(game), resumed);
    game.frameAt(120000 + step);
    assert.equal(game.run('animFrame'), 1);
    assert.equal(game.run('powerTimer'), 479);
  });
}

test('pausing and resuming between render callbacks cannot fast-forward the game', () => {
  const game = start();
  game.frameAt(step / 2);
  const before = snapshot(game);
  game.key('p');
  game.key('p');
  game.frameAt(60000);
  assert.equal(snapshot(game), before);
});

const resets = {
  restart: game => game.click(),
  level: game => { game.run('gameState = "levelComplete"; nextLevel();'); },
  reset: game => { game.run('resetLevel(false);'); },
  respawn: game => {
    game.run(`Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
    game.respawn();
  }
};

for (const [name, reset] of Object.entries(resets)) {
  test(`${name} starts with a fresh clock rather than stale elapsed time`, () => {
    const game = start();
    game.frameAt(step / 2);
    reset(game);
    const before = snapshot(game), x = game.run('player.x');
    game.frameAt(60000);
    game.frameAt(60000 + step / 2);
    assert.equal(snapshot(game), before);
    game.frameAt(60000 + step);
    assert.ok(game.run('player.x') > x);
  });
}

test('the first timestamp and duplicate timestamps do not advance simulation', () => {
  const game = boot();
  game.click();
  const before = snapshot(game);
  game.frameAt(60000);
  game.frameAt(60000);
  assert.equal(snapshot(game), before);
  game.frameAt(60000 + step);
  assert.equal(game.run('animFrame'), 1);
});

test('long frame gaps have bounded catch-up with no backlog on following frames', () => {
  const game = start();
  const x = game.run('player.x'), speed = game.run('player.speed');
  game.frameAt(60000);
  assert.equal(game.run('animFrame'), 6);
  assert.ok(Math.abs(game.run('player.x') - x - 6 * speed) < 1e-6);
  game.frameAt(60000);
  assert.equal(game.run('animFrame'), 6);
  game.frameAt(60000 + step);
  assert.equal(game.run('animFrame'), 7);
});

test('catch-up checks collisions in every simulation tick and costs only one life', () => {
  const game = start(`ghosts = [ghosts[0]];
    Object.assign(ghosts[0], { mode: 'chase',
      x: player.x + TILE * 0.7 + 5.5 * (player.speed + ghosts[0].speed), y: player.y, dir: 2 });`);
  game.frameAt(100);
  assert.equal(game.run('player.alive'), false);
  assert.equal(game.run('lives'), 2);
  game.frameAt(200);
  assert.equal(game.run('lives'), 2);
});

test('level completion stops catch-up immediately, before ghosts or collisions advance', () => {
  const game = start('dotsLeft = 0;');
  const ghosts = game.run('JSON.stringify(ghosts)');
  game.frameAt(100);
  assert.equal(game.run('gameState'), 'levelComplete');
  assert.equal(game.run('animFrame'), 1);
  assert.equal(game.run('JSON.stringify(ghosts)'), ghosts);
  assert.equal(game.run('simulationAccumulator'), 0);
});

test('READY lasts 1.5 simulation seconds rather than 90 render callbacks', () => {
  const game = start('', true);
  advanceUntil(game, 1000, 120);
  assert.equal(game.run('animFrame'), 60);
  assert.ok(game.drawing.some(([method, text]) => method === 'fillText' && text === 'READY!'));
  game.drawing.length = 0;
  for (let frame = 121; frame <= 180; frame++) game.frameAt(frame * 1000 / 120);
  game.drawing.length = 0;
  game.frameAt(1500);
  assert.equal(game.run('animFrame'), 90);
  assert.equal(game.drawing.some(([method, text]) => method === 'fillText' && text === 'READY!'), false);
});
