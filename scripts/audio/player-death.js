// A short crack, falling low tone and scattered metallic fragments, synthesized offline.
const PlayerDeathSound = (() => {
  function play(context, { random = Math.random } = {}) {
    if (!context) return false;
    const sources = [], nodes = [];
    try {
      const now = context.currentTime;
      function voice(source, volume, delay, duration, filter) {
        sources.push(source);
        const gain = context.createGain(); nodes.push(gain);
        const start = now + delay;
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        if (filter) { source.connect(filter); filter.connect(gain); }
        else source.connect(gain);
        gain.connect(context.destination);
        source.onended = () => { source.disconnect(); filter?.disconnect(); gain.disconnect(); };
        source.start(start); source.stop(start + duration);
      }

      const buffer = context.createBuffer(1, Math.max(1, Math.round(context.sampleRate * 0.18)), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index++) data[index] = random() * 2 - 1;
      const crack = context.createBufferSource();
      // Track the source before any further allocation, so partial failures can release it.
      nodes.push(crack);
      crack.buffer = buffer;
      const filter = context.createBiquadFilter(); nodes.push(filter);
      filter.type = 'highpass'; filter.frequency.setValueAtTime(900, now);
      voice(crack, 0.12, 0, 0.18, filter);

      const drop = context.createOscillator(); nodes.push(drop);
      drop.type = 'triangle'; drop.frequency.setValueAtTime(220, now);
      drop.frequency.exponentialRampToValueAtTime(42, now + 0.45);
      voice(drop, 0.09, 0, 0.5);

      [1500, 1120, 840, 620].forEach((frequency, index) => {
        const shard = context.createOscillator(); nodes.push(shard);
        const delay = 0.035 + index * 0.085;
        shard.type = 'sine'; shard.frequency.setValueAtTime(frequency, now + delay);
        shard.frequency.exponentialRampToValueAtTime(frequency * 0.55, now + delay + 0.16);
        voice(shard, 0.035 - index * 0.005, delay, 0.18);
      });
      return true;
    } catch {
      // Optional audio must not interrupt the death sequence, even if a device disappears.
      for (const source of sources) { source.onended = null; try { source.stop(); } catch {} }
      for (const node of nodes) { try { node.disconnect(); } catch {} }
      return false;
    }
  }

  return { play };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlayerDeathSound;
