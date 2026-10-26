// A level owns its bonus, independently of actor respawns and the pellet grid.
const BonusLife = (() => {
  function create(maze, tile, { origin, ticksPerSecond = 60, random = Math.random }) {
    if (!maze.length || !maze[0].length || maze.some(row => row.length !== maze[0].length) ||
        !Number.isFinite(tile) || tile <= 0 || !Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) {
      throw new TypeError('Bonus lives need a rectangular grid, a positive tile size and tick rate.');
    }
    const rows = maze.length, cols = maze[0].length;
    const walkable = (col, row) => row >= 0 && row < rows && [1, 2, 3].includes(maze[row][col]);
    const start = { col: Math.floor(origin.x / tile), row: Math.floor(origin.y / tile) };
    const streets = walkable(start.col, start.row) ? [start] : [];
    const visited = new Set(streets.map(cell => cell.row * cols + cell.col));
    // Flood only player-accessible streets: never the house or disconnected scenery.
    for (let head = 0; head < streets.length; head++) {
      const cell = streets[head];
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const col = (cell.col + dx + cols) % cols, row = cell.row + dy;
        const key = row * cols + col;
        if (!walkable(col, row) || visited.has(key)) continue;
        visited.add(key);
        streets.push({ col, row });
      }
    }
    // Prefer the lit routes, without covering power pellets. Empty test/custom
    // mazes can still offer a bonus on their reachable paths.
    const litStreets = streets.filter(({ col, row }) => maze[row][col] === 2);
    const candidates = (litStreets.length ? litStreets : streets).map(({ col, row }) => ({
      x: (col + 0.5) * tile, y: (row + 0.5) * tile
    }));
    const state = {
      coin: null, collected: false, effect: null,
      ticksUntilSpawn: Math.max(1, Math.round((4 + random() * 6) * ticksPerSecond))
    };

    function update(player) {
      if (!player.alive) return false;
      if (state.effect && ++state.effect.age >= state.effect.duration) state.effect = null;
      if (state.ticksUntilSpawn > 0 && --state.ticksUntilSpawn === 0 && candidates.length) {
        // Do not materialize directly under Pac-Man when another street is free.
        const distant = candidates.filter(point => Math.hypot(point.x - player.x, point.y - player.y) >= tile * 3);
        const choices = distant.length ? distant : candidates;
        state.coin = { ...choices[Math.floor(random() * choices.length)] };
      }
      if (state.collected || !state.coin || Math.hypot(player.x - state.coin.x, player.y - state.coin.y) >= tile * 0.65) {
        return false;
      }
      state.collected = true;
      state.effect = { ...state.coin, age: 0, duration: Math.max(1, Math.round(ticksPerSecond * 1.2)) };
      state.coin = null;
      return true;
    }

    return { state, update };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BonusLife;
