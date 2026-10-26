// Normalized Canvas artwork: silhouettes and expressions never influence collisions.
const GhostArtwork = (() => {
  const profiles = typeof module !== 'undefined' && module.exports ? require('../ghosts/profiles') : GhostProfiles;

  function body(ctx, id, sway) {
    ctx.beginPath();
    if (id === 'blinky') {
      // A low, angular hunter's hood and a sharply cut hem.
      ctx.moveTo(-0.45, 0.35); ctx.lineTo(-0.42, -0.22);
      ctx.quadraticCurveTo(-0.32, -0.62, 0, -0.57);
      ctx.quadraticCurveTo(0.34, -0.61, 0.43, -0.22);
      ctx.lineTo(0.46, 0.36); ctx.lineTo(0.23, 0.25 + sway);
      ctx.lineTo(0.12, 0.48); ctx.lineTo(-0.07, 0.29 - sway);
      ctx.lineTo(-0.28, 0.46); ctx.lineTo(-0.32, 0.26);
    } else if (id === 'pinky') {
      // Swept crown, slender cloak, and two floating ribbon tips.
      ctx.moveTo(-0.36, 0.28);
      ctx.bezierCurveTo(-0.54, -0.17, -0.31, -0.67, 0.14, -0.57);
      ctx.quadraticCurveTo(0.38, -0.58, 0.42, -0.74);
      ctx.quadraticCurveTo(0.58, -0.32, 0.34, -0.12);
      ctx.quadraticCurveTo(0.3, 0.21, 0.52, 0.44 + sway);
      ctx.quadraticCurveTo(0.12, 0.44, 0.04, 0.26);
      ctx.quadraticCurveTo(-0.12, 0.64 - sway, -0.17, 0.33);
      ctx.quadraticCurveTo(-0.39, 0.54, -0.36, 0.28);
    } else if (id === 'inky') {
      // Split antennae and an asymmetric, notched electric wisp.
      ctx.moveTo(-0.44, 0.3); ctx.lineTo(-0.36, -0.3);
      ctx.lineTo(-0.2, -0.64); ctx.lineTo(-0.07, -0.43);
      ctx.lineTo(0.18, -0.68); ctx.lineTo(0.24, -0.43);
      ctx.quadraticCurveTo(0.48, -0.3, 0.39, 0.07);
      ctx.lineTo(0.5, 0.32 + sway); ctx.lineTo(0.18, 0.24);
      ctx.lineTo(0.27, 0.49); ctx.lineTo(-0.03, 0.34 - sway);
      ctx.lineTo(-0.23, 0.49); ctx.lineTo(-0.19, 0.24);
    } else {
      // A broad, round coat with a heavy scalloped edge.
      ctx.moveTo(-0.49, 0.27);
      ctx.bezierCurveTo(-0.52, -0.23, -0.38, -0.59, -0.02, -0.57);
      ctx.bezierCurveTo(0.38, -0.62, 0.5, -0.22, 0.49, 0.28);
      ctx.quadraticCurveTo(0.4, 0.53 + sway, 0.22, 0.34);
      ctx.quadraticCurveTo(0.05, 0.56 - sway, -0.1, 0.35);
      ctx.quadraticCurveTo(-0.37, 0.58, -0.49, 0.27);
    }
    ctx.closePath();
  }

  function eyes(ctx, ghost, dirs, { scared = false, flash = false } = {}) {
    const [dx, dy] = dirs[ghost.dir];
    const id = profiles.get(ghost).id;
    const y = ghost.mode === 'eyes' ? -0.12 : -0.19;
    const rx = id === 'clyde' ? 0.14 : 0.125;
    for (const x of [-0.18, 0.18]) {
      ctx.fillStyle = scared ? (flash ? '#263b64' : '#d6f2ff') : '#fff6e8';
      ctx.beginPath();
      ctx.ellipse(x, y, scared ? 0.065 : rx, scared ? 0.085 : 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!scared) {
        ctx.fillStyle = '#142b3e';
        ctx.beginPath(); ctx.arc(x + dx * 0.055, y + dy * 0.065, 0.063, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x + dx * 0.055 - 0.018, y + dy * 0.065 - 0.02, 0.018, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function details(ctx, profile) {
    ctx.strokeStyle = '#283040'; ctx.fillStyle = '#283040'; ctx.lineWidth = 0.065; ctx.lineCap = 'round';
    ctx.beginPath();
    if (profile.id === 'blinky') {
      ctx.moveTo(-0.34, -0.4); ctx.lineTo(-0.07, -0.3);
      ctx.moveTo(0.34, -0.4); ctx.lineTo(0.07, -0.3); ctx.stroke();
      ctx.strokeStyle = profile.accent; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(-0.34, 0.05); ctx.lineTo(-0.23, 0.1);
      ctx.moveTo(0.34, 0.05); ctx.lineTo(0.23, 0.1); ctx.stroke();
    } else if (profile.id === 'pinky') {
      ctx.fillStyle = profile.accent;
      ctx.moveTo(0, -0.48); ctx.lineTo(0.065, -0.4); ctx.lineTo(0, -0.32); ctx.lineTo(-0.065, -0.4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#664b73'; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.moveTo(-0.32, -0.34); ctx.lineTo(-0.4, -0.4);
      ctx.moveTo(0.3, -0.34); ctx.lineTo(0.37, -0.4); ctx.stroke();
      ctx.strokeStyle = profile.accent;
      ctx.beginPath(); ctx.moveTo(-0.23, 0.11); ctx.quadraticCurveTo(0, 0.32, 0.25, 0.12); ctx.stroke();
    } else if (profile.id === 'inky') {
      ctx.strokeStyle = '#18565e'; ctx.lineWidth = 0.055;
      ctx.moveTo(-0.33, -0.38); ctx.lineTo(0.31, -0.38); ctx.stroke();
      ctx.strokeStyle = profile.accent; ctx.lineWidth = 0.03;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-0.15 + i * 0.11, 0.08); ctx.lineTo(-0.2 + i * 0.11, 0.19); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#765032'; ctx.lineWidth = 0.045;
      ctx.arc(0.18, -0.19, 0.175, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#9c583f';
      ctx.beginPath(); ctx.moveTo(-0.39, 0.04); ctx.quadraticCurveTo(0, 0.2, 0.4, 0.04);
      ctx.lineTo(0.35, 0.17); ctx.quadraticCurveTo(0, 0.31, -0.39, 0.16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = profile.accent;
      ctx.beginPath(); ctx.arc(0.02, 0.29, 0.04, 0, Math.PI * 2); ctx.fill();
    }
  }

  function draw(ctx, ghosts, { tile, colors, dirs, powerTimer = 0, animFrame = 0, time = animFrame / 60, reducedMotion = false }) {
    for (const ghost of ghosts) {
      if (ghost.mode === 'house' && ghost.houseTimer > 30) continue;
      const profile = profiles.get(ghost);
      const sway = reducedMotion ? 0 : Math.sin(time * 5 + profile.index * 1.7) * 0.035;
      const flash = ghost.scared && !reducedMotion && powerTimer < 120 && Math.floor(time * 60 / 8) % 2 === 1;
      ctx.save(); ctx.translate(ghost.x, ghost.y); ctx.scale(tile, tile);
      if (ghost.mode === 'eyes') {
        eyes(ctx, ghost, dirs);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = 'rgba(3, 10, 17, 0.4)';
      ctx.beginPath(); ctx.ellipse(0, 0.42, 0.4, 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(0, sway);
      const color = ghost.scared ? (flash ? '#edf7ff' : '#4769d5') : colors?.[ghost.color] || profile.color;
      const accent = ghost.scared ? (flash ? '#ffffff' : '#8bc4ff') : profile.accent;
      const gradient = ctx.createLinearGradient(-0.3, -0.6, 0.35, 0.5);
      gradient.addColorStop(0, accent); gradient.addColorStop(0.35, color); gradient.addColorStop(1, ghost.scared ? '#2b427d' : '#29313e');
      ctx.fillStyle = gradient; ctx.strokeStyle = accent; ctx.lineWidth = 0.035;
      ctx.lineJoin = 'round'; ctx.shadowColor = color; ctx.shadowBlur = tile * 0.35;
      body(ctx, profile.id, sway); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      eyes(ctx, ghost, dirs, { scared: ghost.scared, flash });
      if (ghost.scared) {
        ctx.strokeStyle = flash ? '#263b64' : '#d6f2ff'; ctx.lineWidth = 0.045;
        ctx.beginPath(); ctx.moveTo(-0.24, 0.16);
        for (let i = 1; i <= 6; i++) ctx.lineTo(-0.24 + i * 0.08, i % 2 ? 0.1 : 0.16);
        ctx.stroke();
      } else details(ctx, profile);
      ctx.restore();
    }
  }

  return { draw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GhostArtwork;
