const GhostController = (() => {
  const profiles = typeof module !== 'undefined' && module.exports ? require('./profiles') : GhostProfiles;
  const navigationModule = typeof module !== 'undefined' && module.exports ? require('./navigation') : GhostNavigation;
  const learningModule = typeof module !== 'undefined' && module.exports ? require('./learning') : GhostLearning;
  const ai = typeof module !== 'undefined' && module.exports ? require('./ai') : GhostAI;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]], epsilon = 1e-6;

  function create(maze, tile, { learning = learningModule.create() } = {}) {
    const navigation = navigationModule.create(maze, tile);
    learning.resetObservation();
    const home = navigation.point(profiles.home), exit = navigation.point(profiles.exit);
    const centered = ghost => Math.abs(ghost.x - (Math.floor(ghost.x / tile) + 0.5) * tile) < epsilon &&
      Math.abs(ghost.y - (Math.floor(ghost.y / tile) + 0.5) * tile) < epsilon;

    function nextCenter(ghost) {
      const axis = ghost.dir % 2 === 0 ? 'x' : 'y', sign = dirs[ghost.dir][axis === 'x' ? 0 : 1];
      let value = (Math.floor(ghost[axis] / tile) + 0.5) * tile;
      if ((value - ghost[axis]) * sign < epsilon) value += sign * tile;
      return { axis, sign, value };
    }

    function update(ghosts, player, powerMode, { frozen = false } = {}) {
      // One fixed 60 Hz simulation tick; rendering may run at a different rate.
      learning.observe(player, navigation, powerMode);
      // Suspend locomotion, releases and routing without replacing actors or
      // clearing observations: learned routes remain useful after thawing.
      if (frozen) return;
      let targets;
      const reservations = ghosts.filter(ghost => ghost.mode === 'chase' && !centered(ghost)).map(ghost => {
        const next = nextCenter(ghost);
        return { ghost, cell: navigation.cellAt({ ...ghost, [next.axis]: next.value }) };
      }).filter(route => route.cell);
      const ordered = ghosts.slice().sort((a, b) => profiles.get(a).index - profiles.get(b).index);
      for (const ghost of ordered) {
        if (ghost.mode === 'house') {
          if (--ghost.houseTimer <= 0) {
            Object.assign(ghost, exit, { mode: 'chase', scared: powerMode, reversePending: false, target: null,
              dir: profiles.get(ghost).startDir });
          }
          continue;
        }
        let remaining = ghost.mode === 'eyes' ? 2.4 : ghost.scared ? 0.9 : (ghost.speed ?? profiles.get(ghost).speed);
        while (remaining > epsilon) {
          if (centered(ghost)) {
            const cell = navigation.cellAt(ghost);
            Object.assign(ghost, navigation.point(cell));
            if (ghost.mode === 'eyes' && cell.col === profiles.home.col && cell.row === profiles.home.row) {
              Object.assign(ghost, home, { mode: 'house', houseTimer: 60, scared: false, reversePending: false, target: null });
              break;
            }
            let target;
            if (ghost.mode === 'eyes') target = profiles.home;
            else if (ghost.scared) target = navigation.nearest(player, cell);
            else {
              targets ||= ai.plan(ghosts, player, navigation, learning, powerMode);
              target = targets.get(ghost);
            }
            ghost.target = target ? navigation.point(target) : null;
            const direction = ai.chooseDirection(ghost, { navigation, player, target, reservations });
            ghost.reversePending = false;
            if (direction === null) break;
            ghost.dir = direction;
            const next = navigation.neighbors(cell, ghost.mode === 'eyes').find(option => option.dir === direction);
            reservations.push({ ghost, cell: next });
          }
          const { axis, sign, value } = nextCenter(ghost);
          const distance = Math.abs(value - ghost[axis]), step = Math.min(remaining, distance);
          ghost[axis] = step === distance ? value : ghost[axis] + sign * step;
          remaining -= step;
          if (ghost.x < -tile / 2) ghost.x += navigation.width;
          if (ghost.x > navigation.width - tile / 2) ghost.x -= navigation.width;
        }
      }
    }

    return { update };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GhostController;
