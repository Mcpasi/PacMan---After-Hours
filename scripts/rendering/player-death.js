const PlayerDeathArtwork = (() => {
  const artwork = typeof module !== 'undefined' && module.exports ? require('./player') : PlayerArtwork;

  function draw(ctx, effect, { tile, reducedMotion = false, lampAt }) {
    if (!effect || effect.age >= effect.duration) return;
    const progress = Math.max(0, effect.age / effect.duration);
    // Reduced motion shows a stationary cracked silhouette, fading without flight or spin.
    const travel = reducedMotion ? 0.08 : 1 - Math.exp(-3 * progress);
    const fall = reducedMotion ? 0 : progress * progress * 1.4;
    const heading = effect.dir * Math.PI / 2;
    const lamp = lampAt?.(effect.x, effect.y);
    ctx.save(); ctx.translate(effect.x, effect.y); ctx.scale(tile, tile);
    ctx.globalAlpha = Math.min(1, (1 - progress) * 3);
    for (const fragment of effect.fragments) {
      const spin = reducedMotion ? 0 : fragment.spin * progress;
      ctx.save();
      ctx.translate(fragment.vx * travel, fragment.vy * travel + fall);
      ctx.rotate(heading);
      ctx.translate(fragment.cx, fragment.cy);
      ctx.rotate(spin);
      ctx.translate(-fragment.cx, -fragment.cy);
      artwork.drawShell(ctx, fragment.start, fragment.end, { rotation: heading + spin, lamp });
      ctx.restore();
    }
    ctx.restore();
  }

  return { draw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlayerDeathArtwork;
