// Brass body segments share the actor overlay in Canvas and Three.js scenes.
const PlayerDeathArtwork = (() => {
  function draw(ctx, effect, { tile, reducedMotion = false }) {
    if (!effect || effect.age >= effect.duration) return;
    const progress = Math.max(0, effect.age / effect.duration);
    // Reduced motion shows a stationary cracked silhouette, fading without flight or spin.
    const travel = reducedMotion ? 0.08 : 1 - Math.exp(-3 * progress);
    const fall = reducedMotion ? 0 : progress * progress * 1.4;
    ctx.save(); ctx.translate(effect.x, effect.y); ctx.scale(tile, tile);
    ctx.globalAlpha = Math.min(1, (1 - progress) * 3);
    for (const fragment of effect.fragments) {
      ctx.save();
      ctx.translate(fragment.vx * travel, fragment.vy * travel + fall);
      ctx.rotate(effect.dir * Math.PI / 2);
      ctx.translate(fragment.cx, fragment.cy);
      ctx.rotate(reducedMotion ? 0 : fragment.spin * progress);
      ctx.translate(-fragment.cx, -fragment.cy);

      const brass = ctx.createLinearGradient(-0.32, -0.42, 0.32, 0.42);
      brass.addColorStop(0, '#f3d58a'); brass.addColorStop(0.28, '#c69848');
      brass.addColorStop(0.62, '#926329'); brass.addColorStop(1, '#354348');
      ctx.fillStyle = brass; ctx.strokeStyle = '#e8bc68'; ctx.lineWidth = 0.025;
      ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, 0.45, fragment.start, fragment.end);
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.clip();
      // Preserve the ember eye on the pieces it actually intersects, never in the bite.
      ctx.fillStyle = '#18252b';
      ctx.beginPath(); ctx.moveTo(-0.045, -0.255); ctx.lineTo(0.225, -0.205);
      ctx.lineTo(0.195, -0.11); ctx.lineTo(-0.025, -0.16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe3a1';
      ctx.beginPath(); ctx.moveTo(0.005, -0.205); ctx.lineTo(0.18, -0.175);
      ctx.lineTo(0.14, -0.145); ctx.lineTo(0.005, -0.17); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  return { draw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlayerDeathArtwork;
