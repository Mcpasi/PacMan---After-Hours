// The 1980 skin uses a 16-pixel tile grid, sharing the live gameplay world.
const RetroWorldArtwork = (() => {
  const ghostColors = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'];
  const size = 16;
  const wallTiles = new Map();
  const playerFrames = [0, 0.4, 0.9].map(bite => Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const dx = x - 7.5, dy = y - 7.5;
      return dx * dx + dy * dy <= 52 && !(bite && dx > 0 && Math.abs(dy) <= dx * bite) ? '1' : '0';
    }).join(''))).map(frame => [0, 1, 2, 3].map(dir =>
    Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => {
      if (dir === 1) return frame[size - 1 - x][y];
      if (dir === 2) return frame[size - 1 - y][size - 1 - x];
      if (dir === 3) return frame[x][size - 1 - y];
      return frame[y][x];
    }).join(''))));
  const ghostBody = [
    '0000011111100000', '0001111111111000', '0011111111111100', '0111111111111110',
    ...Array(9).fill('0111111111111110')
  ];
  const ghostFrames = ['0111001111001110', '0100111001110010'].map(feet => [...ghostBody, feet, feet]);
  const pellet = ['00111100', '01111110', '11111111', '11111111',
    '11111111', '11111111', '01111110', '00111100'];

  function bitmap(ctx, rows, x = -8, y = -8, pixel = 1) {
    rows.forEach((row, r) => {
      for (let col = 0; col < row.length;) {
        if (row[col] !== '1') { col++; continue; }
        const start = col;
        while (row[col] === '1') col++;
        ctx.fillRect((x + start) * pixel, (y + r) * pixel, (col - start) * pixel, pixel);
      }
    });
  }

  function spriteContext(ctx, actor, tile) {
    const pixel = tile / size;
    ctx.save();
    // Snap artwork only: movement, collisions and tunnel wrapping keep full precision.
    ctx.translate(Math.round(actor.x / pixel) * pixel, Math.round(actor.y / pixel) * pixel);
    ctx.scale(pixel, pixel);
  }

  function wallTile(mask) {
    if (wallTiles.has(mask)) return wallTiles.get(mask);
    const exposed = [];
    let bit = 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (mask & bit) exposed.push([dx, dy]);
      bit <<= 1;
    }
    const rows = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => {
      let distance = size;
      for (const [dx, dy] of exposed) {
        distance = Math.min(distance, Math.max(dx < 0 ? x + 1 : dx > 0 ? size - x : 0,
          dy < 0 ? y + 1 : dy > 0 ? size - y : 0));
      }
      return distance === 1 || distance === 3 ? '1' : '0';
    }).join(''));
    wallTiles.set(mask, rows);
    return rows;
  }

  function paintBackground(ctx, maze, tile) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, maze[0].length * tile, maze.length * tile);
    ctx.fillStyle = '#2121ff';
    const pixel = tile / size;
    maze.forEach((row, r) => row.forEach((cell, c) => {
      if (cell !== 0) return;
      let mask = 0, bit = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (maze[r + dy]?.[c + dx] !== 0) mask |= bit;
        bit <<= 1;
      }
      // Two one-pixel contours with a black gap; adjacent walls have no tile seams.
      bitmap(ctx, wallTile(mask), c * size, r * size, pixel);
    }));
  }

  function create(maze, tile, { createCanvas }) {
    const background = createCanvas();
    background.width = maze[0].length * tile;
    background.height = maze.length * tile;
    paintBackground(background.getContext('2d'), maze, tile);
    return {
      drawMaze(ctx, liveMaze) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(background, 0, 0);
        liveMaze.forEach((row, r) => row.forEach((cell, c) => {
          const x = (c + 0.5) * tile, y = (r + 0.5) * tile;
          if (cell === 4) {
            ctx.fillStyle = '#ffb8ff';
            ctx.fillRect(c * tile, r * tile + tile * 6 / size, tile, tile * 2 / size);
          } else if (cell === 2) {
            ctx.fillStyle = '#ffb8ae';
            ctx.fillRect(x - tile / 16, y - tile / 16, tile / 8, tile / 8);
          } else if (cell === 3) {
            ctx.fillStyle = '#ffb8ae';
            ctx.save(); ctx.translate(x, y); ctx.scale(tile / size, tile / size);
            bitmap(ctx, pellet, -4, -4); ctx.restore();
          }
        }));
        ctx.restore();
      }
    };
  }

  function player(ctx, actor, { tile }) {
    if (!actor.alive) return;
    // Headings are pre-rotated bitmaps, never filtered Canvas transforms.
    const rows = playerFrames[actor.mouth > 0.35 ? 2 : actor.mouth > 0.1 ? 1 : 0][actor.dir];
    spriteContext(ctx, actor, tile);
    ctx.fillStyle = '#ffff00';
    bitmap(ctx, rows); ctx.restore();
  }

  function ghosts(ctx, roster, { tile, dirs, powerTimer = 0, time = 0, reducedMotion = false, frozen = false }) {
    for (const ghost of roster) {
      if (ghost.mode === 'house' && ghost.houseTimer > 30) continue;
      const flash = ghost.scared && !reducedMotion && !frozen && powerTimer < 120 && Math.floor(time * 4) % 2 === 1;
      const eyesOnly = ghost.mode === 'eyes';
      spriteContext(ctx, ghost, tile);
      if (!eyesOnly) {
        ctx.fillStyle = ghost.scared ? (flash ? '#ffffff' : '#2121ff') : ghostColors[ghost.color] || ghostColors[0];
        const step = reducedMotion || frozen ? 0 : Math.floor(time * 8) % 2;
        bitmap(ctx, ghostFrames[step]);
      }
      if (ghost.scared && !eyesOnly) {
        ctx.fillStyle = flash ? '#ff0000' : '#ffb8ae';
        for (const x of [-4, 2]) ctx.fillRect(x, -3, 2, 2);
        for (let tooth = 0; tooth < 8; tooth++) ctx.fillRect(-4 + tooth, 3 + tooth % 2, 1, 1);
      } else {
        const [dx, dy] = dirs[ghost.dir];
        for (const x of [-5, 1]) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, -4, 4, 5); ctx.fillRect(x + 1, -5, 2, 7);
          ctx.fillStyle = '#2121ff';
          ctx.fillRect(x + 1 + dx, -3 + dy, 2, 3);
        }
      }
      ctx.restore();
    }
  }

  return { create, player, ghosts };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RetroWorldArtwork;
