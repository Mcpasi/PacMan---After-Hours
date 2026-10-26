const assert = require('node:assert/strict');
const test = require('node:test');
const PlayerArtwork = require('../scripts/rendering/player');
const { boot } = require('./helpers/game-harness');

function paint(player = {}, options = {}) {
  const calls = [];
  const ctx = new Proxy({}, {
    set(_, key, value) { calls.push(['set', key, typeof value?.addColorStop === 'function' ? 'gradient' : value]); return true; },
    get(_, key) {
      if (key === 'createLinearGradient') return (...args) => {
        calls.push([key, ...args]);
        return { addColorStop: (...args) => calls.push(['addColorStop', ...args]) };
      };
      return (...args) => calls.push([key, ...args]);
    }
  });
  const actor = { x: 120, y: 88, dir: 0, mouth: 0.3, alive: true, ...player };
  const settings = { tile: 16, time: 1, ...options };
  const before = structuredClone({ actor, settings });
  PlayerArtwork.draw(ctx, actor, settings);
  assert.deepEqual({ actor, settings }, before, 'artwork must never mutate gameplay or renderer options');
  return calls;
}

test('the brass skin retains the round silhouette, original bite and all four headings at any scale', () => {
  for (const tile of [12, 16, 24, 64]) {
    for (const dir of [0, 1, 2, 3]) {
      for (const mouth of [-0.3, 0, 0.3, 0.6]) {
        const calls = paint({ dir, mouth }, { tile });
        assert.ok(calls.some(([method, x, y]) => method === 'translate' && x === 120 && y === 88));
        assert.ok(calls.some(([method, x, y]) => method === 'scale' && x === tile && y === tile));
        assert.deepEqual(calls.find(([method]) => method === 'rotate'), ['rotate', dir * Math.PI / 2]);
        assert.deepEqual(calls.find(([method]) => method === 'arc'),
          ['arc', 0, 0, 0.45, 0.2 + mouth * 0.6, Math.PI * 2 - (0.2 + mouth * 0.6)]);
        assert.ok(calls.findIndex(([method]) => method === 'ellipse') < calls.findIndex(([method]) => method === 'rotate'),
          'the grounded shadow must not rotate with the face');
        assert.equal(calls.filter(([method]) => method === 'save').length, 2);
        assert.equal(calls.filter(([method]) => method === 'restore').length, 2);
      }
    }
  }
});

test('weathered shading, ember eye and cracks are clipped to the body, never painted over the bite', () => {
  const calls = paint();
  assert.ok(calls.some(([method, , color]) => method === 'addColorStop' && color === '#c69848'));
  assert.ok(calls.some(([method, , color]) => method === 'addColorStop' && color === '#354348'));
  const clip = calls.findIndex(([method]) => method === 'clip');
  const crack = calls.findIndex(([method, x, y]) => method === 'moveTo' && x === -0.34 && y === -0.2);
  const eye = calls.findIndex(([method, x, y]) => method === 'moveTo' && x === -0.045 && y === -0.255);
  assert.ok(clip > 0 && crack > clip && eye > clip);
  assert.deepEqual(calls.at(-1), ['restore']);
  assert.deepEqual(paint({ alive: false }, { powerTimer: 480 }), [], 'death hides the whole skin, including its glow');
});

test('power mode lights up the brass and cracks without changing the bite, and expires cleanly', () => {
  const normal = paint(), powered = paint({}, { powerTimer: 480 });
  const geometry = calls => calls.filter(([method]) => ['moveTo', 'lineTo', 'arc', 'ellipse'].includes(method));
  assert.deepEqual(geometry(powered), geometry(normal));
  assert.notDeepEqual(powered, normal);
  assert.ok(powered.some(([method, key, value]) => method === 'set' && key === 'strokeStyle' && value === '#ffe8a3'));
  assert.deepEqual(paint({}, { powerTimer: 0 }), normal);
  assert.deepEqual(paint({}, { powerTimer: -1 }), normal);
});

test('power glow uses renderer time, stays gentle near expiry and is static with reduced motion', () => {
  assert.notDeepEqual(paint({}, { powerTimer: 100, time: 1 }), paint({}, { powerTimer: 100, time: 2 }));
  assert.deepEqual(paint({}, { powerTimer: 100, time: 1, reducedMotion: true }),
    paint({}, { powerTimer: 1, time: 8, reducedMotion: true }));
  assert.deepEqual(paint({}, { powerTimer: 100 }), paint({}, { powerTimer: 1 }), 'no expiry flash');
  assert.deepEqual(paint({}, { time: 1 }), paint({}, { time: 8 }), 'unpowered wear never flickers');
});

test('the default actor uses the new artwork with live power and reduced-motion settings', () => {
  for (const reducedMotion of [false, true]) {
    const game = boot({ reducedMotion });
    game.run(`globalThis.playerPaints = [];
      PlayerArtwork.draw = (ctx, actor, options) => playerPaints.push({
        x: actor.x, tile: options.tile, powerTimer: options.powerTimer, reducedMotion: options.reducedMotion
      });
      powerTimer = 480;`);
    game.advance();
    assert.equal(game.run('playerPaints.length'), 1);
    assert.equal(game.run('playerPaints[0].x'), game.run('player.x'));
    assert.equal(game.run('playerPaints[0].tile'), 16);
    assert.equal(game.run('playerPaints[0].powerTimer'), 480);
    assert.equal(game.run('playerPaints[0].reducedMotion'), reducedMotion);
  }
});

test('the HUD shares the player skin without animating it or changing the real player', () => {
  const game = boot();
  const before = game.run('JSON.stringify(player)');
  game.run(`globalThis.lifePaints = [];
    PlayerArtwork.draw = (ctx, actor, options) => lifePaints.push({ actor, options });
    lives = 2; updateUI();`);
  assert.equal(game.elements.get('lives').children.length, 2);
  assert.equal(game.run('lifePaints.length'), 2);
  assert.equal(game.run('lifePaints.every(({ actor, options }) => actor !== player && actor.alive && options.reducedMotion && !options.powerTimer)'), true);
  assert.equal(game.run('JSON.stringify(player)'), before);
});

test('powered player artwork freezes on pause and resumes with the shared renderer clock', () => {
  const game = boot();
  game.click(); game.advance(2);
  game.run(`powerMode = true; powerTimer = 480; ghosts.forEach(ghost => ghost.scared = true);
    globalThis.playerFrames = [];
    const drawPlayer = PlayerArtwork.draw;
    PlayerArtwork.draw = (ctx, actor, options) => {
      if (actor === player) playerFrames.push({ time: options.time, powerTimer: options.powerTimer, actor: { ...actor } });
      drawPlayer(ctx, actor, options);
    };`);
  game.key('p');
  game.advance(2);
  assert.equal(game.run('JSON.stringify(playerFrames[0])'), game.run('JSON.stringify(playerFrames[1])'));
  game.key('p'); game.advance(2);
  assert.ok(game.run('playerFrames.at(-1).time > playerFrames[1].time'));
  assert.ok(game.run('playerFrames.at(-1).powerTimer < playerFrames[1].powerTimer'));
  assert.notEqual(game.run('JSON.stringify(player)'), game.run('JSON.stringify(playerFrames[1].actor)'));
});
