const assert = require('node:assert/strict');
const test = require('node:test');
const BonusLife = require('../scripts/bonus-life');
const { boot } = require('./helpers/game-harness');

const tile = 16;
const origin = { x: 1.5 * tile, y: 1.5 * tile, alive: true };
const corridor = () => [Array(14).fill(0), [0, ...Array(12).fill(2), 0], Array(14).fill(0)];

function tick(bonus, player, count = bonus.state.ticksUntilSpawn) {
  let awards = 0;
  for (let i = 0; i < count; i++) awards += Number(bonus.update(player));
  return awards;
}

function start() {
  const game = boot({ random: () => 0 });
  game.click();
  game.run('ghosts = []; player.speed = 0;');
  return game;
}

function spawn(game) {
  game.run('for (let i = bonusLife.state.ticksUntilSpawn; i > 0; i--) updatePlayer();');
  assert.ok(game.run('bonusLife.state.coin !== null'));
}

function collect(game) {
  game.run('Object.assign(player, bonusLife.state.coin, { speed: 0 }); updatePlayer();');
}

function collide(game) {
  game.run(`ghosts = GhostProfiles.create(TILE);
    Object.assign(ghosts[0], { mode: 'chase', scared: false, x: player.x, y: player.y }); checkCollisions();`);
  assert.equal(game.run('player.alive'), false);
}

test('a bonus spawns once after a random 4–10 active seconds, at a random tile center away from the player', () => {
  const positions = new Set();
  for (const value of [0, 0.25, 0.5, 0.75, 0.999999]) {
    const maze = corridor(), before = structuredClone(maze);
    const bonus = BonusLife.create(maze, tile, { origin, random: () => value });
    const delay = bonus.state.ticksUntilSpawn;
    assert.ok(delay >= 240 && delay <= 600);
    assert.equal(tick(bonus, origin, delay - 1), 0);
    assert.equal(bonus.state.coin, null);
    assert.equal(bonus.update(origin), false);
    const coin = { ...bonus.state.coin };
    assert.equal(coin.x % tile, tile / 2);
    assert.equal(coin.y % tile, tile / 2);
    assert.ok(Math.hypot(coin.x - origin.x, coin.y - origin.y) >= tile * 3);
    positions.add(coin.x);
    tick(bonus, origin, 3600);
    assert.deepEqual(bonus.state.coin, coin, 'an uncollected coin never expires or moves');
    assert.deepEqual(maze, before, 'spawning must not overwrite pellets or walls');
  }
  assert.equal(positions.size, 5);
});

test('spawn candidates exclude doors, the ghost house and disconnected decorative streets', () => {
  const maze = [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 2, 2, 4, 2, 2, 0],
    [0, 2, 0, 0, 0, 0, 0],
    [0, 0, 0, 2, 2, 0, 0],
    [0, 0, 0, 0, 0, 0, 0]
  ];
  const reachable = new Set(['1,1', '2,1', '1,2']);
  for (const value of [0, 0.5, 0.999999]) {
    const bonus = BonusLife.create(maze, tile, { origin, random: () => value });
    tick(bonus, origin);
    const point = bonus.state.coin || bonus.state.effect;
    assert.ok(reachable.has(`${Math.floor(point.x / tile)},${Math.floor(point.y / tile)}`));
  }
});

test('open horizontal tunnels participate in reachability, but power pellets are not preferred spawn sites', () => {
  const maze = [[0, 0, 0, 0, 0], [2, 0, 3, 3, 2], [0, 0, 0, 0, 0]];
  const player = { ...origin, x: tile / 2 };
  const bonus = BonusLife.create(maze, tile, { origin: player, random: () => 0 });
  tick(bonus, player);
  assert.deepEqual(bonus.state.coin, { x: 4.5 * tile, y: 1.5 * tile });
});

test('empty reachable paths support a bonus, and a blocked origin never spawns an unreachable coin', () => {
  const player = { ...origin, x: tile / 2, y: tile / 2 };
  const empty = BonusLife.create([[1]], tile, { origin: player, random: () => 0 });
  assert.equal(tick(empty, player), 1, 'a one-cell level can award its only reachable bonus');
  const blocked = BonusLife.create([[0, 2]], tile, { origin: player, random: () => 0 });
  assert.equal(tick(blocked, player, 1000), 0);
  assert.equal(blocked.state.coin, null);
  assert.equal(blocked.state.effect, null);
  for (const [maze, size, rate] of [[[], 16, 60], [[[]], 16, 60], [[[1], []], 16, 60],
    [[[1]], 0, 60], [[[1]], NaN, 60], [[[1]], 16, 0]]) {
    assert.throws(() => BonusLife.create(maze, size, { origin: player, ticksPerSecond: rate }), TypeError);
  }
});

test('only a living player within pickup distance earns one bonus; its short effect then expires', () => {
  const maze = corridor(), before = structuredClone(maze);
  const bonus = BonusLife.create(maze, tile, { origin, random: () => 0 });
  tick(bonus, origin);
  const coin = { ...bonus.state.coin };
  assert.equal(bonus.update({ ...coin, alive: false }), false);
  assert.equal(bonus.state.collected, false);
  assert.equal(bonus.update({ ...coin, x: coin.x - tile, alive: true }), false);
  assert.equal(bonus.update({ ...coin, x: coin.x - tile * 0.64, alive: true }), true);
  assert.equal(bonus.state.collected, true);
  assert.equal(bonus.state.coin, null);
  assert.deepEqual(bonus.state.effect, { ...coin, age: 0, duration: 72 });
  assert.equal(tick(bonus, { ...coin, alive: true }, 71), 0);
  assert.equal(bonus.state.effect.age, 71);
  assert.equal(bonus.update({ ...coin, alive: true }), false);
  assert.equal(bonus.state.effect, null);
  assert.equal(tick(bonus, { ...coin, alive: true }, 3600), 0);
  assert.equal(bonus.state.coin, null);
  assert.deepEqual(maze, before);
});

test('the pickup grants exactly one extra HUD life without changing pellet progress or imposing a three-life cap', () => {
  const game = start();
  const maze = game.run('JSON.stringify(maze)');
  game.run('bonusLife.update(player);');
  assert.equal(game.run('JSON.stringify(maze)'), maze);
  spawn(game);
  game.run(`const coin = bonusLife.state.coin;
    maze[Math.floor(coin.y / TILE)][Math.floor(coin.x / TILE)] = 1; dotsLeft--;`);
  const score = game.run('score'), dots = game.run('dotsLeft');
  collect(game);
  assert.equal(game.run('lives'), 4);
  assert.equal(game.elements.get('lives').children.length, 4);
  assert.equal(game.run('score'), score);
  assert.equal(game.run('dotsLeft'), dots);
  game.run('for (let i = 0; i < 1000; i++) updatePlayer();');
  assert.equal(game.run('lives'), 4);
  assert.equal(game.run('bonusLife.state.collected'), true);
  assert.equal(game.run('bonusLife.state.coin'), null);
});

for (const active of [false, true]) {
  test(`death preserves the ${active ? 'visible coin' : 'pending spawn'} and freezes it until respawn`, () => {
    const game = start();
    if (active) spawn(game);
    else game.run('for (let i = 0; i < 40; i++) updatePlayer();');
    const before = game.run('JSON.stringify(bonusLife.state)');
    game.run('globalThis.savedBonus = bonusLife;');
    collide(game);
    game.advance(10);
    assert.equal(game.run('JSON.stringify(bonusLife.state)'), before);
    game.respawn();
    assert.equal(game.run('bonusLife === savedBonus'), true);
    assert.equal(game.run('JSON.stringify(bonusLife.state)'), before);
    game.run('ghosts = []; player.speed = 0;');
    if (!active) spawn(game);
    collect(game);
    assert.equal(game.run('lives'), 3, 'the spent life is restored by the original level bonus');
  });
}

test('a collected bonus cannot respawn after death, and four lives really permit four deaths', () => {
  const game = start();
  spawn(game); collect(game);
  for (const lives of [3, 2, 1, 0]) {
    collide(game);
    assert.equal(game.run('lives'), lives);
    game.respawn();
    assert.equal(game.run('gameState'), lives > 0 ? 'playing' : 'gameOver');
    assert.equal(game.run('bonusLife.state.collected'), true);
    game.run('ghosts = []; player.speed = 0; for (let i = 0; i < 700; i++) updatePlayer();');
    assert.equal(game.run('lives'), lives);
    assert.equal(game.run('bonusLife.state.coin'), null);
  }
  game.click('ovBtn');
  assert.equal(game.run('lives'), 3);
  assert.equal(game.run('level'), 1);
  assert.equal(game.run('bonusLife.state.collected'), false);
  assert.equal(game.run('bonusLife.state.coin'), null);
  assert.equal(game.run('bonusLife.state.effect'), null);
  assert.equal(game.run('bonusLife.state.ticksUntilSpawn'), 240);
});

test('the next level offers a fresh bonus without removing previously earned lives', () => {
  const game = start();
  spawn(game); collect(game);
  game.run('globalThis.previousBonus = bonusLife; gameState = "levelComplete"; nextLevel();');
  assert.equal(game.run('level'), 2);
  assert.equal(game.run('lives'), 4);
  assert.equal(game.run('bonusLife !== previousBonus'), true);
  assert.equal(game.run('bonusLife.state.collected'), false);
  assert.equal(game.run('bonusLife.state.effect'), null);
  game.run('ghosts = []; player.speed = 0;');
  spawn(game); collect(game);
  assert.equal(game.run('lives'), 5);
  assert.equal(game.elements.get('lives').children.length, 5);
});

test('collecting the last pellet and the coin in the same tick awards the life before level completion', () => {
  const game = start();
  spawn(game);
  game.run(`for (const row of maze) {
    for (let col = 0; col < row.length; col++) if (row[col] === 2 || row[col] === 3) row[col] = 1;
  }
  const coin = bonusLife.state.coin;
  maze[Math.floor(coin.y / TILE)][Math.floor(coin.x / TILE)] = 2; dotsLeft = 1;`);
  collect(game);
  assert.equal(game.run('lives'), 4);
  assert.equal(game.run('dotsLeft'), 0);
  assert.equal(game.run('gameState'), 'levelComplete');
  game.drawing.length = 0;
  game.advance();
  assert.ok(game.drawing.some(([method, text]) => method === 'fillText' && text === '+1 LIFE'));
});

test('title, pause, completed levels and game over never advance the bonus spawn or pickup effect', () => {
  const game = boot({ random: () => 0 });
  const title = game.run('JSON.stringify(bonusLife.state)');
  game.advance(20);
  assert.equal(game.run('JSON.stringify(bonusLife.state)'), title);
  game.click();
  game.run('ghosts = []; player.speed = 0;');
  for (const collected of [false, true]) {
    if (collected) { spawn(game); collect(game); }
    for (const state of ['paused', 'levelComplete', 'gameOver']) {
      game.run(`gameState = '${state}';`);
      const before = game.run('JSON.stringify(bonusLife.state)');
      game.advance(20);
      assert.equal(game.run('JSON.stringify(bonusLife.state)'), before, state);
    }
  }
});

for (const fps of [20, 60, 144]) {
  test(`bonus spawning and pickup-effect duration follow simulation time at ${fps} FPS`, () => {
    const game = start();
    game.run('GameRenderer.render = () => {};');
    game.frameAt(0);
    for (let frame = 1; frame < fps * 4; frame++) game.frameAt(frame * 1000 / fps);
    assert.equal(game.run('bonusLife.state.coin'), null);
    game.frameAt(4000);
    assert.equal(game.run('bonusLife.state.ticksUntilSpawn'), 0);
    assert.ok(game.run('bonusLife.state.coin !== null'));
    collect(game);
    for (let frame = 1; frame * 1000 / fps < 1200; frame++) game.frameAt(4000 + frame * 1000 / fps);
    assert.ok(game.run('bonusLife.state.effect !== null'));
    game.frameAt(5200);
    assert.equal(game.run('bonusLife.state.effect'), null);
    assert.equal(game.run('lives'), 4);
  });
}
