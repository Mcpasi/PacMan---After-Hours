// Corrupted sign fragments in Old Town's brass, verdigris and faded brick palette.
const Level256GlitchArtwork = (() => {
  const palette = ['#c99558', '#78aaa5', '#c07867', '#d4c8a2', '#527c8b'];
  const glyphs = ['┐', '└', '╬', '▒', '░', '⌐', '≡', '↑', '<', '?', '/', '0', '5', '6', '2', '8'];

  function noise(index, seed) {
    let value = Math.imul(index + 17, 374761393) ^ seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }

  function createPattern(layout, seed) {
    const { width, height, tile } = layout;
    const patchWidth = Math.min(tile * 6, width * 0.3);
    const patchHeight = Math.min(tile * 4, height * 0.22);
    const street = layout.streets[Math.floor(noise(1, seed) * layout.streets.length)];
    const cx = street ? (street.col + 0.5) * tile : width / 2;
    const cy = street ? (street.row + 0.5) * tile : height / 2;
    const x = Math.max(0, Math.min(width - patchWidth, cx - patchWidth / 2));
    const y = Math.max(0, Math.min(height - patchHeight, cy - patchHeight / 2));
    const leftWidth = Math.min(tile * 5, width * 0.21);

    function cells(left, top, w, h, jagged, salt) {
      const step = Math.min(tile * 0.68, w / 3, h / 3);
      const columns = Math.floor(w / step), rows = Math.floor(h / step);
      const result = [];
      for (let row = 0; row < rows; row++) {
        const end = jagged ? Math.max(1, columns - Math.floor(noise(row + salt, seed) * 3)) : columns;
        for (let col = 0; col < end; col++) {
          const index = row * columns + col;
          const n = noise(index + salt, seed);
          if (n < 0.14 && index !== 5 && index !== 27) continue;
          result.push({ x: left + col * step, y: top + row * step, size: step,
            kind: index === 5 || index === 27 ? 'fruit' : n > 0.84 ? 'block' : 'glyph',
            value: glyphs[Math.floor(noise(index + salt + 201, seed) * glyphs.length)],
            variant: index === 5 ? 0 : 1, color: palette[Math.floor(n * palette.length)] });
        }
      }
      return result;
    }

    const cluster = cells(x, y, patchWidth, patchHeight, false, 30);
    // Overflow digits and pixel fruit make the arcade reference recognizable.
    cluster.push({ kind: 'glyph', value: '256', x, y, size: Math.min(tile, patchHeight),
      width: Math.min(tile * 2, patchWidth), color: palette[0] });
    const symbols = cells(0, height * 0.12, leftWidth, height * 0.76, true, 900);
    const lamps = Array.from({ length: layout.lamps.length }, (_, index) => index)
      .sort((a, b) => noise(a + 500, seed) - noise(b + 500, seed)).slice(0, 3);
    return { cluster, symbols, lamps };
  }

  function create(layout) {
    let pattern, previousSeed;

    function frame(effect, { reducedMotion = false } = {}) {
      if (!effect || effect.age >= effect.duration) return null;
      if (!pattern || previousSeed !== effect.seed) {
        pattern = createPattern(layout, effect.seed);
        previousSeed = effect.seed;
      }
      const seconds = effect.age / effect.ticksPerSecond;
      if (effect.phase === 'lamps') {
        const lampLevels = layout.lamps.map(() => 1);
        pattern.lamps.forEach((lamp, index) => {
          const local = Math.max(0, seconds - index * 0.24);
          const envelope = Math.max(0, Math.min(1, local / 0.25,
            (effect.duration - effect.age) / effect.ticksPerSecond / 0.3));
          // Individual, staggered dips below 2 Hz; never a full-screen flash.
          const dip = (1 - Math.cos(local * Math.PI * 2 * 1.7)) / 2;
          lampLevels[lamp] = reducedMotion ? 0.72 : 1 - 0.72 * envelope * dip;
        });
        return { lampLevels };
      }
      const fade = Math.min(1, seconds / 0.08,
        (effect.duration - effect.age) / effect.ticksPerSecond / 0.18);
      return { cells: pattern[effect.phase], opacity: Math.max(0, fade) * (reducedMotion ? 0.58 : 0.8) };
    }

    function draw(ctx, visual) {
      if (!visual?.cells || visual.opacity <= 0) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, layout.width, layout.height); ctx.clip();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const cell of visual.cells) {
        const { x, y, size, color } = cell;
        ctx.globalAlpha = visual.opacity * 0.4;
        ctx.fillStyle = '#0b1820'; ctx.fillRect(x, y, cell.width || size, size);
        ctx.globalAlpha = visual.opacity; ctx.fillStyle = color;
        if (cell.kind === 'fruit') drawFruit(ctx, cell);
        else if (cell.kind === 'block') {
          const pixel = size / 4;
          for (let row = 0; row < 4; row++) {
            ctx.fillRect(x + (row % 2) * pixel, y + row * pixel, pixel, pixel);
            ctx.fillRect(x + (2 + row % 2) * pixel, y + row * pixel, pixel, pixel);
          }
        } else {
          ctx.font = `bold ${size * 0.86}px monospace`;
          ctx.fillText(cell.value, x, y, cell.width || size);
        }
      }
      ctx.restore();
    }

    return { frame, draw };
  }

  function drawFruit(ctx, { x, y, size, variant }) {
    const pixel = size / 8;
    ctx.fillStyle = variant ? '#c99558' : '#c07867';
    // Pixel cherries/orange, not emoji or real collectible objects.
    const rows = variant ? ['00011000', '00111100', '01111110', '01111110', '00111100'] :
      ['00000000', '01100110', '11101110', '11101110', '01000100'];
    rows.forEach((row, r) => [...row].forEach((bit, c) => {
      if (bit === '1') ctx.fillRect(x + c * pixel, y + (r + 2) * pixel, pixel, pixel);
    }));
    ctx.fillStyle = '#78aaa5';
    ctx.fillRect(x + 3 * pixel, y + pixel, pixel * 3, pixel);
    ctx.fillRect(x + 2 * pixel, y + 2 * pixel, pixel, pixel * 2);
  }

  return { create, createPattern };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Level256GlitchArtwork;
