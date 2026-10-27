const assert = require('node:assert/strict');
const test = require('node:test');
const PlayerDeath = require('../scripts/player-death');
const { boot } = require('./helpers/game-harness');

const actor = { x: 216, y: 360, dir: 0, mouth: 0.3, alive: false };

function collide(game) {
  game.run(`Object.assign(ghosts[0], { mode: 'chase', scared: false, x: player.x, y: player.y }); checkCollisions();`);
}

function advanceTo(game, start, end, fps = 60) {
  for (let frame = 1; start + frame * 1000 / fps < end - 1e-7; frame++) {
    game.frameAt(start + frame * 1000 / fps);
  }
  game.frameAt(end);
}

test('the death snapshot splits the actual bite and heading into nine deterministic body pieces without mutating the actor', () => {
  for (const dir of [0, 1, 2, 3]) {
    for (const mouth of [-0.3, 0, 0.3, 0.6]) {
      const player = { ...actor, dir, mouth }, before = structuredClone(player);
      const { state } = PlayerDeath.create(player);
      assert.deepEqual(player, before);
      assert.deepEqual(state, PlayerDeath.create(player).state);
      assert.equal(state.x, player.x); assert.equal(state.y, player.y); assert.equal(state.dir, dir);
      assert.equal(state.fragments.length, 9);
      assert.equal(state.fragments[0].start, 0.2 + mouth * 0.6);
      assert.ok(Math.abs(state.fragments.at(-1).end - (Math.PI * 2 - state.fragments[0].start)) < 1e-10);
      state.fragments.forEach((fragment, index) => {
        assert.ok(fragment.end > fragment.start);
        if (index) assert.ok(Math.abs(fragment.start - state.fragments[index - 1].end) < 1e-10);
        for (const value of Object.values(fragment)) assert.ok(Number.isFinite(value));
        assert.ok(Math.abs(fragment.spin) >= 2);
      });
      player.x += 100;
      assert.equal(state.x, before.x, 'the effect is detached from later actor changes');
    }
  }
});

test('duration follows the injected tick rate, completes after 1.5 active seconds and clamps at completion', () => {
  for (const ticksPerSecond of [20, 60, 120]) {
    const effect = PlayerDeath.create(actor, { ticksPerSecond });
    assert.equal(effect.state.duration, ticksPerSecond * 1.5);
    const geometry = structuredClone(effect.state.fragments);
    for (let tick = 1; tick < effect.state.duration; tick++) {
      assert.equal(effect.update(), false);
      assert.equal(effect.state.age, tick);
    }
    assert.equal(effect.update(), true); assert.equal(effect.update(), true);
    assert.equal(effect.state.age, effect.state.duration);
    assert.deepEqual(effect.state.fragments, geometry);
  }
  for (const ticksPerSecond of [0, -1, NaN, Infinity]) {
    assert.throws(() => PlayerDeath.create(actor, { ticksPerSecond }), TypeError);
  }
});

test('simultaneous lethal collisions create one effect and one sound and remove only one life', () => {
  const game = boot(); game.click();
  game.run(`globalThis.deathSounds = 0; playDeath = () => { deathSounds++; };
    Object.assign(player, { dir: 3, mouth: 0.6 });
    ghosts.forEach(ghost => Object.assign(ghost, { mode: 'chase', scared: false, x: player.x, y: player.y }));
    checkCollisions(); globalThis.firstDeath = playerDeath; checkCollisions();`);
  assert.equal(game.run('lives'), 2);
  assert.equal(game.run('player.alive'), false);
  assert.equal(game.run('deathSounds'), 1);
  assert.equal(game.run('playerDeath === firstDeath'), true);
  assert.equal(game.run('playerDeath.state.x === player.x && playerDeath.state.y === player.y'), true);
  assert.equal(game.run('playerDeath.state.dir'), 3);
  assert.equal(game.run('playerDeath.state.age'), 0);
  assert.equal(game.elements.get('lives').children.length, 2);
});

test('frightened ghosts, returning eyes and house ghosts never trigger the player death effect or sound', () => {
  for (const [mode, scared] of [['chase', true], ['eyes', false], ['house', false]]) {
    const game = boot(); game.click();
    game.run(`globalThis.deathSounds = 0; playDeath = () => { deathSounds++; }; ghosts = [ghosts[0]];
      Object.assign(ghosts[0], { mode: '${mode}', scared: ${scared}, x: player.x, y: player.y }); checkCollisions();`);
    assert.equal(game.run('playerDeath'), null);
    assert.equal(game.run('player.alive'), true);
    assert.equal(game.run('lives'), 3);
    assert.equal(game.run('deathSounds'), 0);
    assert.equal(game.run('score'), scared ? 200 : 0);
  }
});

for (const fps of [20, 60, 144]) {
  test(`death freezes gameplay, animates at the same pace and respawns after 1.5 active seconds at ${fps} FPS`, () => {
    const game = boot(); game.click();
    game.run(`powerMode = true; powerTimer = 123; GameRenderer.render = () => {};
      globalThis.setTimeout = () => { throw new Error('Death must not use wall-clock timers'); };`);
    collide(game);
    const before = game.run('JSON.stringify({ player, ghosts, maze, bonus: bonusLife.state, powerTimer, score, dotsLeft, animFrame })');
    game.frameAt(0);
    advanceTo(game, 0, 500, fps);
    assert.equal(game.run('playerDeath.state.age'), 30);
    assert.equal(game.run('JSON.stringify({ player, ghosts, maze, bonus: bonusLife.state, powerTimer, score, dotsLeft, animFrame })'), before);
    advanceTo(game, 500, 1499, fps);
    assert.equal(game.run('playerDeath.state.age'), 89);
    assert.equal(game.run('player.alive'), false);
    game.frameAt(1500);
    assert.equal(game.run('playerDeath'), null);
    assert.equal(game.run('player.alive'), true);
    assert.equal(game.run('gameState'), 'playing');
    assert.equal(game.run('lives'), 2);
    assert.equal(game.run('lastTime'), null);
    assert.equal(game.run('simulationAccumulator'), 0);
  });
}

test('the last life plays the full effect before game over, and restart clears it', () => {
  const game = boot(); game.click();
  game.run('lives = 1; GameRenderer.render = () => {};'); collide(game);
  game.frameAt(0); advanceTo(game, 0, 1499);
  assert.equal(game.run('gameState'), 'playing');
  assert.equal(game.elements.get('overlay').style.display, 'none');
  game.frameAt(1500);
  assert.equal(game.run('gameState'), 'gameOver');
  assert.equal(game.run('player.alive'), false);
  assert.equal(game.run('playerDeath'), null);
  assert.match(game.elements.get('overlay').innerHTML, /GAME OVER/);
  game.key('Enter');
  assert.equal(game.run('player.alive'), true);
  assert.equal(game.run('lives'), 3);
  assert.equal(game.run('playerDeath'), null);
});

test('pause freezes both fragments and the death deadline, with no catch-up after resume', () => {
  const game = boot(); game.click(); collide(game);
  game.run('GameRenderer.render = () => {};');
  game.frameAt(0); advanceTo(game, 0, 500);
  const before = game.run('JSON.stringify(playerDeath.state)');
  game.key('p'); game.frameAt(60000);
  assert.equal(game.run('JSON.stringify(playerDeath.state)'), before);
  assert.equal(game.run('player.alive'), false);
  game.key('Enter'); game.frameAt(120000);
  assert.equal(game.run('JSON.stringify(playerDeath.state)'), before);
  advanceTo(game, 120000, 120999);
  assert.equal(game.run('playerDeath.state.age'), 89);
  game.frameAt(121000);
  assert.equal(game.run('player.alive'), true);
  assert.equal(game.run('playerDeath'), null);
});

for (const reset of ['startGame()', 'resetLevel(false)', 'resetActors()', 'gameState = "levelComplete"; nextLevel()']) {
  test(`${reset} discards an unfinished effect without a stale game-over callback`, () => {
    const game = boot(); game.click(); game.run('lives = 1;'); collide(game);
    game.run(reset);
    assert.equal(game.run('playerDeath'), null);
    assert.equal(game.run('player.alive'), true);
    game.run('ghosts = []; player.speed = 0; GameRenderer.render = () => {};');
    game.frameAt(0); advanceTo(game, 0, 2000);
    assert.equal(game.run('gameState'), 'playing');
    assert.equal(game.run('playerDeath'), null);
  });
}

test('a later death gets fresh fragments rather than reusing the completed sequence', () => {
  const game = boot(); game.click(); collide(game);
  game.run('globalThis.previousDeath = playerDeath;');
  game.respawn(); collide(game);
  assert.equal(game.run('playerDeath !== previousDeath && playerDeath.state.fragments !== previousDeath.state.fragments'), true);
  assert.equal(game.run('playerDeath.state.age'), 0);
  assert.equal(game.run('lives'), 1);
});
