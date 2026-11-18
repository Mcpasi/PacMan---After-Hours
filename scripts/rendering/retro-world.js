// The 1980 skin uses a 16-pixel tile grid, sharing the live gameplay world.
const RetroWorldArtwork = (() => {
  const ghostColors = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'];
  const size = 16;
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
  const fadePattern = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const lifePlus = ['000', '010', '111', '010', '000'];
  const lifeLetters = ['010,110,010,010,111', '', '100,100,100,100,111',
    '111,010,010,010,111', '111,100,110,100,100', '111,100,110,100,111'];
  const lifeRows = lifePlus.map((row, y) => row + '0' +
    lifeLetters.map(letter => letter ? letter.split(',')[y] : '000').join('0'));

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

  function drawCollectibles(ctx, maze, { tile, collectibles }) {
    ctx.save();
    for (const { row, col } of collectibles) {
      const value = maze[row][col];
      const x = (col + 0.5) * tile, y = (row + 0.5) * tile;
      if (value === 4) {
        ctx.fillStyle = '#ffb8ff';
        ctx.fillRect(col * tile, row * tile + tile * 6 / size, tile, tile * 2 / size);
      } else if (value === 2) {
        ctx.fillStyle = '#ffb8ae';
        ctx.fillRect(x - tile / 8, y - tile / 8, tile / 4, tile / 4);
      } else if (value === 3) {
        ctx.fillStyle = '#ffb8ae';
        ctx.save(); ctx.translate(x, y); ctx.scale(tile / size, tile / size);
        bitmap(ctx, pellet, -4, -4);
        ctx.fillStyle = '#fff4ad';
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function player(ctx, actor, { tile }) {
    if (!actor.alive) return;
    // Headings are pre-rotated bitmaps, never filtered Canvas transforms.
    const rows = playerFrames[actor.mouth > 0.35 ? 2 : actor.mouth > 0.1 ? 1 : 0][actor.dir];
    spriteContext(ctx, actor, tile);
    ctx.fillStyle = '#ffff00';
    bitmap(ctx, rows); ctx.restore();
  }

  function death(ctx, effect, { tile, reducedMotion = false }) {
    if (!effect || effect.age >= effect.duration) return;
    const progress = Math.max(0, effect.age / effect.duration);
    const travel = reducedMotion ? 0.08 : 1 - Math.exp(-3 * progress);
    const fall = reducedMotion ? 0 : progress * progress * 1.4;
    const opacity = Math.min(1, (1 - progress) * 3);
    const start = effect.fragments[0].start;
    const mouth = (start - 0.2) / 0.6;
    const rows = playerFrames[mouth > 0.35 ? 2 : mouth > 0.1 ? 1 : 0][0];
    const heading = effect.dir * Math.PI / 2, cos = Math.cos(heading), sin = Math.sin(heading);
    spriteContext(ctx, effect, tile);
    ctx.fillStyle = '#ffff00';
    rows.forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell !== '1' || fadePattern[(y % 4) * 4 + x % 4] >= opacity * 16) return;
      const px = (x - 7.5) / size, py = (y - 7.5) / size;
      const angle = (Math.atan2(py, px) + Math.PI * 2) % (Math.PI * 2);
      const fragment = effect.fragments.find(piece => angle < piece.end) || effect.fragments.at(-1);
      const spin = reducedMotion ? 0 : fragment.spin * progress;
      const dx = px - fragment.cx, dy = py - fragment.cy;
      const rx = fragment.cx + dx * Math.cos(spin) - dy * Math.sin(spin);
      const ry = fragment.cy + dx * Math.sin(spin) + dy * Math.cos(spin);
      ctx.fillRect(Math.round((rx * cos - ry * sin + fragment.vx * travel) * size - 0.5),
        Math.round((rx * sin + ry * cos + fragment.vy * travel + fall) * size - 0.5), 1, 1);
    }));
    ctx.restore();
  }

  function lifeEffect(ctx, effect, { tile, reducedMotion = false }) {
    if (!effect || effect.age >= effect.duration) return;
    const progress = Math.max(0, effect.age / effect.duration);
    const opacity = Math.min(1, (1 - progress) * 4);
    spriteContext(ctx, effect, tile);
    if (!reducedMotion && progress < 0.4) {
      const radius = Math.round(size * (0.7 + progress * 3));
      ctx.fillStyle = '#ffb852';
      for (let y = -radius; y < radius; y++) for (let x = -radius; x < radius; x++) {
        const distance = (x + 0.5) ** 2 + (y + 0.5) ** 2;
        if (distance <= radius ** 2 && distance >= (radius - 1) ** 2) ctx.fillRect(x, y, 1, 1);
      }
    }
    const top = Math.max(2 - Math.round(effect.y / (tile / size)),
      -Math.round(size * (0.85 + (reducedMotion ? 0 : progress * 0.6))) - 5);
    const left = -Math.floor(lifeRows[0].length / 2);
    // Pixel lettering and a fixed dither keep late fades inside the arcade palette.
    for (const outline of [true, false]) {
      ctx.fillStyle = outline ? '#000000' : '#ffff00';
      lifeRows.forEach((row, y) => [...row].forEach((cell, x) => {
        if (cell !== '1' || fadePattern[(y % 4) * 4 + x % 4] >= opacity * 16) return;
        ctx.fillRect(left + x - (outline ? 1 : 0), top + y - (outline ? 1 : 0),
          outline ? 3 : 1, outline ? 3 : 1);
      }));
    }
    ctx.restore();
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

  return { drawCollectibles, player, ghosts, death, lifeEffect };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RetroWorldArtwork;
