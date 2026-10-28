const assert = require('node:assert/strict');
const test = require('node:test');
const RetroWorld = require('../scripts/retro-world');
const Level256Glitch = require('../scripts/level256-glitch');
const { boot } = require('./helpers/game-harness');

function advance(world, ticks) {
  for (let tick = 0; tick < ticks; tick++) world.update();
}

for (const ticksPerSecond of [20, 60, 120]) {
  test(`the 1980 world waits briefly, fades slowly, holds 30 full seconds and returns at ${ticksPerSecond} Hz`, () => {
    const world = RetroWorld.create({ ticksPerSecond });
    advance(world, 1000);
    assert.deepEqual(world.state, { phase: 'idle', age: 0, duration: 0, mix: 0 });
    assert.equal(world.trigger(), true);
    for (const [phase, seconds, from, to] of [
      ['delay', 1.5, 0, 0], ['fadeIn', 8, 0, 1], ['hold', 30, 1, 1], ['fadeOut', 6, 1, 0]
    ]) {
      const duration = seconds * ticksPerSecond;
      assert.equal(world.state.phase, phase);
      assert.equal(world.state.duration, duration);
      assert.equal(world.state.age, 0);
      assert.equal(world.state.mix, from);
      let previous = from;
      for (let tick = 1; tick < duration; tick++) {
        world.update();
        const mix = world.state.mix;
        assert.ok(mix >= 0 && mix <= 1);
        if (from === to) assert.equal(mix, from, 'delay and the entire 30-second hold stay constant');
        else {
          assert.ok((mix - previous) * (to - from) > 0, 'crossfades are strictly monotonic');
          assert.ok(Math.abs(mix - previous) < 2 / duration, 'no abrupt visual jumps');
          if (tick === duration / 2) assert.equal(mix, 0.5);
        }
        previous = mix;
      }
      world.update();
      assert.equal(world.state.mix, to);
    }
    assert.deepEqual(world.state, { phase: 'idle', age: 0, duration: 0, mix: 0 });
    advance(world, 10000);
    assert.equal(world.state.phase, 'idle', 'time travel never starts on its own');
    assert.equal(world.trigger(), true, 'the next glitch can start a fresh visit');
  });
}

test('invalid tick rates are rejected and duplicate triggers cannot restart an active visit', () => {
  for (const ticksPerSecond of [0, -1, NaN, Infinity]) {
    assert.throws(() => RetroWorld.create({ ticksPerSecond }), TypeError);
  }
  const world = RetroWorld.create();
  world.trigger();
  for (const ticks of [20, 100, 500, 1700]) {
    advance(world, ticks);
    const before = structuredClone(world.state);
    assert.equal(world.trigger(), false);
    assert.deepEqual(world.state, before);
  }
});

test('every glitch emits exactly one onset, including repeats with the same random seed', () => {
  const world = RetroWorld.create();
  let onsets = 0;
  const glitch = Level256Glitch.create({ random: () => 0, onStart() { onsets++; world.trigger(); } });
  function tick(count) {
    for (let index = 0; index < count; index++) { world.update(); glitch.update(); }
  }
  for (let repeat = 1; repeat <= 3; repeat++) {
    tick(glitch.state.ticksUntilGlitch - 1);
    assert.equal(onsets, repeat - 1);
    assert.equal(world.state.phase, 'idle');
    tick(1);
    assert.equal(onsets, repeat);
    assert.equal(world.state.phase, 'delay');
    assert.equal(world.state.age, 0);
    tick(243);
    assert.equal(onsets, repeat, 'phase changes must not trigger another visit');
    assert.equal(glitch.state.effect, null);
    assert.equal(world.state.phase, 'fadeIn', 'the world transition outlasts the corruption');
  }
  assert.throws(() => Level256Glitch.create({ onStart: null }), TypeError);
});

for (const fps of [20, 60, 144]) {
  test(`the real loop, clock and renderer follow simulation time at ${fps} rendering FPS`, () => {
    const game = boot({ random: () => 0 }); game.click();
    game.run(`ghosts = []; player.speed = 0;
      globalThis.worldFrames = [];
      GameRenderer.render = (time, state) => worldFrames.push(state.retroWorld.mix);
      level256Glitch.state.ticksUntilGlitch = 1;`);
    game.frameAt(0);
    assert.equal(game.run('retroWorld.state.phase'), 'idle');
    game.frameAt(1000 / 60);
    assert.equal(game.run('retroWorld.state.phase'), 'delay');
    assert.equal(game.run('retroWorld.state.age'), 0);
    let previous = 1000 / 60;
    for (const [elapsed, phase, mix] of [[1500, 'fadeIn', 0], [5500, 'fadeIn', 0.5],
      [9500, 'hold', 1], [39500, 'fadeOut', 1], [42500, 'fadeOut', 0.5], [45500, 'idle', 0]]) {
      const end = 1000 / 60 + elapsed;
      for (let frame = 1; previous + frame * 1000 / fps < end - 1e-7; frame++) {
        game.frameAt(previous + frame * 1000 / fps);
      }
      game.frameAt(end);
      assert.equal(game.run('retroWorld.state.phase'), phase);
      assert.equal(game.run('retroWorld.state.mix'), mix);
      assert.equal(game.run('worldFrames.at(-1)'), mix);
      assert.equal(game.elements.get('worldClock').textContent, mix > 0 ? '1980' : '03:17 AM');
      previous = end;
    }
  });
}

test('title, pause, level-complete and game-over freeze every phase without hiding the world or year', () => {
  const game = boot(); game.click();
  game.run('GameRenderer.render = () => {}; retroWorld.trigger();');
  for (const ticks of [0, 100, 500, 1800]) {
    game.run(`for (let tick = 0; tick < ${ticks}; tick++) retroWorld.update(); updateWorldClock();`);
    const before = game.run('JSON.stringify(retroWorld.state)');
    const year = game.elements.get('worldClock').textContent;
    for (const state of ['title', 'paused', 'levelComplete', 'gameOver']) {
      game.run(`gameState = '${state}';`);
      game.advance(10);
      assert.equal(game.run('JSON.stringify(retroWorld.state)'), before, state);
      assert.equal(game.elements.get('worldClock').textContent, year, state);
    }
  }
});

test('death and respawn retain the active visit; level changes preserve it and restart clears it immediately', () => {
  const game = boot({ random: () => 0 }); game.click();
  game.run(`globalThis.worldFrames = [];
    GameRenderer.render = (time, state) => worldFrames.push(state.retroWorld.mix);
    level256Glitch.state.ticksUntilGlitch = 1; level256Glitch.update();
    for (let tick = 0; tick < 600; tick++) retroWorld.update();
    player.speed = 0; updateWorldClock();
    globalThis.originalWorld = retroWorld;
    Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
  const before = game.run('JSON.stringify(retroWorld.state)');
  game.advance(20);
  assert.equal(game.run('JSON.stringify(retroWorld.state)'), before);
  assert.equal(game.run('worldFrames.at(-1)'), 1, 'dying must not flash back to the city');
  assert.equal(game.elements.get('worldClock').textContent, '1980');
  game.respawn();
  assert.equal(game.run('retroWorld === originalWorld'), true);
  assert.equal(game.run('JSON.stringify(retroWorld.state)'), before);
  game.run("gameState = 'levelComplete'; nextLevel();");
  assert.equal(game.run('JSON.stringify(retroWorld.state)'), before);
  assert.equal(game.elements.get('worldClock').textContent, '1980');
  const age = game.run('retroWorld.state.age');
  game.run('ghosts = []; player.speed = 0;'); game.advance(3);
  assert.ok(game.run('retroWorld.state.age') > age, 'the same visit resumes after the level overlay');
  game.click();
  assert.equal(game.run('retroWorld === originalWorld'), false);
  assert.equal(game.run('retroWorld.state.phase'), 'idle');
  assert.equal(game.elements.get('worldClock').textContent, '03:17 AM');
});

test('the actual game callback retriggers on later glitches, not on respawns or level changes', () => {
  const game = boot({ random: () => 0 }); game.click();
  for (const level of [1, 2, 256]) {
    game.run(`level = ${level}; resetLevel(false); level256Glitch.state.ticksUntilGlitch = 1;
      level256Glitch.update();`);
    assert.equal(game.run('retroWorld.state.phase'), 'delay');
    game.run(`for (let tick = 0; tick < 2730; tick++) { retroWorld.update(); level256Glitch.update(); }
      resetActors();`);
    assert.equal(game.run('retroWorld.state.phase'), 'idle');
    assert.equal(game.run('level256Glitch.state.effect'), null);
  }
});

test('time travel and rendering cannot mutate maze, actors, score, lives, power or bonus state', () => {
  const game = boot(); game.click();
  const snapshot = 'JSON.stringify({ maze, player, ghosts, score, lives, dotsLeft, level, powerTimer, bonus: bonusLife.state })';
  const before = game.run(snapshot);
  game.run(`retroWorld.trigger();
    for (let tick = 0; tick <= 2730; tick++) {
      retroWorld.update();
      if (tick % 90 === 0) GameRenderer.render(0, { maze, player, ghosts, powerTimer, animFrame,
        gameState: 'paused', bonusLife: bonusLife.state, retroWorld: retroWorld.state });
    }`);
  assert.equal(game.run(snapshot), before);
});
