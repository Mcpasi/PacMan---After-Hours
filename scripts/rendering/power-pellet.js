const PowerPelletArtwork = (() => {
  const lighting = typeof module !== 'undefined' && module.exports ? require('./city-lighting') : CityLighting;
  const circle = Math.PI * 2;

  function bezel(ctx, y) {
    ctx.beginPath();
    ctx.moveTo(-0.17, y - 0.35);
    ctx.lineTo(0.17, y - 0.35);
    ctx.lineTo(0.36, y - 0.16);
    ctx.lineTo(0.36, y + 0.16);
    ctx.lineTo(0.17, y + 0.35);
    ctx.lineTo(-0.17, y + 0.35);
    ctx.lineTo(-0.36, y + 0.16);
    ctx.lineTo(-0.36, y - 0.16);
    ctx.closePath();
  }

  function draw(ctx, x, y, { tile, time = 0, reducedMotion = false }) {
    const pulse = reducedMotion ? 0 : Math.sin(time * 2) * 0.0375;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(tile, tile);
    lighting.ground(ctx, 0.24, 0.49, 'rgba(233, 158, 62, 0.34)');

    const halo = ctx.createRadialGradient(0, 0, 0.2, 0, 0, 0.53 + pulse);
    halo.addColorStop(0, 'rgba(255, 181, 71, 0.44)');
    halo.addColorStop(1, 'rgba(255, 181, 71, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 0.53 + pulse, 0, circle);
    ctx.fill();

    // Raised brass bezel and a recessed, self-lit lens set into the pavement.
    ctx.fillStyle = '#463428';
    bezel(ctx, 0.07);
    ctx.fill();
    const metal = ctx.createLinearGradient(-0.31, -0.31, 0.31, 0.31);
    metal.addColorStop(0, '#f0c884');
    metal.addColorStop(0.55, '#8d643a');
    metal.addColorStop(1, '#514c3e');
    ctx.fillStyle = metal;
    bezel(ctx, 0);
    ctx.fill();

    ctx.fillStyle = '#3f2c22';
    ctx.beginPath();
    ctx.arc(0, 0, 0.298, 0, circle);
    ctx.fill();
    const radius = 0.25 + pulse;
    const glass = ctx.createRadialGradient(-0.08, -0.1, 0.024, 0, 0, radius);
    glass.addColorStop(0, '#fff5cb');
    glass.addColorStop(0.46, '#ffd375');
    glass.addColorStop(1, '#d6752b');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, circle);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 231, 0.8)';
    ctx.beginPath();
    ctx.ellipse(-0.075, -0.105, 0.09, 0.038, -0.55, 0, circle);
    ctx.fill();
    ctx.restore();
  }

  return { draw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PowerPelletArtwork;
