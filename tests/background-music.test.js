const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const BackgroundMusic = require('../scripts/audio/background-music');
const { createAudioContext } = require('./helpers/audio-context');
const { createMediaAudio } = require('./helpers/media-audio');
const { boot } = require('./helpers/game-harness');

test('the supplied local track loops through a separate quiet gain bus', () => {
  const context = createAudioContext({ currentTime: 12 });
  const audio = createMediaAudio();
  const music = BackgroundMusic.create({ createAudio: () => audio });
  assert.equal(context.nodes.length, 0, 'do not allocate audio before Start');
  assert.equal(music.play(context), true);
  assert.equal(audio.src, 'sounds/background_sound.mp3');
  assert.ok(fs.statSync(path.join(__dirname, '..', audio.src)).size > 0);
  assert.equal(audio.loop, true, 'the browser must repeat the track rather than stop at its end');
  assert.equal(audio.preload, 'auto');
  assert.equal(audio.paused, false);
  const [source, gain] = context.nodes;
  assert.equal(source.kind, 'mediaSource');
  assert.equal(source.mediaElement, audio);
  assert.deepEqual(source.connections, [gain]);
  assert.deepEqual(gain.connections, [context.destination]);
  assert.deepEqual(gain.automation, [['gain', 'set', 0.025, 12]]);
});

test('repeated starts reuse one stream, while pause and resume preserve its position', () => {
  const context = createAudioContext();
  const media = [];
  const music = BackgroundMusic.create({ createAudio: () => {
    const audio = createMediaAudio(); media.push(audio); return audio;
  } });
  music.pause();
  music.play(context); music.play(context);
  assert.equal(media.length, 1);
  assert.equal(media[0].plays, 1);
  media[0].currentTime = 42;
  music.pause();
  assert.equal(media[0].paused, true);
  music.play(context);
  assert.equal(media[0].currentTime, 42);
  assert.equal(media[0].plays, 2);
  assert.equal(context.nodes.length, 2, 'resume must not duplicate the audio graph');
});

test('a replaced audio context releases the previous stream and graph before reconnecting', () => {
  const first = createAudioContext(), second = createAudioContext();
  const media = [];
  const music = BackgroundMusic.create({ createAudio: () => {
    const audio = createMediaAudio(); media.push(audio); return audio;
  } });
  music.play(first); music.play(second);
  assert.equal(media.length, 2);
  assert.equal(media[0].paused, true);
  assert.equal(media[1].paused, false);
  assert.ok(first.nodes.every(node => node.disconnects === 1));
  assert.equal(second.nodes.length, 2);
});

test('unavailable media and partial graph failures are harmless and allow a later retry', () => {
  assert.equal(BackgroundMusic.create().play(null), false);
  const missing = BackgroundMusic.create({ createAudio() { throw new Error('No media API'); } });
  assert.equal(missing.play(createAudioContext()), false);
  for (const method of ['createMediaElementSource', 'createGain', 'connect', 'setValueAtTime']) {
    const context = createAudioContext();
    const audio = createMediaAudio();
    if (method === 'connect' || method === 'setValueAtTime') {
      const createGain = context.createGain;
      context.createGain = () => {
        const gain = createGain();
        if (method === 'connect') gain.connect = () => { throw new Error('Disconnected'); };
        else gain.gain.setValueAtTime = () => { throw new Error('Disconnected'); };
        return gain;
      };
    } else context[method] = () => { throw new Error('Disconnected'); };
    const music = BackgroundMusic.create({ createAudio: () => audio });
    assert.equal(music.play(context), false, method);
    assert.equal(audio.paused, true, method);
    assert.ok(context.nodes.every(node => node.disconnects === 1), method);
    assert.equal(music.play(createAudioContext()), true, method);
  }
});

test('synchronous and rejected play failures do not escape and playback can be retried', async () => {
  for (const playback of ['throws', 'blocked']) {
    const audio = createMediaAudio({ playback });
    const context = createAudioContext();
    const music = BackgroundMusic.create({ createAudio: () => audio });
    assert.doesNotThrow(() => music.play(context));
    await Promise.resolve();
    assert.equal(audio.paused, true);
    audio.playback = 'playing';
    assert.equal(music.play(context), true);
    assert.equal(audio.paused, false);
    music.pause();
  }
});

test('music starts only after a gesture and leaves all effect gains unchanged', () => {
  const game = boot();
  game.advance(2);
  assert.equal(game.media.length, 0);
  game.key('Enter');
  assert.equal(game.media.length, 1);
  assert.equal(game.media[0].paused, false);
  game.run('playChomp(); playPower(); playGhostEat();');
  const gains = game.run('audioCtx.nodes.filter(node => node.kind === "gain").map(node => node.automation[0][2])');
  assert.deepEqual(Array.from(gains), [0.025, 0.05, 0.1, 0.08, 0.1]);
  game.run('playDeath();');
  assert.equal(game.run('audioCtx.nodes.filter(node => node.kind === "bufferSource").length'), 1);
  assert.equal(game.run('audioCtx.nodes.filter(node => node.kind === "gain").every(node => node.connections[0] === audioCtx.destination)'), true);
});

for (const resume of ['p', 'Escape', 'Enter', ' ', 'button']) {
  test(`pause and ${resume === ' ' ? 'Space' : resume} resume reuse the same track without rewinding`, () => {
    const game = boot(); game.click();
    const audio = game.media[0]; audio.currentTime = 25;
    game.key('p');
    assert.equal(audio.paused, true);
    if (resume === 'button') game.click('ovBtn');
    else game.key(resume);
    assert.equal(audio.paused, false);
    assert.equal(audio.currentTime, 25);
    assert.equal(game.media.length, 1);
  });
}

test('hidden tabs pause music and returning never resumes a manually paused game', () => {
  const game = boot();
  game.setHidden(true); game.setHidden(false);
  assert.equal(game.media.length, 0, 'visibility changes must not start title music');
  game.click();
  const audio = game.media[0]; audio.currentTime = 15;
  game.setHidden(true);
  assert.equal(audio.paused, true);
  game.setHidden(false);
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 15);
  game.key('p');
  game.setHidden(true); game.setHidden(false);
  assert.equal(audio.paused, true);
});

test('respawns keep the music, while level completion and game over pause until continued', () => {
  const game = boot(); game.click();
  const audio = game.media[0]; audio.currentTime = 30;
  game.run('Object.assign(ghosts[0], { mode: "chase", x: player.x, y: player.y }); checkCollisions();');
  game.respawn();
  assert.equal(audio.paused, false);
  assert.equal(audio.plays, 1);
  game.run('dotsLeft = 0; updatePlayer();');
  assert.equal(audio.paused, true);
  game.click('ovBtn');
  assert.equal(audio.paused, false);
  game.run('lives = 1; Object.assign(ghosts[0], { mode: "chase", x: player.x, y: player.y }); checkCollisions();');
  game.respawn();
  assert.equal(game.run('gameState'), 'gameOver');
  assert.equal(audio.paused, true);
  game.click('ovBtn');
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 30);
  assert.equal(game.media.length, 1, 'restarts must not stack music streams');
});

for (const music of ['missing', 'throws', 'blocked']) {
  test(`music failure (${music}) cannot prevent gameplay or existing effects`, async () => {
    const game = boot({ music }); game.click();
    await Promise.resolve();
    game.advance(30);
    assert.equal(game.run('gameState'), 'playing');
    assert.ok(game.run('score') > 0);
    assert.ok(game.run('audioCtx.nodes.some(node => node.kind === "oscillator")'));
    assert.equal(game.frames.length, 1);
  });
}
