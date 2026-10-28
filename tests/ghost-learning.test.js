const assert = require('node:assert/strict');
const test = require('node:test');
const GhostLearning = require('../scripts/ghosts/learning');
const GhostNavigation = require('../scripts/ghosts/navigation');
const GhostAI = require('../scripts/ghosts/ai');
const GhostController = require('../scripts/ghosts/controller');
const GhostProfiles = require('../scripts/ghosts/profiles');
const { arena, actor, player, tile } = require('./helpers/ghost-fixtures');
const { boot } = require('./helpers/game-harness');

const south = [[7, 8], [8, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14]];
const north = [[7, 8], [8, 8], [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2]];

function walk(learning, navigation, route, { repeats = 1, powered = false, dwell = 1 } = {}) {
  for (let pass = 0; pass < repeats; pass++) {
    learning.resetObservation();
    route.forEach(([col, row], index) => {
      const before = index ? { col: route[index - 1][0], row: route[index - 1][1] } : null;
      const dir = before ? navigation.neighbors(before).find(next => next.col === col && next.row === row).dir : 0;
      for (let tick = 0; tick < dwell; tick++) learning.observe(player(col, row, dir), navigation, powered);
    });
  }
}

test('repeated routes produce a legal six-tile forecast only after enough evidence', () => {
  const maze = arena(), before = structuredClone(maze), navigation = GhostNavigation.create(maze, tile);
  const learning = GhostLearning.create(), pacman = player(8, 8);
  assert.deepEqual(learning.predict(pacman, navigation), []);
  walk(learning, navigation, south, { repeats: 2 });
  assert.deepEqual(learning.predict(pacman, navigation), []);
  walk(learning, navigation, south);
  assert.deepEqual(learning.predict(pacman, navigation), south.slice(2).map(([col, row]) => ({ col, row })));
  assert.deepEqual(learning.predict({ ...pacman, nextDir: 3 }, navigation), learning.predict(pacman, navigation),
    'buffered input is not evidence and must not reveal the next turn');
  assert.deepEqual(maze, before);
  assert.deepEqual(pacman, player(8, 8));
});

test('waiting, repeated observations and prediction calls cannot manufacture a habit', () => {
  const navigation = GhostNavigation.create(arena(), tile), learning = GhostLearning.create();
  walk(learning, navigation, south, { dwell: 300 });
  for (let tick = 0; tick < 300; tick++) assert.deepEqual(learning.predict(player(8, 8), navigation), []);
  walk(learning, navigation, south, { repeats: 2 });
  const quick = GhostLearning.create();
  walk(quick, navigation, south, { repeats: 3 });
  assert.deepEqual(learning.predict(player(8, 8), navigation), quick.predict(player(8, 8), navigation));
});

test('mixed choices stay uncertain and recent behavior replaces even a long-standing habit', () => {
  const navigation = GhostNavigation.create(arena(), tile), mixed = GhostLearning.create();
  for (let pass = 0; pass < 30; pass++) walk(mixed, navigation, pass % 2 ? north : south);
  assert.deepEqual(mixed.predict(player(8, 8), navigation), []);
  const learning = GhostLearning.create();
  walk(learning, navigation, south, { repeats: 1000 });
  assert.deepEqual(learning.predict(player(8, 8), navigation)[0], { col: 8, row: 9 });
  walk(learning, navigation, north);
  assert.deepEqual(learning.predict(player(8, 8), navigation)[0], { col: 8, row: 9 }, 'one exception is not a new habit');
  walk(learning, navigation, north, { repeats: 5 });
  assert.deepEqual(learning.predict(player(8, 8), navigation)[0], { col: 8, row: 7 });
});

test('arrival directions and powered routes have independent learned choices', () => {
  const navigation = GhostNavigation.create(arena(), tile), learning = GhostLearning.create();
  walk(learning, navigation, south, { repeats: 3 });
  walk(learning, navigation, [[9, 8], [8, 8], [8, 7]], { repeats: 3 });
  walk(learning, navigation, north, { repeats: 3, powered: true });
  assert.deepEqual(learning.predict(player(8, 8, 0), navigation)[0], { col: 8, row: 9 });
  assert.deepEqual(learning.predict(player(8, 8, 2), navigation)[0], { col: 8, row: 7 });
  assert.deepEqual(learning.predict(player(8, 8, 0), navigation, true)[0], { col: 8, row: 7 });
  assert.deepEqual(learning.predict(player(8, 8, 1), navigation), []);
  assert.deepEqual(learning.predict(player(8, 8, 2), navigation, true), []);
});

test('invalid positions, death, non-neighbor jumps and observation resets do not teach phantom turns', () => {
  const navigation = GhostNavigation.create(arena(), tile);
  const interruptions = [player(0, 0), player(8, -1), { ...player(8, 8), x: NaN },
    { ...player(8, 8), dir: 9 }, { ...player(8, 8), alive: false }, player(12, 12), null];
  for (const interruption of interruptions) {
    const learning = GhostLearning.create();
    for (let pass = 0; pass < 5; pass++) {
      learning.resetObservation();
      learning.observe(player(7, 8), navigation);
      learning.observe(player(8, 8), navigation);
      if (interruption) learning.observe(interruption, navigation);
      else learning.resetObservation();
      learning.observe(player(8, 9, 1), navigation);
    }
    assert.deepEqual(learning.predict(player(8, 8), navigation), []);
  }
});

test('forecasts honor already taken turns, rather than steering toward obsolete predictions', () => {
  const navigation = GhostNavigation.create(arena(), tile), learning = GhostLearning.create();
  walk(learning, navigation, south, { repeats: 3 });
  learning.resetObservation();
  learning.observe(player(7, 8), navigation);
  learning.observe(player(8, 8), navigation);
  assert.deepEqual(learning.predict(player(8, 8), navigation)[0], { col: 8, row: 9 });
  assert.deepEqual(learning.predict({ ...player(8, 8), x: 8.5 * tile + 1 }, navigation), []);
  assert.deepEqual(learning.predict(player(8, 8, 3), navigation), []);
});

test('learned paths cannot cross walls or house doors and stop at unknown junctions', () => {
  const maze = arena(), navigation = GhostNavigation.create(maze, tile), learning = GhostLearning.create();
  walk(learning, navigation, south.slice(0, 3), { repeats: 3 });
  assert.deepEqual(learning.predict(player(8, 8), navigation), [{ col: 8, row: 9 }]);
  for (const barrier of [0, 4]) {
    const blocked = structuredClone(maze);
    blocked[9][8] = barrier;
    const changed = GhostNavigation.create(blocked, tile);
    assert.deepEqual(learning.predict(player(8, 8), changed), []);
    const fresh = GhostLearning.create();
    for (let pass = 0; pass < 5; pass++) {
      fresh.resetObservation();
      fresh.observe(player(7, 8), changed);
      fresh.observe(player(8, 8), changed);
      fresh.observe(player(8, 9, 1), changed);
    }
    assert.deepEqual(fresh.predict(player(8, 8), navigation), []);
  }
});

test('both tunnel seams are learned as legal transitions without vertical wrapping', () => {
  const maze = Array.from({ length: 7 }, () => Array(9).fill(0));
  maze[3].fill(1);
  for (const col of [0, 8]) { maze[4][col] = 1; maze[5][col] = 1; }
  const navigation = GhostNavigation.create(maze, tile), learning = GhostLearning.create();
  for (const [from, to, dir] of [[8, 0, 0], [0, 8, 2]]) {
    walk(learning, navigation, [[dir === 0 ? 7 : 1, 3], [from, 3], [to, 3], [to, 4], [to, 5]], { repeats: 3 });
    assert.deepEqual(learning.predict(player(to, 3, dir), navigation)[0], { col: to, row: 4 });
    const forecast = learning.predict(player(from, 3, dir), navigation);
    assert.deepEqual(forecast[0], { col: to, row: 3 });
    let before = { col: from, row: 3 };
    for (const next of forecast) {
      assert.ok(navigation.neighbors(before).some(cell => cell.col === next.col && cell.row === next.row));
      assert.ok(next.row >= 0 && next.row < maze.length);
      before = next;
    }
  }
});

test('learning changes real interception targets and turns while preserving coordinated roles', () => {
  const navigation = GhostNavigation.create(arena(), tile), learning = GhostLearning.create(), pacman = player(8, 8);
  const ghosts = GhostProfiles.all.map(profile => actor(profile.id, 3, 3));
  const baseline = GhostAI.plan(ghosts, pacman, navigation);
  const cold = GhostAI.plan(ghosts, pacman, navigation, learning);
  for (const ghost of ghosts) assert.deepEqual(cold.get(ghost), baseline.get(ghost));
  walk(learning, navigation, south, { repeats: 3 });
  const learned = GhostAI.plan(ghosts, pacman, navigation, learning);
  assert.deepEqual(learned.get(ghosts[0]), baseline.get(ghosts[0]));
  assert.deepEqual(learned.get(ghosts[3]), baseline.get(ghosts[3]));
  assert.deepEqual(navigation.point(learned.get(ghosts[1])), navigation.point({ col: 8, row: 12 }));
  assert.deepEqual(navigation.point(learned.get(ghosts[2])), navigation.point({ col: 8, row: 14 }));
  assert.equal(new Set([...learned.values()].map(cell => `${cell.col},${cell.row}`)).size, 4);
  const reordered = GhostAI.plan(ghosts.slice().reverse(), pacman, navigation, learning);
  for (const ghost of ghosts) {
    assert.deepEqual(reordered.get(ghost), learned.get(ghost));
    assert.ok(Number.isFinite(navigation.distance(navigation.cellAt(ghost), learned.get(ghost))));
  }
  const pinky = actor('pinky', 8, 10);
  assert.equal(GhostAI.chooseDirection(pinky, { navigation, player: pacman, target: baseline.get(ghosts[1]) }), 3);
  assert.equal(GhostAI.chooseDirection(pinky, { navigation, player: pacman, target: learned.get(ghosts[1]) }), 1);
});

test('the controller learns observed movement even without active ghosts and keeps frightened/eyes behavior', () => {
  const maze = arena(), navigation = GhostNavigation.create(maze, tile), learning = GhostLearning.create();
  const controller = GhostController.create(maze, tile, { learning });
  for (let pass = 0; pass < 3; pass++) {
    learning.resetObservation();
    south.forEach(([col, row], index) => controller.update([], player(col, row, index > 1 ? 1 : 0), false));
  }
  const pinky = actor('pinky', 8, 10), pacman = player(8, 8);
  controller.update([pinky], pacman, false);
  assert.equal(pinky.dir, 1);
  assert.deepEqual(pinky.target, navigation.point({ col: 8, row: 12 }));
  const scared = actor('pinky', 8, 10), eyes = actor('inky', 8, 10);
  scared.scared = true; scared.reversePending = true; eyes.mode = 'eyes';
  controller.update([scared, eyes], pacman, true);
  assert.equal(scared.dir, 2);
  assert.deepEqual(scared.target, navigation.point(navigation.cellAt(pacman)));
  assert.deepEqual(eyes.target, navigation.point(GhostProfiles.home));
});

test('real player movement teaches routes; respawns and levels keep knowledge, while a new game clears it', () => {
  const game = boot();
  game.click();
  game.run(`
    globalThis.routeNavigation = GhostNavigation.create(maze, TILE);
    globalThis.trainingRoute = [[5, 1, 0], [6, 1, 0], [6, 2, 1], [6, 3, 1], [6, 4, 1]];
    globalThis.forecast = () => ghostLearning.predict({ x: 6.5 * TILE, y: 1.5 * TILE, dir: 0, alive: true }, routeNavigation);
    ghosts = [];
    for (let pass = 0; pass < 3; pass++) {
      ghostLearning.resetObservation();
      Object.assign(player, { x: 5.5 * TILE, y: 1.5 * TILE, dir: 0, nextDir: 0, speed: TILE / 4 });
      updateGhosts();
      for (let step = 1; step < trainingRoute.length; step++) {
        const [col, row, dir] = trainingRoute[step];
        player.nextDir = dir;
        for (let tick = 0; tick < 4; tick++) { updatePlayer(); updateGhosts(); }
        if (player.x !== (col + 0.5) * TILE || player.y !== (row + 0.5) * TILE) throw new Error('Training path blocked');
      }
    }
    globalThis.learnedForecast = JSON.stringify(forecast());
    globalThis.previousLearning = ghostLearning;
  `);
  assert.ok(game.run('forecast().length > 0'));
  assert.equal(game.run('forecast()[0].col'), 6);
  assert.equal(game.run('forecast()[0].row'), 2);
  game.run(`ghosts = GhostProfiles.create(TILE);
    Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
  game.respawn();
  assert.equal(game.run('ghostLearning === previousLearning'), true);
  assert.equal(game.run('JSON.stringify(forecast())'), game.run('learnedForecast'));
  game.run('gameState = "levelComplete"; nextLevel();');
  assert.equal(game.run('ghostLearning === previousLearning'), true);
  assert.equal(game.run('JSON.stringify(forecast())'), game.run('learnedForecast'));
  game.run('gameState = "gameOver"; showOverlay("GAME OVER", "", "RESTART");');
  game.click('ovBtn');
  assert.equal(game.run('ghostLearning === previousLearning'), false);
  assert.equal(game.run('forecast().length'), 0);
});

test('route learning in the game loop is identical at different rendering rates and freezes on pause', () => {
  let expected;
  for (const fps of [20, 60, 144]) {
    const game = boot();
    game.click();
    game.run(`
      ghosts = [];
      for (const row of maze) for (let col = 0; col < row.length; col++) if (row[col] === 2 || row[col] === 3) row[col] = 1;
      dotsLeft = 1;
      Object.assign(player, { x: 1.5 * TILE, y: 1.5 * TILE, dir: 0, nextDir: 0, speed: 2 });
      globalThis.movePlayer = updatePlayer;
      updatePlayer = () => {
        if (player.x === 6.5 * TILE && player.y === 1.5 * TILE) player.nextDir = 1;
        if (player.x === 6.5 * TILE && player.y === 4.5 * TILE) player.nextDir = 2;
        if (player.x === 1.5 * TILE && player.y === 4.5 * TILE) player.nextDir = 3;
        if (player.x === 1.5 * TILE && player.y === 1.5 * TILE) player.nextDir = 0;
        movePlayer();
      };
      GameRenderer.render = () => {};
      globalThis.routeForecast = () => ghostLearning.predict({ x: 6.5 * TILE, y: 1.5 * TILE, dir: 0, alive: true },
        GhostNavigation.create(maze, TILE));
    `);
    game.frameAt(0);
    for (let frame = 1; frame <= fps * 7; frame++) game.frameAt(frame * 1000 / fps);
    assert.equal(game.run('animFrame'), 420);
    assert.equal(game.run('routeForecast()[0].col'), 6);
    assert.equal(game.run('routeForecast()[0].row'), 2);
    const forecast = game.run('JSON.stringify(routeForecast())');
    expected ??= forecast;
    assert.equal(forecast, expected, `${fps} FPS`);
    game.key('p');
    game.frameAt(60000);
    game.frameAt(61000);
    assert.equal(game.run('animFrame'), 420);
    assert.equal(game.run('JSON.stringify(routeForecast())'), forecast);
  }
});
