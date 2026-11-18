const PlayerArtwork = (() => {
  const lighting = typeof module !== 'undefined' && module.exports ? require('./city-lighting') : CityLighting;
  const circle = Math.PI * 2;

  // Draws a section of the shell. The caller saves Canvas state around the clip.
  function drawShell(ctx, start, end, { rotation, powered = false, lamp = 0, blur = 0 }) {
    // Counter-rotate the light in local space so every heading faces the same moon.
    const bearing = -Math.PI * 0.75 - rotation;
    const lightX = Math.cos(bearing) * 0.27;
    const lightY = Math.sin(bearing) * 0.27;
    const brass = ctx.createRadialGradient(lightX, lightY, 0.018, 0, 0, 0.46);
    brass.addColorStop(0, powered ? '#fff0ba' : '#f3d58a');
    brass.addColorStop(0.28, powered ? '#edbd5a' : '#c69848');
    brass.addColorStop(0.66, powered ? '#b97c2f' : '#926329');
    brass.addColorStop(1, '#354348');
    ctx.fillStyle = brass;
    ctx.strokeStyle = '#1c282d';
    ctx.lineWidth = 0.035;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = powered ? '#ffd477' : '#c38a3e';
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 0.45, start, end);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.clip();

    const bevel = ctx.createLinearGradient(lightX, lightY, -lightX, -lightY);
    bevel.addColorStop(0, powered ? '#ffe8a3' : '#e8bc68');
    bevel.addColorStop(0.6, 'rgba(45, 31, 22, 0.28)');
    bevel.addColorStop(1, 'rgba(157, 193, 193, 0.6)');
    ctx.strokeStyle = bevel;
    ctx.lineWidth = 0.056;
    ctx.beginPath();
    ctx.arc(0, 0, 0.409, 0, circle);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 236, 187, ${0.44 + lamp * 0.43})`;
    ctx.lineWidth = 0.033;
    ctx.beginPath();
    ctx.arc(0, 0, 0.377, bearing - 0.54, bearing + 0.54);
    ctx.stroke();

    // A chipped seam and an ember behind a recessed slit.
    ctx.beginPath(); ctx.moveTo(-0.34, -0.2); ctx.lineTo(-0.23, -0.15);
    ctx.lineTo(-0.27, -0.04); ctx.lineTo(-0.15, 0.045);
    ctx.strokeStyle = '#26363a'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.strokeStyle = powered ? '#ffe8a3' : '#c79750'; ctx.lineWidth = 0.016; ctx.stroke();

    ctx.fillStyle = '#17232a';
    ctx.beginPath(); ctx.moveTo(-0.045, -0.255); ctx.lineTo(0.225, -0.205);
    ctx.lineTo(0.195, -0.11); ctx.lineTo(-0.025, -0.16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = powered ? '#fff6d5' : '#ffe3a1';
    ctx.beginPath(); ctx.moveTo(0.005, -0.205); ctx.lineTo(0.18, -0.175);
    ctx.lineTo(0.14, -0.145); ctx.lineTo(0.005, -0.17); ctx.closePath(); ctx.fill();
  }

  function drawJaws(ctx, mouth, powered) {
    const interior = ctx.createLinearGradient(0, 0, 0.41, 0);
    interior.addColorStop(0, '#172127');
    interior.addColorStop(1, '#64422a');
    const jawX = Math.cos(mouth) * 0.425, jawY = Math.sin(mouth) * 0.425;
    ctx.fillStyle = interior;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(jawX, side * jawY);
      ctx.lineTo(Math.cos(mouth + 0.24) * 0.39, side * Math.sin(mouth + 0.24) * 0.39);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = powered ? '#ffe8a3' : '#a77440';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(jawX, -jawY);
    ctx.lineTo(0, 0);
    ctx.lineTo(jawX, jawY);
    ctx.stroke();
  }

  function draw(ctx, player, { tile, powerTimer = 0, time = 0, reducedMotion = false, lampAt }) {
    if (!player.alive) return;
    const mouth = 0.2 + player.mouth * 0.6;
    const powered = powerTimer > 0;
    const glow = powered && !reducedMotion ? 0.94 + Math.sin(time * 3) * 0.06 : 1;
    const rotation = player.dir * Math.PI / 2;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(tile, tile);
    lighting.ground(ctx, 0.455, 0.51, powered ? 'rgba(255, 175, 70, 0.44)' : 'rgba(215, 145, 74, 0.24)');
    ctx.rotate(rotation);
    drawShell(ctx, mouth, circle - mouth, {
      rotation, powered, lamp: lampAt?.(player.x, player.y), blur: tile * (powered ? 0.5 : 0.11) * glow
    });
    drawJaws(ctx, mouth, powered);
    ctx.restore();
  }

  return { draw, drawShell };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlayerArtwork;
