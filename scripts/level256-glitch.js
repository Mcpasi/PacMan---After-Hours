// A visual homage, not a level requirement. Only active simulation ticks count.
const Level256Glitch = (() => {
  const phases = [
    { name: 'lamps', seconds: 2.2 },
    { name: 'cluster', seconds: 1.05 },
    { name: 'symbols', seconds: 0.8 }
  ];

  function create({ ticksPerSecond = 60, random = Math.random, onStart = () => {} } = {}) {
    if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0 || typeof random !== 'function' ||
      typeof onStart !== 'function') {
      throw new TypeError('The city glitch needs a positive tick rate, a random source and an onStart callback.');
    }
    const ticks = seconds => Math.max(1, Math.round(seconds * ticksPerSecond));
    const delay = (minimum, spread) => ticks(minimum + random() * spread);
    const state = { effect: null, ticksUntilGlitch: delay(45, 30) };
    let phase = 0;

    function beginPhase(seed) {
      state.effect = { phase: phases[phase].name, age: 0,
        duration: ticks(phases[phase].seconds), ticksPerSecond, seed };
    }

    function update() {
      if (!state.effect) {
        if (--state.ticksUntilGlitch <= 0) {
          phase = 0;
          beginPhase(Math.floor(random() * 4294967296) >>> 0);
          onStart();
        }
        return;
      }
      if (++state.effect.age < state.effect.duration) return;
      if (++phase < phases.length) beginPhase(state.effect.seed);
      else {
        state.effect = null;
        // Cooldown belongs to the run, never to a level or actor respawn.
        state.ticksUntilGlitch = delay(100, 60);
      }
    }

    return { state, update };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Level256Glitch;
