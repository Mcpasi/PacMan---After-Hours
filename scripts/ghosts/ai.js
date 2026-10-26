const GhostAI = (() => {
  const profiles = typeof module !== 'undefined' && module.exports ? require('./profiles') : GhostProfiles;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function flankSide(player, ghosts) {
    const [dx, dy] = dirs[player.dir];
    const hunter = ghosts.find(ghost => profiles.get(ghost).id === 'blinky' && ghost.mode === 'chase' && !ghost.scared);
    // Inky takes the side opposite Blinky; Clyde covers the other rear quarter.
    return hunter && (hunter.x - player.x) * -dy + (hunter.y - player.y) * dx > 0 ? -1 : 1;
  }

  function desiredTarget(ghost, player, ghosts, tile) {
    const [dx, dy] = dirs[player.dir], side = flankSide(player, ghosts);
    let ahead = 0, across = 0;
    switch (profiles.get(ghost).id) {
      case 'pinky': ahead = 4; break; // Intercept the street ahead.
      case 'inky': ahead = 1; across = side * 4; break; // Close a lateral escape route.
      case 'clyde':
        ahead = Math.hypot(ghost.x - player.x, ghost.y - player.y) < tile * 5 ? -4 : -2;
        across = -side * 2; // Sweep behind rather than joining the direct chase.
        break;
    }
    return { x: player.x + (dx * ahead - dy * across) * tile,
      y: player.y + (dy * ahead + dx * across) * tile };
  }

  function plan(ghosts, player, navigation) {
    const targets = new Map(), reserved = [];
    const active = ghosts.filter(ghost => ghost.mode === 'chase' && !ghost.scared)
      .sort((a, b) => profiles.get(a).index - profiles.get(b).index);
    for (const ghost of active) {
      const target = navigation.nearest(desiredTarget(ghost, player, ghosts, navigation.tile),
        navigation.cellAt(ghost), { reserved });
      if (target) { targets.set(ghost, target); reserved.push(target); }
    }
    return targets;
  }

  function chooseDirection(ghost, { navigation, player, target, reservations = [] }) {
    const eyes = ghost.mode === 'eyes', profile = profiles.get(ghost);
    const cell = navigation.cellAt(ghost), reverse = (ghost.dir + 2) % 4;
    let options = navigation.neighbors(cell, eyes);
    if (!options.length || !target) return null;
    if (ghost.reversePending && ghost.scared && options.some(next => next.dir === reverse)) return reverse;
    // Turn only at centers; reverse only when fleeing initially, returning home or in a dead end.
    if (!eyes && options.some(next => next.dir !== reverse)) options = options.filter(next => next.dir !== reverse);
    const playerCell = navigation.cellAt(player);
    let best = null, bestScore = Infinity;
    for (const next of options) {
      let score = navigation.distance(next, target, eyes);
      if (!Number.isFinite(score)) continue;
      if (ghost.scared) score = -score;
      else if (!eyes && next.col === playerCell?.col && next.row === playerCell?.row) score = -100;
      if (!eyes) score += reservations.filter(route => route.ghost !== ghost && route.cell.col === next.col && route.cell.row === next.row).length * 3;
      if (score < bestScore || (score === bestScore && profile.order.indexOf(next.dir) < profile.order.indexOf(best))) {
        best = next.dir; bestScore = score;
      }
    }
    return best;
  }

  return { desiredTarget, plan, chooseDirection };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GhostAI;
