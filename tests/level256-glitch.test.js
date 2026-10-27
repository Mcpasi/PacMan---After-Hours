const assert = require('node:assert/strict');
const test = require('node:test');
const Level256Glitch = require('../scripts/level256-glitch');
const { boot } = require('./helpers/game-harness');

function advance(glitch, ticks) {
  for (let tick = 0; tick < ticks; tick++) glitch.update();
}

test('the first glitch waits a random 45–75 active seconds, independently of any level number', () => {
  for (const random of [0, 0.25, 0.9, 1 - Number.EPSILON]) {
    const glitch = Level256Glitch.create({ random: () => random });
    const wait = Math.round((45 + random * 30) * 60);
    assert.equal(glitch.state.ticksUntilGlitch, wait);
    advance(glitch, wait - 1);
    assert.equal(glitch.state.effect, null);
    glitch.update();
    assert.equal(glitch.state.effect.phase, 'lamps');
    assert.equal(glitch.state.effect.age, 0);
  }
  for (const level of [1, 4, 255, 256, 300]) {
    const game = boot({ random: () => 0 }); game.click();
    game.run(`level = ${level}; resetLevel(false); level256Glitch.state.ticksUntilGlitch = 1;
      ghosts = []; player.speed = 0; GameRenderer.render = () => {};`);
    game.advance(2);
    assert.equal(game.run('level256Glitch.state.effect.phase'), 'lamps', `level ${level}`);
  }
});

test('lamps, local corruption and left symbols run in order for about four seconds, then disappear completely', () => {
  for (const ticksPerSecond of [20, 60, 120]) {
    const glitch = Level256Glitch.create({ ticksPerSecond, random: () => 0.5 });
    advance(glitch, glitch.state.ticksUntilGlitch);
    const seed = glitch.state.effect.seed;
    let total = 0;
    for (const [phase, seconds] of [['lamps', 2.2], ['cluster', 1.05], ['symbols', 0.8]]) {
      const duration = Math.round(seconds * ticksPerSecond);
      assert.equal(glitch.state.effect.phase, phase);
      assert.equal(glitch.state.effect.seed, seed);
      assert.equal(glitch.state.effect.duration, duration);
      advance(glitch, duration - 1);
      assert.equal(glitch.state.effect.phase, phase);
      assert.equal(glitch.state.effect.age, duration - 1);
      glitch.update();
      total += duration;
    }
    assert.equal(total / ticksPerSecond, 4.05);
    assert.equal(glitch.state.effect, null);
    assert.equal(glitch.state.ticksUntilGlitch, 130 * ticksPerSecond);
  }
});

test('each repeat gets a fresh random seed and a full 100–160 second quiet interval', () => {
  const values = [0, 0.1, 0.5, 0.8, 0.99];
  let calls = 0;
  const glitch = Level256Glitch.create({ random: () => values[calls++] });
  advance(glitch, glitch.state.ticksUntilGlitch);
  const firstSeed = glitch.state.effect.seed;
  advance(glitch, 243);
  assert.equal(glitch.state.effect, null);
  assert.equal(glitch.state.ticksUntilGlitch, 130 * 60);
  assert.equal(calls, 3, 'randomness is sampled at event boundaries, not every frame');
  advance(glitch, glitch.state.ticksUntilGlitch - 1);
  assert.equal(glitch.state.effect, null);
  glitch.update();
  assert.notEqual(glitch.state.effect.seed, firstSeed);
  advance(glitch, 243);
  assert.equal(glitch.state.ticksUntilGlitch, Math.round(159.4 * 60));
});

test('invalid tick rates and random sources are rejected', () => {
  for (const ticksPerSecond of [0, -1, Infinity, NaN]) {
    assert.throws(() => Level256Glitch.create({ ticksPerSecond }), TypeError);
  }
  assert.throws(() => Level256Glitch.create({ random: null }), TypeError);
});

test('title, pause, level-complete and game-over screens freeze both the wait and an active effect', () => {
  const game = boot({ random: () => 0 });
  game.run('GameRenderer.render = () => {};');
  for (const active of [false, true]) {
    if (active) game.run('level256Glitch.state.ticksUntilGlitch = 1; level256Glitch.update();');
    for (const state of ['title', 'paused', 'levelComplete', 'gameOver']) {
      game.run(`gameState = '${state}';`);
      const before = game.run('JSON.stringify(level256Glitch.state)');
      game.advance(10);
      assert.equal(game.run('JSON.stringify(level256Glitch.state)'), before, `${state}, active=${active}`);
    }
  }
});

test('pause and death freeze corruption without spending the cooldown or restarting the sequence', () => {
  const game = boot({ random: () => 0 }); game.click();
  game.run(`level256Glitch.state.ticksUntilGlitch = 1; level256Glitch.update();
    GameRenderer.render = () => {}; player.speed = 0;`);
  game.key('p');
  const paused = game.run('JSON.stringify(level256Glitch.state)');
  game.advance(10);
  assert.equal(game.run('JSON.stringify(level256Glitch.state)'), paused);
  game.key('p');
  game.run(`Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
  const dead = game.run('JSON.stringify(level256Glitch.state)');
  game.advance(20);
  assert.equal(game.run('JSON.stringify(level256Glitch.state)'), dead);
  game.respawn();
  assert.equal(game.run('JSON.stringify(level256Glitch.state)'), dead);
  game.run('ghosts = [];'); game.advance(3);
  assert.ok(game.run('level256Glitch.state.effect.age > 0'));
});

test('level changes and respawns preserve the run-wide wait; only a new game resets it', () => {
  const game = boot({ random: () => 0 }); game.click();
  game.run(`globalThis.originalGlitch = level256Glitch; level256Glitch.state.ticksUntilGlitch = 1234;
    resetActors(); gameState = 'levelComplete'; nextLevel();`);
  assert.equal(game.run('level256Glitch === originalGlitch'), true);
  assert.equal(game.run('level256Glitch.state.ticksUntilGlitch'), 1234);
  game.run('level256Glitch.state.ticksUntilGlitch = 1; level256Glitch.update(); resetLevel(false);');
  assert.equal(game.run('level256Glitch.state.effect.phase'), 'lamps');
  game.click();
  assert.equal(game.run('level256Glitch === originalGlitch'), false);
  assert.equal(game.run('level256Glitch.state.effect'), null);
  assert.equal(game.run('level256Glitch.state.ticksUntilGlitch'), 2700);
});

for (const fps of [20, 60, 144]) {
  test(`random onset and every phase follow simulation time at ${fps} rendering FPS`, () => {
    const game = boot({ random: () => 0 }); game.click();
    game.run('ghosts = []; player.speed = 0; GameRenderer.render = () => {};');
    game.frameAt(0);
    let previous = 0;
    for (const [end, phase, age] of [[45000, 'lamps', 0], [47200, 'cluster', 0],
      [48250, 'symbols', 0], [49050, null, null]]) {
      for (let frame = 1; previous + frame * 1000 / fps < end - 1e-7; frame++) {
        game.frameAt(previous + frame * 1000 / fps);
      }
      game.frameAt(end);
      assert.equal(game.run('level256Glitch.state.effect?.phase ?? null'), phase);
      assert.equal(game.run('level256Glitch.state.effect?.age ?? null'), age);
      previous = end;
    }
    assert.equal(game.run('level256Glitch.state.ticksUntilGlitch'), 6000);
  });
}

test('the visual event cannot alter maze, actors, scores, lives, power or bonus state', () => {
  const game = boot({ random: () => 0 }); game.click();
  game.run('level256Glitch.state.ticksUntilGlitch = 1;');
  const before = game.run('JSON.stringify({ maze, player, ghosts, score, lives, dotsLeft, powerTimer, bonus: bonusLife.state })');
  game.run(`for (let tick = 0; tick < 245; tick++) {
    level256Glitch.update();
    GameRenderer.render(tick * 1000 / 60, { maze, player, ghosts, powerTimer, animFrame, gameState,
      bonusLife: bonusLife.state, level256Glitch: level256Glitch.state.effect });
  }`);
  assert.equal(game.run('JSON.stringify({ maze, player, ghosts, score, lives, dotsLeft, powerTimer, bonus: bonusLife.state })'), before);
});
