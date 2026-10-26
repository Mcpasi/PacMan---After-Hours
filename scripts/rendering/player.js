// Weathered brass and an ember-lit gaze; the original bite and radius stay intact.
// Artwork is normalized to one tile and never changes movement or collision state.
const PlayerArtwork = (() => {
  function draw(ctx, player, { tile, powerTimer = 0, time = 0, reducedMotion = false }) {
    if (!player.alive) return;
    const mouth = 0.2 + player.mouth * 0.6;
    const powered = powerTimer > 0;
    const glow = powered && !reducedMotion ? 0.94 + Math.sin(time * 3) * 0.06 : 1;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(tile, tile);
    // The contact shadow stays on the street, even when the face turns.
    ctx.fillStyle = 'rgba(3, 10, 17, 0.5)';
    ctx.beginPath(); ctx.ellipse(0, 0.36, 0.38, 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(player.dir * Math.PI / 2);

    const brass = ctx.createLinearGradient(-0.32, -0.42, 0.32, 0.42);
    brass.addColorStop(0, powered ? '#fff0ba' : '#f3d58a');
    brass.addColorStop(0.28, powered ? '#edbd5a' : '#c69848');
    brass.addColorStop(0.62, powered ? '#b97c2f' : '#926329');
    brass.addColorStop(1, '#354348');
    ctx.fillStyle = brass;
    ctx.strokeStyle = powered ? '#ffe8a3' : '#e8bc68';
    ctx.lineWidth = 0.035; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = powered ? '#ffd477' : '#c38a3e';
    ctx.shadowBlur = tile * (powered ? 0.5 : 0.16) * glow;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, 0.45, mouth, Math.PI * 2 - mouth);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // Clip every surface detail to the bite, including almost-closed mouth frames.
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255, 237, 184, 0.65)'; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.arc(-0.025, -0.025, 0.355, Math.PI * 0.95, Math.PI * 1.55); ctx.stroke();
    ctx.strokeStyle = 'rgba(24, 43, 48, 0.65)'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.arc(0, 0, 0.335, 0.7, 2.6); ctx.stroke();

    // A fixed, chipped seam rather than random noise or a changing silhouette.
    ctx.beginPath(); ctx.moveTo(-0.34, -0.2); ctx.lineTo(-0.23, -0.15);
    ctx.lineTo(-0.27, -0.04); ctx.lineTo(-0.15, 0.045);
    ctx.strokeStyle = '#26363a'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.strokeStyle = powered ? '#ffe8a3' : '#c79750'; ctx.lineWidth = 0.016; ctx.stroke();

    // One low, watchful eye keeps the face readable at the native 16px tile size.
    ctx.fillStyle = '#18252b';
    ctx.beginPath(); ctx.moveTo(-0.045, -0.255); ctx.lineTo(0.225, -0.205);
    ctx.lineTo(0.195, -0.11); ctx.lineTo(-0.025, -0.16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = powered ? '#fff6d5' : '#ffe3a1';
    ctx.shadowColor = '#ffd477'; ctx.shadowBlur = tile * (powered ? 0.18 : 0.07);
    ctx.beginPath(); ctx.moveTo(0.005, -0.205); ctx.lineTo(0.18, -0.175);
    ctx.lineTo(0.14, -0.145); ctx.lineTo(0.005, -0.17); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    // Soot-dark jaw edges frame the open wedge without filling it in.
    const jawX = Math.cos(mouth) * 0.425, jawY = Math.sin(mouth) * 0.425;
    ctx.strokeStyle = powered ? '#ffe8a3' : '#63452b'; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(jawX, -jawY); ctx.lineTo(0, 0); ctx.lineTo(jawX, jawY); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  return { draw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlayerArtwork;
