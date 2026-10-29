// A retro visit owns its fruit; actor and level resets cannot award it twice.
const CherryBonus = (() => {
  const navigationModule = typeof module !== 'undefined' && module.exports ? require('./ghosts/navigation') : GhostNavigation;
  const points = 100;

  function behindHouse(maze, tile, navigation, origin) {
    const doors = maze.flatMap((row, r) => row.flatMap((cell, col) => cell === 4 ? [{ col, row: r }] : []));
    if (!doors.length || doors.some((door, index) => door.row !== doors[0].row ||
        door.col !== doors[0].col + index)) return null;
    const walkable = (col, row) => [1, 2, 3].includes(maze[row]?.[col]);
    let row = doors[0].row + 1;
    if (!doors.every(door => walkable(door.col, row))) return null;
    // Follow the house interior to its back wall, then use the street just below it.
    while (row < maze.length && doors.every(door => walkable(door.col, row))) row++;
    if (!doors.every(door => maze[row]?.[door.col] === 0)) return null;
    row++;
    const start = navigation.cellAt(origin);
    if (!doors.every(door => walkable(door.col, row) &&
        Number.isFinite(navigation.distance(start, { col: door.col, row })))) return null;
    return { x: (doors[0].col + doors.at(-1).col + 1) * tile / 2, y: (row + 0.5) * tile };
  }

  function create(maze, tile, { origin } = {}) {
    const state = { fruit: null, collected: false };
    let visiting = false, position, width;

    function setMaze(maze, { origin } = {}) {
      if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) {
        throw new TypeError('A cherry needs a player origin.');
      }
      const navigation = navigationModule.create(maze, tile);
      position = behindHouse(maze, tile, navigation, origin);
      width = navigation.width;
      state.fruit = visiting && !state.collected && position ? { ...position } : null;
    }

    function update(world) {
      if (!(world?.mix > 0)) {
        visiting = false;
        state.fruit = null;
        state.collected = false;
      } else if (!visiting) {
        visiting = true;
        state.fruit = position ? { ...position } : null;
      }
    }

    function collect(player, world) {
      update(world);
      if (!player.alive || !state.fruit) return 0;
      const dx = Math.abs(player.x - state.fruit.x) % width;
      if (Math.hypot(Math.min(dx, width - dx), player.y - state.fruit.y) >= tile * 0.65) return 0;
      state.fruit = null;
      state.collected = true;
      return points;
    }

    setMaze(maze, { origin });
    return { state, setMaze, update, collect, get position() { return position ? { ...position } : null; } };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CherryBonus;
