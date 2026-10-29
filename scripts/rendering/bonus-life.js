// Shared overlay artwork for both the Canvas city and the Three.js environment.
const BonusLifeArtwork = (() => {
  const circle = Math.PI * 2;

  function emblem(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.arc(x, y, 0.235, 0.48, circle - 0.48); ctx.closePath(); ctx.fill();
  }

  function retroCoin(ctx, coin, tile, time, reducedMotion) {
    const pixel = tile / 16;
    const turn = reducedMotion ? 1 : [1, 0.75, 0.25, 0.75][Math.floor(time * 4) % 4];
    ctx.save();
    ctx.translate(Math.round(coin.x / pixel) * pixel, Math.round(coin.y / pixel) * pixel);
    ctx.scale(pixel, pixel);
    for (let y = -6; y < 6; y++) for (let x = -7; x < 7; x++) {
      const dx = (x + 0.5) / turn, dy = y + 0.5, radius = dx * dx + dy * dy;
      if (radius > 36) continue;
      ctx.fillStyle = radius > 24 ? '#ffb852' : '#ffff00';
      // A small, dark Pac-Man stamp distinguishes the life coin from power pellets.
      if (radius < 9 && !(dx > 0 && Math.abs(dy) < dx)) ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  function drawCoin(ctx, coin, { tile, time = 0, reducedMotion = false, world = 'city' }) {
    if (!coin) return;
    if (world === 'retro') { retroCoin(ctx, coin, tile, time, reducedMotion); return; }
    const phase = reducedMotion ? 0 : time * 0.8;
    const turn = Math.max(0.14, Math.abs(Math.cos(phase)));
    const hover = reducedMotion ? 0 : Math.sin(time * 1.3) * 0.035;
    ctx.save(); ctx.translate(coin.x, coin.y); ctx.scale(tile, tile);

    // A flattened amber reflection stays on the wet asphalt, below the coin.
    ctx.save(); ctx.translate(0, 0.3); ctx.scale(1, 0.24);
    const reflection = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.75);
    reflection.addColorStop(0, 'rgba(235, 174, 72, 0.3)');
    reflection.addColorStop(1, 'rgba(235, 174, 72, 0)');
    ctx.fillStyle = reflection;
    ctx.beginPath(); ctx.arc(0, 0, 0.75, 0, circle); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(238, 186, 92, 0.22)'; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(-0.25, 0.3); ctx.lineTo(0.17, 0.3);
    ctx.moveTo(-0.12, 0.37); ctx.lineTo(0.24, 0.37); ctx.stroke();

    const glow = ctx.createRadialGradient(0, -0.15, 0.12, 0, -0.15, 0.95);
    glow.addColorStop(0, 'rgba(230, 161, 53, 0.18)');
    glow.addColorStop(1, 'rgba(230, 161, 53, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, -0.15, 0.95, 0, circle); ctx.fill();

    ctx.translate(0, -0.18 + hover);
    ctx.fillStyle = '#63451f';
    ctx.beginPath(); ctx.ellipse(Math.sin(phase) * 0.055, 0, 0.43 * turn + 0.035, 0.44, 0, 0, circle); ctx.fill();
    ctx.scale(turn, 1);
    const brass = ctx.createLinearGradient(-0.32, -0.42, 0.34, 0.42);
    brass.addColorStop(0, '#f1d18a'); brass.addColorStop(0.32, '#bd9144');
    brass.addColorStop(0.7, '#89602c'); brass.addColorStop(1, '#4c432d');
    ctx.fillStyle = brass; ctx.strokeStyle = '#dcb86c'; ctx.lineWidth = 0.035;
    ctx.shadowColor = '#ce913e'; ctx.shadowBlur = tile * 0.2;
    ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, circle); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#775327'; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.arc(0, 0, 0.32, 0, circle); ctx.stroke();
    ctx.strokeStyle = 'rgba(250, 218, 145, 0.55)'; ctx.lineWidth = 0.018;
    for (let i = 0; i < 16; i++) {
      const angle = i * circle / 16;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 0.365, Math.sin(angle) * 0.365);
      ctx.lineTo(Math.cos(angle) * 0.39, Math.sin(angle) * 0.39); ctx.stroke();
    }
    // Offset relief gives the dark Pac-Man stamp a worn, engraved lower edge.
    emblem(ctx, 0.008, 0.018, '#e4bb69');
    emblem(ctx, 0, 0, '#634620');
    ctx.strokeStyle = 'rgba(50, 48, 31, 0.5)'; ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.moveTo(-0.29, -0.2); ctx.lineTo(-0.22, -0.26);
    ctx.moveTo(0.22, 0.25); ctx.lineTo(0.3, 0.19); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 236, 180, 0.7)'; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.arc(-0.008, -0.012, 0.385, Math.PI * 1.08, Math.PI * 1.5); ctx.stroke();
    ctx.restore();
  }

  function drawEffect(ctx, effect, { tile, reducedMotion = false }) {
    if (!effect || effect.age >= effect.duration) return;
    const progress = Math.max(0, effect.age / effect.duration);
    ctx.save(); ctx.translate(effect.x, effect.y);
    // One soft gold impulse, never a repeating flash. Reduced motion keeps only
    // the stationary, fading label instead of an expanding light or rising text.
    if (!reducedMotion && progress < 0.4) {
      const radius = tile * (0.7 + progress * 3);
      const pulse = 1 - progress / 0.4;
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      glow.addColorStop(0, `rgba(255, 219, 136, ${pulse * 0.32})`);
      glow.addColorStop(1, 'rgba(255, 195, 82, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, circle); ctx.fill();
      ctx.strokeStyle = `rgba(255, 212, 117, ${pulse * 0.65})`; ctx.lineWidth = tile * 0.06;
      ctx.beginPath(); ctx.arc(0, 0, radius * 0.75, 0, circle); ctx.stroke();
    }
    ctx.globalAlpha = Math.min(1, (1 - progress) * 4);
    ctx.font = `bold ${tile * 0.55}px monospace`; ctx.textAlign = 'center';
    ctx.lineWidth = tile * 0.12; ctx.lineJoin = 'round';
    const y = -tile * (0.85 + (reducedMotion ? 0 : progress * 0.6));
    ctx.strokeStyle = '#182026'; ctx.strokeText('+1 LIFE', 0, y);
    ctx.fillStyle = '#ffe0a0'; ctx.shadowColor = '#d69b45'; ctx.shadowBlur = tile * 0.15;
    ctx.fillText('+1 LIFE', 0, y);
    ctx.restore();
  }

  return { drawCoin, drawEffect };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BonusLifeArtwork;
