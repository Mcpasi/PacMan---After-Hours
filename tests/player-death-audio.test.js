const assert = require('node:assert/strict');
const test = require('node:test');
const PlayerDeathSound = require('../scripts/audio/player-death');
const { createAudioContext } = require('./helpers/audio-context');
const { boot } = require('./helpers/game-harness');

test('death sound schedules a filtered crack, a descending impact and four staggered metallic shards on the audio clock', () => {
  const context = createAudioContext({ currentTime: 12 });
  assert.equal(PlayerDeathSound.play(context, { random: () => 0.75 }), true);
  const sources = context.nodes.filter(node => ['oscillator', 'bufferSource'].includes(node.kind));
  assert.equal(sources.length, 6);
  assert.equal(context.buffers.length, 1);
  const buffer = context.buffers[0];
  assert.equal(buffer.numberOfChannels, 1);
  assert.equal(buffer.length, context.sampleRate * 0.18);
  assert.ok(buffer.getChannelData(0).every(sample => sample === 0.5));
  const filter = context.nodes.find(node => node.kind === 'filter');
  assert.equal(filter.type, 'highpass');
  assert.deepEqual(filter.automation, [['frequency', 'set', 900, 12]]);
  assert.equal(sources[0].connections[0], filter);
  assert.equal(sources[1].type, 'triangle');
  assert.deepEqual(sources[1].automation, [['frequency', 'set', 220, 12], ['frequency', 'ramp', 42, 12.45]]);
  assert.deepEqual(sources.slice(2).map(source => source.type), ['sine', 'sine', 'sine', 'sine']);
  assert.deepEqual(sources.slice(2).map(source => source.automation[0][2]), [1500, 1120, 840, 620]);
  sources.forEach(source => {
    assert.equal(source.starts.length, 1); assert.equal(source.stops.length, 1);
    assert.ok(source.starts[0] >= 12 && source.stops[0] > source.starts[0] && source.stops[0] <= 12.6);
  });
  assert.ok(sources[3].starts[0] > sources[2].starts[0]);
  for (const gain of context.nodes.filter(node => node.kind === 'gain')) {
    assert.ok(gain.automation[0][2] > 0 && gain.automation[0][2] <= 0.12);
    assert.equal(gain.automation[1][1], 'ramp'); assert.equal(gain.automation[1][2], 0.001);
    assert.equal(gain.connections[0], context.destination);
  }
});

test('each completed voice disconnects its source, envelope and optional filter', () => {
  const context = createAudioContext(); PlayerDeathSound.play(context);
  for (const source of context.nodes.filter(node => typeof node.onended === 'function')) source.onended();
  assert.ok(context.nodes.every(node => node.disconnects === 1));
});

test('missing audio and allocation failures are harmless and release partially built graphs', () => {
  assert.equal(PlayerDeathSound.play(null), false);
  for (const method of ['createBuffer', 'createBufferSource', 'createBiquadFilter', 'createGain', 'createOscillator']) {
    const context = createAudioContext();
    context[method] = () => { throw new Error('Audio device lost'); };
    assert.equal(PlayerDeathSound.play(context), false, method);
    assert.ok(context.nodes.every(node => node.disconnects > 0), method);
    assert.ok(context.nodes.filter(node => node.starts.length).every(node => node.stops.at(-1) === context.currentTime));
  }
});

test('a failure after the impact starts stops all scheduled voices and allows cleanup even when stop throws', () => {
  const context = createAudioContext();
  const createOscillator = context.createOscillator;
  let count = 0;
  context.createOscillator = () => {
    if (++count === 3) throw new Error('Audio disconnected during scheduling');
    return createOscillator();
  };
  const createBufferSource = context.createBufferSource;
  context.createBufferSource = () => {
    const source = createBufferSource();
    source.stop = () => { throw new Error('Source already stopped'); };
    return source;
  };
  assert.equal(PlayerDeathSound.play(context), false);
  assert.ok(context.nodes.every(node => node.disconnects > 0));
});

test('a lethal collision starts the synthesized sound immediately and only once', () => {
  const game = boot(); game.click();
  game.run(`Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y });
    globalThis.soundContext = audioCtx; checkCollisions(); checkCollisions();`);
  assert.equal(game.run('soundContext.nodes.filter(node => node.kind === "bufferSource").length'), 1);
  assert.equal(game.run('soundContext.nodes.filter(node => node.kind === "oscillator").length'), 5);
  assert.equal(game.run('playerDeath.state.age'), 0);
});

for (const audio of ['missing', 'throws', 'toneThrows', 'suspended', 'webkit']) {
  test(`audio (${audio}) cannot interrupt the visual death sequence or respawn`, () => {
    const game = boot({ audio }); game.click();
    game.run(`Object.assign(ghosts[0], { mode: 'chase', x: player.x, y: player.y }); checkCollisions();`);
    game.advance(3);
    assert.equal(game.run('player.alive'), false);
    assert.ok(game.run('playerDeath.state.age') > 0);
    assert.equal(game.frames.length, 1);
    game.respawn();
    assert.equal(game.run('player.alive'), true);
    assert.equal(game.run('lives'), 2);
  });
}
