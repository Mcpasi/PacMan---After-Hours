const CityLighting = (() => {
  function lampLevelAt(layout, levels, x, y) {
    const rangeSquared = (layout.tile * 2.4) ** 2;
    let level = 0;
    for (const [index, lamp] of layout.lamps.entries()) {
      const distanceSquared = (x - lamp.x) ** 2 + (y - lamp.y) ** 2;
      if (distanceSquared >= rangeSquared) continue;
      const falloff = 1 - distanceSquared / rangeSquared;
      level = Math.max(level, falloff * falloff * (levels?.[index] ?? 1));
    }
    return level;
  }

  // All city sprites share the same street plane and light from the upper left.
  function ground(ctx, y, radius, reflectionColor) {
    ctx.save();
    ctx.translate(0.045, y);
    ctx.scale(1, 0.28);

    const contact = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    contact.addColorStop(0, 'rgba(3, 9, 15, 0.82)');
    contact.addColorStop(0.55, 'rgba(3, 9, 15, 0.43)');
    contact.addColorStop(1, 'rgba(3, 9, 15, 0)');
    ctx.fillStyle = contact;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius, 0, 0, Math.PI * 2);
    ctx.fill();

    const reflection = ctx.createRadialGradient(-radius * 0.12, 0, 0, 0, 0, radius);
    reflection.addColorStop(0, reflectionColor);
    reflection.addColorStop(1, 'transparent');
    ctx.fillStyle = reflection;
    ctx.fill();
    ctx.restore();
  }

  return { ground, lampLevelAt };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CityLighting;
