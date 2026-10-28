// Online route learning: one bounded set of decaying turn counts per cell/context.
const GhostLearning = (() => {
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const decay = 0.8, minimumEvidence = 2.4, minimumConfidence = 0.7, horizon = 6;
  const sameCell = (a, b) => a && b && a.col === b.col && a.row === b.row;
  const key = (cell, incoming, powered) => `${cell.col},${cell.row}:${incoming}:${powered ? 1 : 0}`;

  function create() {
    const turns = new Map();
    let previous = null;

    function resetObservation() { previous = null; }

    function playerCell(player, navigation) {
      if (player.alive === false || !Number.isFinite(player.x) || !Number.isFinite(player.y) || !dirs[player.dir]) return null;
      const cell = navigation.cellAt(player);
      return navigation.neighbors(cell).length ? cell : null;
    }

    function observe(player, navigation, powered = false) {
      const cell = playerCell(player, navigation);
      if (!cell) { resetObservation(); return; }
      if (sameCell(previous?.cell, cell)) {
        previous.powered = powered;
        return; // Waiting and extra simulation/render ticks are not extra choices.
      }
      const edge = previous && navigation.neighbors(previous.cell).find(next => sameCell(next, cell) && next.dir === player.dir);
      if (edge && previous.incoming !== null && previous.powered === powered) {
        const context = key(previous.cell, previous.incoming, powered);
        const counts = turns.get(context) || [0, 0, 0, 0];
        for (let dir = 0; dir < counts.length; dir++) counts[dir] *= decay;
        counts[edge.dir]++;
        turns.set(context, counts);
      }
      // Non-neighbor jumps (including respawns) must never become learned paths.
      previous = { cell, incoming: edge ? edge.dir : null, powered };
    }

    function preferred(cell, incoming, powered, options) {
      const counts = turns.get(key(cell, incoming, powered));
      if (!counts) return null;
      const total = counts.reduce((sum, count) => sum + count, 0);
      let best = null;
      for (const next of options) {
        if (!best || counts[next.dir] > counts[best.dir]) best = next;
      }
      return best && counts[best.dir] >= minimumEvidence && counts[best.dir] / total >= minimumConfidence ? best : null;
    }

    function predict(player, navigation, powered = false) {
      let cell = playerCell(player, navigation);
      if (!cell) return [];
      let incoming = sameCell(previous?.cell, cell) ? previous.incoming ?? player.dir : player.dir;
      let learned = false;
      const path = [], visited = new Set();
      for (let step = 0; step < horizon; step++) {
        const context = key(cell, incoming, powered);
        if (visited.has(context)) break;
        visited.add(context);
        const options = navigation.neighbors(cell), choice = preferred(cell, incoming, powered, options);
        let next = choice;
        if (step === 0) {
          const center = navigation.point(cell), [dx, dy] = dirs[player.dir];
          // Once past a center, respect the actual turn instead of an old habit.
          const committed = incoming !== player.dir || (player.x - center.x) * dx + (player.y - center.y) * dy > 1e-6;
          if (committed) next = options.find(option => option.dir === player.dir);
        }
        if (!next) {
          const forward = options.filter(option => option.dir !== (incoming + 2) % 4);
          // Continue through forced corridors, but never invent a choice at an unknown junction.
          if (forward.length === 1) next = forward[0];
          else if (options.length === 1) next = options[0];
          else break;
        }
        learned ||= next === choice;
        path.push({ col: next.col, row: next.row });
        cell = next;
        incoming = next.dir;
      }
      return learned ? path : [];
    }

    return { observe, predict, resetObservation };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GhostLearning;
