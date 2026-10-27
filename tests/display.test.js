const assert = require('node:assert/strict');
const test = require('node:test');
const { boot } = require('./helpers/game-harness');

function isExpanded(game) {
  return game.elements.get('gameContainer').classList.contains('is-expanded');
}

test('fullscreen without a browser API expands and restores the view without changing gameplay', () => {
  for (const state of ['title', 'playing', 'paused', 'levelComplete', 'gameOver']) {
    const game = boot();
    game.run(`gameState = '${state}';`);
    const before = game.run('JSON.stringify({ gameState, player, ghosts, maze, score, lives, level })');
    game.click('fullscreenBtn');
    assert.equal(isExpanded(game), true);
    assert.equal(game.run('document.body.classList.contains("game-expanded")'), true);
    assert.equal(game.elements.get('fullscreenBtn').getAttribute('aria-pressed'), 'true');
    assert.equal(game.elements.get('fullscreenBtn').getAttribute('aria-label'), 'Exit fullscreen');
    game.click('fullscreenBtn');
    assert.equal(isExpanded(game), false);
    assert.equal(game.run('document.body.classList.contains("game-expanded")'), false);
    assert.equal(game.elements.get('fullscreenBtn').getAttribute('aria-pressed'), 'false');
    assert.equal(game.elements.get('fullscreenBtn').getAttribute('aria-label'), 'Enter fullscreen');
    assert.equal(game.run('JSON.stringify({ gameState, player, ghosts, maze, score, lives, level })'), before);
  }
});

test('Escape exits the fallback view without also pausing, then retains the normal pause shortcut', () => {
  const game = boot();
  game.click();
  game.click('fullscreenBtn');
  assert.equal(game.key('Escape').defaultPrevented, true);
  assert.equal(isExpanded(game), false);
  assert.equal(game.run('gameState'), 'playing');
  game.key('Escape');
  assert.equal(game.run('gameState'), 'paused');
});

test('Enter and Space on the fullscreen button are not hijacked by game shortcuts', () => {
  const game = boot();
  for (const key of ['Enter', ' ']) {
    assert.equal(game.key(key, false, game.elements.get('fullscreenBtn')).defaultPrevented, false);
    assert.equal(game.run('gameState'), 'title');
  }
});

for (const failure of ['throw', 'reject']) {
  test(`a fullscreen request that fails (${failure}) retains a usable fallback`, async () => {
    const game = boot();
    game.elements.get('gameContainer').requestFullscreen = () => {
      if (failure === 'throw') throw new Error('Fullscreen unavailable');
      return Promise.reject(new Error('Fullscreen denied'));
    };
    game.click('fullscreenBtn');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(isExpanded(game), true);
    game.click('fullscreenBtn');
    assert.equal(isExpanded(game), false);
  });
}

for (const prefix of ['', 'webkit']) {
  test(`native ${prefix || 'standard'} fullscreen tracks external exits and ignores duplicate pending requests`, async () => {
    const game = boot();
    const container = game.elements.get('gameContainer');
    const field = prefix ? 'webkitFullscreenElement' : 'fullscreenElement';
    const event = prefix ? 'webkitfullscreenchange' : 'fullscreenchange';
    const request = prefix ? 'webkitRequestFullscreen' : 'requestFullscreen';
    const exit = prefix ? 'webkitExitFullscreen' : 'exitFullscreen';
    let resolveRequest, requests = 0;
    container[request] = () => {
      requests++;
      game.run(`document.${field} = document.getElementById('gameContainer'); document.emit('${event}');`);
      return new Promise(resolve => { resolveRequest = resolve; });
    };
    game.run(`document.${exit} = function () { document.${field} = null; document.emit('${event}'); };`);
    game.click('fullscreenBtn');
    game.click('fullscreenBtn');
    assert.equal(requests, 1);
    assert.equal(isExpanded(game), true);
    resolveRequest();
    await new Promise(resolve => setImmediate(resolve));
    game.click('fullscreenBtn');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(isExpanded(game), false);
    game.click('fullscreenBtn');
    resolveRequest();
    await new Promise(resolve => setImmediate(resolve));
    game.run(`document.${field} = null; document.emit('${event}');`);
    assert.equal(isExpanded(game), false);
    assert.equal(game.elements.get('fullscreenBtn').getAttribute('aria-pressed'), 'false');
  });
}

test('a rejected native exit does not hide the still-active fullscreen control', async () => {
  const game = boot();
  game.elements.get('gameContainer').requestFullscreen = () => {
    game.run("document.fullscreenElement = document.getElementById('gameContainer'); document.emit('fullscreenchange');");
  };
  game.run('document.exitFullscreen = () => Promise.reject(new Error("Exit denied"));');
  game.click('fullscreenBtn');
  await new Promise(resolve => setImmediate(resolve));
  game.click('fullscreenBtn');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(isExpanded(game), true);
  assert.equal(game.elements.get('fullscreenBtn').getAttribute('aria-pressed'), 'true');
});
