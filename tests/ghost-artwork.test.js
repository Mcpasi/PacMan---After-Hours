const assert = require('node:assert/strict');
const test = require('node:test');
const GhostProfiles = require('../scripts/ghosts/profiles');
const GhostArtwork = require('../scripts/rendering/ghosts');
const { actor, tile } = require('./helpers/ghost-fixtures');
const { boot } = require('./helpers/game-harness');

const options = { tile, dirs: [[1, 0], [0, 1], [-1, 0], [0, -1]], powerTimer: 240, time: 1, animFrame: 60 };
function paint(ghost, extra = {}) {
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
  const before = structuredClone(ghost);
  GhostArtwork.draw(ctx, [ghost], { ...options, ...extra });
  assert.deepEqual(ghost, before, 'artwork must never mutate game state');
  return calls;
}

test('each ghost has a unique silhouette, palette, signature details and balanced Canvas state', () => {
  const signatures = GhostProfiles.all.map(profile => {
    const calls = paint(actor(profile.id, 5, 5), { reducedMotion: true });
    assert.ok(calls.some(([method, offset, color]) => method === 'addColorStop' && offset === 0.35 && color === profile.color));
    assert.ok(calls.some(([method, offset, color]) => method === 'addColorStop' && offset === 0 && color === profile.accent));
    assert.equal(calls.filter(([method]) => method === 'save').length, calls.filter(([method]) => method === 'restore').length);
    assert.ok(calls.some(([method, x, y]) => method === 'scale' && x === tile && y === tile));
    return JSON.stringify(calls.filter(([method]) => ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'].includes(method)));
  });
  assert.equal(new Set(signatures).size, 4);
});

test('pupils follow both horizontal and vertical movement in all four directions', () => {
  for (const dir of [0, 1, 2, 3]) {
    const ghost = actor('blinky', 5, 5, dir), calls = paint(ghost);
    const pupil = calls.find(([method, , , radius]) => method === 'arc' && radius === 0.063);
    assert.ok(Math.abs(pupil[1] - (-0.18 + options.dirs[dir][0] * 0.055)) < 1e-9);
    assert.ok(Math.abs(pupil[2] - (-0.19 + options.dirs[dir][1] * 0.065)) < 1e-9);
  }
});

test('eaten ghosts render only directional eyes, with no body, aura or shadow', () => {
  for (const profile of GhostProfiles.all) {
    const ghost = actor(profile.id, 5, 5); ghost.mode = 'eyes';
    const calls = paint(ghost);
    assert.equal(calls.some(([method]) => method === 'createLinearGradient'), false);
    assert.equal(calls.some(([method]) => method === 'lineTo' || method === 'quadraticCurveTo'), false);
    assert.equal(calls.filter(([method]) => method === 'ellipse').length, 2);
    assert.equal(calls.filter(([method, , , radius]) => method === 'arc' && radius === 0.063).length, 2);
  }
});

test('frightened ghosts keep their silhouettes and gain a shared blue panic expression and warning flash', () => {
  const silhouettes = [];
  for (const profile of GhostProfiles.all) {
    const ghost = actor(profile.id, 5, 5); ghost.scared = true;
    const calls = paint(ghost, { reducedMotion: true });
    assert.ok(calls.some(([method, offset, color]) => method === 'addColorStop' && offset === 0.35 && color === '#4769d5'));
    assert.equal(calls.filter(([method, , , radius]) => method === 'arc' && radius === 0.063).length, 0);
    assert.equal(calls.filter(([method]) => method === 'lineTo').length >= 6, true, 'zigzag frightened mouth');
    silhouettes.push(JSON.stringify(calls.filter(([method]) => ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'].includes(method))));
    const warning = paint(ghost, { powerTimer: 100, animFrame: 8, time: 8 / 60 });
    assert.ok(warning.some(([method, offset, color]) => method === 'addColorStop' && offset === 0.35 && color === '#edf7ff'));
  }
  assert.equal(new Set(silhouettes).size, 4);
});

test('house ghosts are hidden until their release approaches', () => {
  const ghost = actor('pinky', 5, 5); ghost.mode = 'house'; ghost.houseTimer = 31;
  assert.deepEqual(paint(ghost), []);
  ghost.houseTimer = 30;
  assert.ok(paint(ghost).some(([method]) => method === 'createLinearGradient'));
});

test('reduced motion disables floating and warning flashes; normal animation follows renderer time', () => {
  const ghost = actor('inky', 5, 5); ghost.scared = true;
  assert.deepEqual(paint(ghost, { reducedMotion: true, time: 1, powerTimer: 50, animFrame: 0 }),
    paint(ghost, { reducedMotion: true, time: 7, powerTimer: 50, animFrame: 8 }));
  assert.notDeepEqual(paint(ghost, { time: 1 }), paint(ghost, { time: 2 }));
  assert.deepEqual(paint(ghost, { powerTimer: 50, time: 1, animFrame: 10 }), paint(ghost, { powerTimer: 50, time: 1, animFrame: 80 }));
});

test('ghost animation freezes with the game while paused', () => {
  const game = boot();
  game.click(); game.advance(2); game.key('p');
  game.drawing.length = 0;
  game.advance();
  const first = game.drawing.filter(([method]) => ['translate', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'].includes(method));
  game.drawing.length = 0;
  game.advance(1);
  const second = game.drawing.filter(([method]) => ['translate', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'].includes(method));
  assert.deepEqual(second, first);
});
