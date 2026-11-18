const assert = require('node:assert/strict');
const test = require('node:test');
const PowerPelletArtwork = require('../scripts/rendering/power-pellet');
const { boot } = require('./helpers/game-harness');

function paint(tile, time, reducedMotion) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => {
        calls.push([key, ...args]);
        return { addColorStop: (...stops) => calls.push(['addColorStop', ...stops]) };
      };
      return (...args) => calls.push([key, ...args]);
    }
  });
  PowerPelletArtwork.draw(ctx, 24, 56, { tile, time, reducedMotion });
  return calls;
}

test('a city power pellet keeps its bezel and pulse centered on the tile at every scale', () => {
  for (const tile of [12, 16, 24, 64]) {
    const first = paint(tile, 0, false), later = paint(tile, 1, false);
    assert.deepEqual(first.find(([method]) => method === 'translate'), ['translate', 24, 56]);
    assert.deepEqual(first.find(([method]) => method === 'scale'), ['scale', tile, tile]);
    assert.ok(first.some(([method, , color]) => method === 'addColorStop' && color === '#fff5cb'));
    const bezel = calls => calls.filter(([method]) => method === 'moveTo' || method === 'lineTo');
    assert.ok(bezel(first).length > 8, 'front and side surfaces are both drawn');
    assert.deepEqual(bezel(first), bezel(later));
    assert.notDeepEqual(first, later, 'the light pulses independently of the bezel');
    assert.deepEqual(paint(tile, 0, true), paint(tile, 17, true), 'reduced motion holds the light steady');
    assert.equal(first.filter(([method]) => method === 'save').length, first.filter(([method]) => method === 'restore').length);
  }
});

test('collecting a power pellet removes its city artwork without removing any other lights', () => {
  const game = boot({ reducedMotion: true });
  game.click();
  game.key('p');
  game.run(`globalThis.powerPelletsDrawn = [];
    PowerPelletArtwork.draw = (ctx, x, y) => powerPelletsDrawn.push([x, y]);`);
  game.advance();
  const initial = JSON.parse(game.run('JSON.stringify(powerPelletsDrawn)'));
  assert.deepEqual(initial, [[24, 56], [424, 56], [24, 296], [424, 296]]);

  game.run(`Object.assign(player, { x: 24, y: 56, speed: 0 });
    updatePlayer();
    powerPelletsDrawn.length = 0;`);
  game.advance();
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(powerPelletsDrawn)')), initial.slice(1));
  assert.equal(game.run('maze[3][1]'), 1);
  assert.equal(game.run('score'), 50);
  assert.equal(game.run('powerTimer'), 480);
});
