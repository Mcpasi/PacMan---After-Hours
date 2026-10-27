// A self-contained, fixed-tick death sequence; no rendering, audio or wall-clock timers.
const PlayerDeath = (() => {
  function create(player, { ticksPerSecond = 60 } = {}) {
    if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) {
      throw new TypeError('Player death needs a positive tick rate.');
    }
    const mouth = 0.2 + player.mouth * 0.6;
    const count = 9, sweep = (Math.PI * 2 - mouth * 2) / count;
    const fragments = Array.from({ length: count }, (_, index) => {
      const start = mouth + index * sweep, end = start + sweep;
      const middle = (start + end) / 2, direction = middle + player.dir * Math.PI / 2;
      const speed = 1.2 + index % 3 * 0.35;
      return {
        start, end, cx: Math.cos(middle) * 0.28, cy: Math.sin(middle) * 0.28,
        vx: Math.cos(direction) * speed, vy: Math.sin(direction) * speed - 0.5,
        spin: (index % 2 ? 1 : -1) * (2 + index * 0.13)
      };
    });
    const state = {
      x: player.x, y: player.y, dir: player.dir, fragments,
      age: 0, duration: Math.max(1, Math.round(ticksPerSecond * 1.5))
    };

    function update() {
      state.age = Math.min(state.duration, state.age + 1);
      return state.age >= state.duration;
    }

    return { state, update };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlayerDeath;
