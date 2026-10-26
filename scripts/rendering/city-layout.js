// Visual data only: the collision grid remains owned by the game.
const CityLayout = (() => {
  function noise(x, y) {
    let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }

  function create(maze, tile) {
    if (!maze.length || !maze[0].length || !Number.isFinite(tile) || tile <= 0) {
      throw new TypeError('A city needs a non-empty grid and a positive tile size.');
    }
    const rows = maze.length, cols = maze[0].length;
    if (maze.some(row => row.length !== cols)) throw new TypeError('The city grid must be rectangular.');
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const buildings = [], streets = [], collectibles = [], candidates = [], lamps = [];
    const wall = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && maze[r][c] === 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = maze[r][c];
        if (cell !== 0) {
          streets.push({ row: r, col: c, seed: noise(c, r) });
          if (cell === 2 || cell === 3 || cell === 4) collectibles.push({ row: r, col: c });
          const edge = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([dx, dy]) => wall(r + dy, c + dx));
          if (edge && cell !== 4) {
            candidates.push({
              row: r, col: c, power: cell === 3,
              x: (c + 0.5 + edge[0] * 0.34) * tile,
              y: (r + 0.5 + edge[1] * 0.34) * tile,
              seed: noise(c, r)
            });
          }
          continue;
        }
        if (visited[r][c]) continue;
        // Greedy rectangles cover every wall cell exactly once, including irregular blocks.
        let width = 1, height = 1;
        while (c + width < cols && wall(r, c + width) && !visited[r][c + width]) width++;
        while (r + height < rows && Array.from({ length: width }, (_, x) => c + x)
          .every(x => wall(r + height, x) && !visited[r + height][x])) height++;
        for (let y = r; y < r + height; y++) {
          for (let x = c; x < c + width; x++) visited[y][x] = true;
        }
        const seed = noise(c, r);
        buildings.push({ row: r, col: c, cols: width, rows: height,
          x: c * tile, y: r * tile, width: width * tile, depth: height * tile,
          height: tile * (0.45 + seed * 0.9), seed });
      }
    }
    candidates.sort((a, b) => Number(b.power) - Number(a.power) || a.seed - b.seed);
    for (const candidate of candidates) {
      if (lamps.length >= 32) break;
      if (lamps.every(lamp => Math.hypot(lamp.x - candidate.x, lamp.y - candidate.y) >= tile * 3)) {
        lamps.push(candidate);
      }
    }
    return { width: cols * tile, height: rows * tile, tile, buildings, streets, collectibles, lamps };
  }
  return { create, noise };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CityLayout;
