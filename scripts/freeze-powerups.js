// Level-owned pickups and a simulation clock; no ghost or learning state lives here.
const FreezePowerUps = (() => {
  const kinds = ['lantern', 'watch'];

  function create(maze, tile, { origin, ticksPerSecond = 60, reserved = [] } = {}) {
    if (!maze.length || !maze[0].length || maze.some(row => row.length !== maze[0].length) ||
        !Number.isFinite(tile) || tile <= 0 || !Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0 ||
        !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y) || !Array.isArray(reserved) ||
        reserved.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) {
      throw new TypeError('Freeze pickups need a rectangular grid, positive tile size/tick rate and an origin.');
    }
    const rows = maze.length, cols = maze[0].length, width = cols * tile;
    const key = cell => cell.row * cols + cell.col;
    const walkable = (col, row) => row >= 0 && row < rows && [1, 2, 3].includes(maze[row][col]);
    const start = { col: Math.floor(origin.x / tile), row: Math.floor(origin.y / tile) };

    function flood(from) {
      const queue = walkable(from.col, from.row) ? [{ ...from, distance: 0 }] : [];
      const visited = new Map(queue.map(cell => [key(cell), cell.distance]));
      for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const col = (cell.col + dx + cols) % cols, row = cell.row + dy;
          const next = { col, row, distance: cell.distance + 1 };
          if (!walkable(col, row) || visited.has(key(next))) continue;
          visited.set(key(next), next.distance);
          queue.push(next);
        }
      }
      return { cells: queue, distances: visited };
    }

    const reachable = flood(start);
    // Spread the two finds along actual streets, not across walls. Never cover
    // a power pellet, the spawn, a door, the house, another bonus or disconnected scenery.
    const candidates = reachable.cells.filter(cell => key(cell) !== key(start) && maze[cell.row][cell.col] !== 3 &&
      reserved.every(point => {
        const dx = Math.abs((cell.col + 0.5) * tile - point.x) % width;
        return Math.hypot(Math.min(dx, width - dx), (cell.row + 0.5) * tile - point.y) >= tile * 1.5;
      }));
    const pickups = [];
    let separation = reachable.distances;
    for (const kind of kinds) {
      let best = null, bestDistance = -1;
      for (const cell of candidates) {
        if (pickups.some(pickup => pickup.x === (cell.col + 0.5) * tile && pickup.y === (cell.row + 0.5) * tile)) continue;
        const distance = Math.min(cell.distance, separation.get(key(cell)));
        if (distance > bestDistance) { best = cell; bestDistance = distance; }
      }
      if (!best) break; // Tiny/custom maps must not invent unreachable pickups.
      pickups.push({ kind, x: (best.col + 0.5) * tile, y: (best.row + 0.5) * tile });
      separation = flood(best).distances;
    }
    const state = { pickups, remainingTicks: 0, duration: Math.max(1, Math.round(4 * ticksPerSecond)), ticksPerSecond };

    function collect(player) {
      if (!player.alive) return false;
      const index = state.pickups.findIndex(pickup => {
        const dx = Math.abs(player.x - pickup.x) % width;
        return Math.hypot(Math.min(dx, width - dx), player.y - pickup.y) < tile * 0.65;
      });
      if (index === -1) return false;
      state.pickups.splice(index, 1);
      state.remainingTicks = state.duration; // Refresh, rather than stack, the four-second effect.
      return true;
    }

    function update() {
      if (state.remainingTicks <= 0) return false;
      state.remainingTicks--;
      return true; // Even the last tick suppresses movement; the following one resumes it.
    }

    function resetEffect() { state.remainingTicks = 0; }

    return { state, collect, update, resetEffect };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FreezePowerUps;
