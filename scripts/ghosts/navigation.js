// Tile topology is cached independently of dots, animation and actor state.
const GhostNavigation = (() => {
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function create(maze, tile) {
    if (!maze.length || !maze[0].length || maze.some(row => row.length !== maze[0].length) ||
        !Number.isFinite(tile) || tile <= 0) {
      throw new TypeError('Ghost navigation needs a rectangular grid and a positive tile size.');
    }
    const rows = maze.length, cols = maze[0].length;
    const cells = maze.flatMap((row, r) => row.map((value, c) => ({ col: c, row: r, index: r * cols + c, value })));
    const indexOf = cell => cell && cell.row >= 0 && cell.row < rows && cell.col >= 0 && cell.col < cols
      ? cell.row * cols + cell.col : -1;
    const topologies = [false, true].map(allowDoor => {
      const walkable = cell => cell && cell.value !== 0 && (allowDoor || cell.value !== 4);
      const edges = cells.map(cell => {
        if (!walkable(cell)) return [];
        return dirs.flatMap(([dx, dy], dir) => {
          const row = cell.row + dy;
          // Only horizontal, open-ended corridors are tunnels. Never wrap vertically.
          const col = (cell.col + dx + cols) % cols;
          const next = row >= 0 && row < rows ? cells[row * cols + col] : null;
          return walkable(next) ? [{ col, row, index: next.index, dir }] : [];
        });
      });
      const components = new Int32Array(cells.length).fill(-1), groups = [];
      for (const cell of cells) {
        if (!walkable(cell) || components[cell.index] !== -1) continue;
        const group = [cell], id = groups.length;
        components[cell.index] = id;
        for (let head = 0; head < group.length; head++) {
          for (const next of edges[group[head].index]) {
            if (components[next.index] !== -1) continue;
            components[next.index] = id;
            group.push(cells[next.index]);
          }
        }
        groups.push(group);
      }
      return { edges, components, groups, fields: new Map() };
    });
    const topology = allowDoor => topologies[allowDoor ? 1 : 0];

    function cellAt({ x, y }) {
      const row = Math.floor(y / tile), col = ((Math.floor(x / tile) % cols) + cols) % cols;
      return row >= 0 && row < rows ? cells[row * cols + col] : null;
    }

    function point(cell) {
      return { x: (cell.col + 0.5) * tile, y: (cell.row + 0.5) * tile };
    }

    function neighbors(cell, allowDoor = false) {
      return topology(allowDoor).edges[indexOf(cell)] || [];
    }

    function nearest(target, origin, { allowDoor = false, reserved = [] } = {}) {
      const map = topology(allowDoor);
      const group = map.groups[map.components[indexOf(origin)]];
      if (!group) return null;
      let best = null, bestScore = Infinity;
      for (const cell of group) {
        const p = point(cell);
        // Prefer separate search areas, but permit sharing in a constrained corridor.
        const occupied = reserved.some(other => Math.abs(other.col - cell.col) + Math.abs(other.row - cell.row) < 2);
        const score = (p.x - target.x) ** 2 + (p.y - target.y) ** 2 + (occupied ? (cols * cols + rows * rows) * tile * tile : 0);
        if (score < bestScore) { best = cell; bestScore = score; }
      }
      return best;
    }

    function distance(from, target, allowDoor = false) {
      const map = topology(allowDoor), start = indexOf(from), end = indexOf(target);
      if (start < 0 || end < 0 || map.components[start] < 0 || map.components[start] !== map.components[end]) return Infinity;
      let field = map.fields.get(end);
      if (!field) {
        field = new Int32Array(cells.length).fill(-1);
        field[end] = 0;
        const queue = [end];
        for (let head = 0; head < queue.length; head++) {
          for (const next of map.edges[queue[head]]) {
            if (field[next.index] !== -1) continue;
            field[next.index] = field[queue[head]] + 1;
            queue.push(next.index);
          }
        }
        // Bound memory on mobile; pellet consumption never invalidates topology.
        if (map.fields.size >= 32) map.fields.delete(map.fields.keys().next().value);
        map.fields.set(end, field);
      }
      return field[start] < 0 ? Infinity : field[start];
    }

    return { tile, width: cols * tile, height: rows * tile, cellAt, point, neighbors, nearest, distance };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GhostNavigation;
