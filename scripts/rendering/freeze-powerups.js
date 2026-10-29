// Shared foreground skins: gameplay owns the finds; worlds only change their artwork.
const FreezePowerUpArtwork = (() => {
  const circle = Math.PI * 2;

  function snowflake(ctx, radius) {
    ctx.beginPath();
    for (let arm = 0; arm < 6; arm++) {
      const angle = arm * circle / 6, x = Math.cos(angle), y = Math.sin(angle);
      ctx.moveTo(0, 0); ctx.lineTo(x * radius, y * radius);
      for (const side of [-1, 1]) {
        ctx.moveTo(x * radius * 0.6, y * radius * 0.6);
        ctx.lineTo(x * radius * 0.4 - y * radius * 0.22 * side, y * radius * 0.4 + x * radius * 0.22 * side);
      }
    }
    ctx.stroke();
  }

  function cityPickup(ctx, kind, tile) {
    // Worn brass fittings and cold glass echo Old Town's gas lamps and metalwork.
    const brass = ctx.createLinearGradient(-0.4, -0.5, 0.4, 0.5);
    brass.addColorStop(0, '#e0c58c'); brass.addColorStop(0.45, '#967344'); brass.addColorStop(1, '#464c43');
    ctx.fillStyle = '#183b46'; ctx.strokeStyle = brass; ctx.lineWidth = 0.07; ctx.lineJoin = 'round';
    ctx.shadowColor = '#8bd5df'; ctx.shadowBlur = tile * 0.3;
    if (kind === 'lantern') {
      ctx.beginPath(); ctx.moveTo(-0.3, -0.3); ctx.lineTo(0.3, -0.3);
      ctx.lineTo(0.25, 0.35); ctx.lineTo(-0.25, 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = brass;
      ctx.beginPath(); ctx.moveTo(-0.38, -0.31); ctx.lineTo(0, -0.52); ctx.lineTo(0.38, -0.31); ctx.closePath(); ctx.fill();
      ctx.fillRect(-0.32, 0.35, 0.64, 0.08);
      ctx.beginPath(); ctx.arc(0, -0.59, 0.1, 0, circle); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, circle); ctx.fill(); ctx.stroke();
      ctx.fillStyle = brass; ctx.fillRect(-0.1, -0.56, 0.2, 0.12);
      ctx.beginPath(); ctx.arc(0, -0.65, 0.11, 0, circle); ctx.stroke();
      ctx.strokeStyle = '#e0c58c'; ctx.lineWidth = 0.025;
      for (let mark = 0; mark < 12; mark++) {
        const angle = mark * circle / 12;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 0.32, Math.sin(angle) * 0.32);
        ctx.lineTo(Math.cos(angle) * 0.36, Math.sin(angle) * 0.36); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, -0.26); ctx.lineTo(0, 0); ctx.lineTo(0.21, 0.1); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.strokeStyle = '#c9f5f2'; ctx.lineWidth = 0.035;
    snowflake(ctx, kind === 'lantern' ? 0.22 : 0.17);
    ctx.strokeStyle = 'rgba(218, 255, 250, 0.65)'; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(-0.2, -0.18); ctx.lineTo(-0.15, 0.2); ctx.stroke();
  }

  function retroPickup(ctx, kind) {
    // Compact pixel silhouettes remain distinct from pellets and the life coin.
    ctx.fillStyle = '#00ffff';
    if (kind === 'lantern') {
      ctx.fillRect(-0.3, -0.3, 0.6, 0.7); ctx.fillRect(-0.4, -0.4, 0.8, 0.1);
      ctx.fillRect(-0.2, -0.5, 0.4, 0.1); ctx.fillRect(-0.1, -0.6, 0.2, 0.1);
      ctx.fillRect(-0.4, 0.4, 0.8, 0.1);
    } else {
      ctx.fillRect(-0.4, -0.2, 0.8, 0.5); ctx.fillRect(-0.3, -0.3, 0.6, 0.7);
      ctx.fillRect(-0.2, -0.4, 0.4, 0.1); ctx.fillRect(-0.1, -0.6, 0.2, 0.2);
    }
    ctx.fillStyle = '#102c57'; ctx.fillRect(-0.2, -0.2, 0.4, 0.5);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-0.15, 0, 0.3, 0.1); ctx.fillRect(-0.05, -0.1, 0.1, 0.3);
  }

  function drawPickups(ctx, state, { tile, time = 0, reducedMotion = false, world = 'city' }) {
    for (const pickup of state?.pickups || []) {
      ctx.save(); ctx.translate(pickup.x, pickup.y); ctx.scale(tile, tile);
      if (world === 'retro') retroPickup(ctx, pickup.kind);
      else {
        ctx.fillStyle = 'rgba(122, 204, 213, 0.18)';
        ctx.beginPath(); ctx.ellipse(0, 0.4, 0.48, 0.1, 0, 0, circle); ctx.fill();
        ctx.translate(0, reducedMotion ? -0.06 : -0.06 + Math.sin(time * 1.5) * 0.025);
        cityPickup(ctx, pickup.kind, tile);
      }
      ctx.restore();
    }
  }

  function drawFrozenGhosts(ctx, ghosts, { tile, frozen = false, world = 'city' }) {
    if (!frozen) return;
    for (const ghost of ghosts) {
      if (ghost.mode === 'house' && ghost.houseTimer > 30) continue;
      ctx.save(); ctx.translate(ghost.x, ghost.y); ctx.scale(tile, tile);
      ctx.strokeStyle = world === 'retro' ? '#00ffff' : '#b6e9ed'; ctx.lineWidth = 0.045;
      if (world === 'retro') {
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(side * 0.4, -0.65); ctx.lineTo(side * 0.6, -0.65);
          ctx.lineTo(side * 0.6, 0.55); ctx.lineTo(side * 0.4, 0.55); ctx.stroke();
        }
      } else {
        // A translucent frost shell leaves identity, frightened faces and eyes readable.
        ctx.fillStyle = 'rgba(147, 220, 232, 0.12)';
        ctx.beginPath(); ctx.moveTo(0, -0.85); ctx.lineTo(0.58, -0.4); ctx.lineTo(0.55, 0.5);
        ctx.lineTo(0, 0.65); ctx.lineTo(-0.55, 0.5); ctx.lineTo(-0.58, -0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.translate(0.4, -0.6); snowflake(ctx, 0.14); ctx.restore();
    }
  }

  function drawStatus(ctx, state, { tile, width }) {
    if (!state || state.remainingTicks <= 0) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.font = `bold ${tile * 0.55}px monospace`;
    ctx.fillStyle = '#10202a'; ctx.fillRect(width / 2 - tile * 3, 0, tile * 6, tile * 0.9);
    ctx.fillStyle = '#c9f5f2';
    ctx.fillText(`FREEZE ${Math.ceil(state.remainingTicks / state.ticksPerSecond)}s`, width / 2, tile * 0.65);
    ctx.restore();
  }

  return { drawPickups, drawFrozenGhosts, drawStatus };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FreezePowerUpArtwork;
