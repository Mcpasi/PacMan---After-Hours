// A run-wide visual timeline. Pauses, deaths and level overlays spend no ticks.
const RetroWorld = (() => {
  const phases = [
    { name: 'delay', seconds: 1.5 },
    { name: 'fadeIn', seconds: 8 },
    { name: 'hold', seconds: 30 },
    { name: 'fadeOut', seconds: 6 }
  ];
  const smooth = progress => progress * progress * (3 - 2 * progress);

  function create({ ticksPerSecond = 60 } = {}) {
    if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) {
      throw new TypeError('The retro world needs a positive tick rate.');
    }
    const state = { phase: 'idle', age: 0, duration: 0, mix: 0 };
    let phase = -1;

    function beginPhase() {
      const next = phases[phase];
      Object.assign(state, { phase: next?.name || 'idle', age: 0,
        duration: next ? Math.max(1, Math.round(next.seconds * ticksPerSecond)) : 0,
        mix: phase === 2 || phase === 3 ? 1 : 0 });
    }

    function trigger() {
      if (state.phase !== 'idle') return false;
      phase = 0;
      beginPhase();
      return true;
    }

    function update() {
      if (state.phase === 'idle') return;
      if (++state.age >= state.duration) {
        phase++;
        beginPhase();
        return;
      }
      const progress = smooth(state.age / state.duration);
      if (state.phase === 'fadeIn') state.mix = progress;
      else if (state.phase === 'fadeOut') state.mix = 1 - progress;
    }

    return { state, trigger, update };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RetroWorld;
