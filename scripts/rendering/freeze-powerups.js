// Shared foreground skins: gameplay owns the finds; worlds only change their artwork.
const FreezePowerUpArtwork = (() => {
  const lighting = typeof module !== 'undefined' && module.exports ? require('./city-lighting') : CityLighting;
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

  function lantern(ctx, brass, glass) {
    ctx.fillStyle = '#34515a';
    ctx.beginPath();
    ctx.moveTo(0.23, -0.3); ctx.lineTo(0.4, -0.23);
    ctx.lineTo(0.34, 0.37); ctx.lineTo(0.21, 0.4);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(-0.35, -0.3); ctx.lineTo(0.23, -0.3);
    ctx.lineTo(0.21, 0.4); ctx.lineTo(-0.29, 0.34);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = brass;
    ctx.beginPath();
    ctx.moveTo(-0.42, -0.31); ctx.lineTo(-0.1, -0.51);
    ctx.lineTo(0.06, -0.51); ctx.lineTo(0.43, -0.25);
    ctx.lineTo(0.24, -0.24);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.36, 0.3); ctx.lineTo(0.23, 0.36);
    ctx.lineTo(0.37, 0.32); ctx.lineTo(0.37, 0.44);
    ctx.lineTo(0.23, 0.49); ctx.lineTo(-0.36, 0.42);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.03, -0.59, 0.095, 0, circle); ctx.stroke();
  }

  function watch(ctx, brass, glass) {
    ctx.fillStyle = brass;
    ctx.fillRect(-0.11, -0.57, 0.22, 0.17);
    ctx.beginPath(); ctx.arc(0, -0.63, 0.1, 0, circle); ctx.stroke();
    ctx.fillStyle = '#49544d';
    ctx.beginPath(); ctx.ellipse(0.045, 0.052, 0.43, 0.417, 0, 0, circle); ctx.fill();
    ctx.fillStyle = brass;
    ctx.beginPath(); ctx.ellipse(0, 0, 0.43, 0.412, 0, 0, circle); ctx.fill();
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.ellipse(0, -0.015, 0.352, 0.338, 0, 0, circle); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#b8e7e7';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    for (let mark = 0; mark < 12; mark++) {
      const angle = mark * circle / 12;
      const x = Math.cos(angle), y = Math.sin(angle);
      ctx.moveTo(x * 0.275, y * 0.275); ctx.lineTo(x * 0.312, y * 0.312);
    }
    ctx.stroke();
    ctx.strokeStyle = '#fff0be';
    ctx.lineWidth = 0.046;
    ctx.beginPath(); ctx.moveTo(0, -0.24); ctx.lineTo(0, 0); ctx.lineTo(0.19, 0.11); ctx.stroke();
  }

  function cityPickup(ctx, kind, tile) {
    const brass = ctx.createLinearGradient(-0.4, -0.5, 0.4, 0.5);
    brass.addColorStop(0, '#e0c58c');
    brass.addColorStop(0.45, '#967344');
    brass.addColorStop(1, '#464c43');
    const glass = ctx.createRadialGradient(-0.18, -0.23, 0.015, 0, 0.04, 0.46);
    glass.addColorStop(0, '#a1eee8');
    glass.addColorStop(0.37, '#3c8c9c');
    glass.addColorStop(1, '#143d50');
    ctx.strokeStyle = brass;
    ctx.lineWidth = 0.055;
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#76deed';
    ctx.shadowBlur = tile * 0.22;
    if (kind === 'lantern') lantern(ctx, brass, glass);
    else watch(ctx, brass, glass);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#c9f5f2';
    ctx.lineWidth = 0.041;
    ctx.translate(kind === 'lantern' ? -0.053 : -0.114, kind === 'lantern' ? 0.025 : 0.112);
    snowflake(ctx, kind === 'lantern' ? 0.21 : 0.107);
  }

  function retroPickup(ctx, kind) {
    // Compact pixel silhouettes remain distinct from pellets and the life coin.
    ctx.fillStyle = '#00ffff';
    if (kind === 'lantern') {
      ctx.fillRect(-5, -5, 10, 11); ctx.fillRect(-6, -6, 12, 1);
      ctx.fillRect(-3, -8, 6, 2); ctx.fillRect(-1, -9, 2, 1);
      ctx.fillRect(-6, 6, 12, 2);
    } else {
      ctx.fillRect(-6, -3, 12, 8); ctx.fillRect(-5, -5, 10, 11);
      ctx.fillRect(-3, -6, 6, 1); ctx.fillRect(-1, -9, 2, 3);
    }
    ctx.fillStyle = '#102c57'; ctx.fillRect(-3, -3, 6, 8);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, 0, 4, 1); ctx.fillRect(-1, -2, 2, 5);
  }

  function retroContext(ctx, actor, tile) {
    const pixel = tile / 16;
    ctx.save();
    ctx.translate(Math.round(actor.x / pixel) * pixel, Math.round(actor.y / pixel) * pixel);
    ctx.scale(pixel, pixel);
  }

  function drawPickups(ctx, state, { tile, time = 0, reducedMotion = false, world = 'city' }) {
    for (const pickup of state?.pickups || []) {
      if (world === 'retro') {
        retroContext(ctx, pickup, tile);
        retroPickup(ctx, pickup.kind);
      } else {
        ctx.save(); ctx.translate(pickup.x, pickup.y); ctx.scale(tile, tile);
        lighting.ground(ctx, 0.43, 0.5, 'rgba(107, 217, 222, 0.36)');
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
      if (world === 'retro') {
        retroContext(ctx, ghost, tile);
        ctx.fillStyle = '#00ffff';
        for (const side of [-1, 1]) {
          const x = side < 0 ? -10 : 7;
          ctx.fillRect(x, -10, 3, 1); ctx.fillRect(side < 0 ? -10 : 9, -10, 1, 19);
          ctx.fillRect(x, 8, 3, 1);
        }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(5, -11, 1, 5); ctx.fillRect(3, -9, 5, 1);
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(ghost.x, ghost.y); ctx.scale(tile, tile);
        ctx.strokeStyle = '#b6e9ed'; ctx.lineWidth = 0.045;
        // Clear across the face, with thicker ice at the edges.
        const ice = ctx.createLinearGradient(-0.58, -0.56, 0.58, 0.5);
        ice.addColorStop(0, 'rgba(176, 242, 250, 0.32)');
        ice.addColorStop(0.38, 'rgba(134, 224, 241, 0.06)');
        ice.addColorStop(0.7, 'rgba(134, 224, 241, 0.06)');
        ice.addColorStop(1, 'rgba(123, 206, 235, 0.38)');
        ctx.fillStyle = ice;
        ctx.beginPath(); ctx.moveTo(0, -0.85); ctx.lineTo(0.58, -0.4); ctx.lineTo(0.55, 0.5);
        ctx.lineTo(0, 0.65); ctx.lineTo(-0.55, 0.5); ctx.lineTo(-0.58, -0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(234, 255, 255, 0.6)';
        ctx.lineWidth = 0.029;
        ctx.beginPath(); ctx.moveTo(-0.43, 0.38); ctx.lineTo(-0.44, -0.33); ctx.lineTo(-0.06, -0.65);
        ctx.moveTo(0.41, 0.02); ctx.lineTo(0.39, 0.4); ctx.lineTo(0.06, 0.53); ctx.stroke();
        ctx.strokeStyle = '#d6fbff';
        ctx.translate(0.4, -0.6); snowflake(ctx, 0.14); ctx.restore();
      }
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
