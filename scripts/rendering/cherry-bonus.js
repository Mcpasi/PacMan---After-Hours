// Pixel artwork belongs only to the opaque 1980 scene, never the modern city.
const CherryBonusArtwork = (() => {
  const sprite = [
    '................',
    '..........ss....',
    '.........s.s....',
    '........s..s....',
    '.......s...s....',
    '......s....s....',
    '.....s.....s....',
    '...rrrr...rrr...',
    '..rrwrrr.rrwrr..',
    '..rwwrrr.rwwrr..',
    '..rrrrrr.rrrrr..',
    '...rrrr..rrrrr..',
    '..........rrr...',
    '................',
    '................',
    '................'
  ];
  const palette = { r: '#ff0000', s: '#ffb852', w: '#ffffff' };

  function draw(ctx, fruit, { tile, world }) {
    if (!fruit || world !== 'retro') return;
    const pixel = tile / 16;
    ctx.save();
    ctx.translate(Math.round(fruit.x / pixel) * pixel, Math.round(fruit.y / pixel) * pixel);
    ctx.scale(pixel, pixel);
    for (const [symbol, color] of Object.entries(palette)) {
      ctx.fillStyle = color;
      sprite.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === symbol) ctx.fillRect(x - 8, y - 8, 1, 1);
        }
      });
    }
    ctx.restore();
  }

  return { draw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CherryBonusArtwork;
