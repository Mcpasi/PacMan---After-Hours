// Shared identity only; routing and artwork live in their own modules.
const GhostProfiles = (() => {
  const all = Object.freeze([
    { id: 'blinky', name: 'Blinky', color: '#f45162', accent: '#ffbdac', speed: 1.2, order: [3, 2, 1, 0], startDir: 2 },
    { id: 'pinky', name: 'Pinky', color: '#e994da', accent: '#ffe0f4', speed: 1.14, order: [2, 3, 0, 1], startDir: 0 },
    { id: 'inky', name: 'Inky', color: '#55d9d0', accent: '#c3fff3', speed: 1.1, order: [1, 0, 3, 2], startDir: 2 },
    { id: 'clyde', name: 'Clyde', color: '#f5af59', accent: '#ffe7ac', speed: 1.06, order: [0, 1, 2, 3], startDir: 0 }
  ].map((profile, index) => Object.freeze({ ...profile, index, order: Object.freeze(profile.order) })));
  const home = Object.freeze({ col: 13, row: 11 });
  const exit = Object.freeze({ col: 13, row: 8 });

  function get(ghost) {
    return all.find(profile => profile.id === ghost.id) || all[ghost.color] || all[0];
  }

  function create(tile) {
    return all.map(profile => ({
      id: profile.id, color: profile.index, speed: profile.speed,
      x: (profile.index === 2 ? 12.5 : profile.index === 3 ? 15.5 : 13.5) * tile,
      y: (home.row + 0.5) * tile, dir: profile.startDir,
      mode: 'house', houseTimer: profile.index * 60, target: null,
      scared: false, reversePending: false
    }));
  }

  return { all, get, create, home, exit };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GhostProfiles;
