const GhostProfiles = require('../../scripts/ghosts/profiles');

const tile = 16;
function arena(size = 19) {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) =>
    row === 0 || col === 0 || row === size - 1 || col === size - 1 ? 0 : 1));
}

function corridor(length = 31) {
  return Array.from({ length: 7 }, (_, row) => Array.from({ length }, (_, col) =>
    row === 3 && col > 0 && col < length - 1 ? 1 : 0));
}

function actor(id, col, row, dir = 0) {
  const profile = GhostProfiles.all.find(profile => profile.id === id);
  return { id, color: profile.index, x: (col + 0.5) * tile, y: (row + 0.5) * tile,
    dir, mode: 'chase', scared: false, reversePending: false, target: null };
}

function player(col, row, dir = 0) {
  return { x: (col + 0.5) * tile, y: (row + 0.5) * tile, dir };
}

module.exports = { arena, corridor, actor, player, tile };
