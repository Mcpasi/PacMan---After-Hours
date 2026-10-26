const CanvasCity = (() => {
  function paintGround(ctx, layout) {
    const { width, height, tile } = layout;
    ctx.fillStyle = '#101b22';
    ctx.fillRect(0, 0, width, height);
    for (const street of layout.streets) {
      const x = street.col * tile, y = street.row * tile;
      ctx.fillStyle = street.seed > 0.5 ? '#15232b' : '#121f27';
      ctx.fillRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
      ctx.fillStyle = 'rgba(109, 146, 154, 0.12)';
      ctx.fillRect(x + 2, y + tile - 2, tile - 4, 0.6);
      if (street.seed > 0.77) {
        ctx.fillStyle = 'rgba(90, 137, 149, 0.16)';
        ctx.beginPath();
        ctx.ellipse(x + tile * 0.5, y + tile * 0.65, tile * 0.4, tile * 0.16, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(166, 188, 180, 0.12)';
        ctx.fillRect(x + tile * 0.25, y + tile * 0.6, tile * 0.35, 0.7);
      }
      if (street.seed < 0.08) {
        ctx.fillStyle = '#080f15';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * 2, y + 3, 1, 5);
      }
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#36464a';
    ctx.font = `bold ${tile * 0.75}px monospace`;
    ctx.fillText('O L D   T O W N', width / 2, height - tile * 3.2);
    ctx.font = `${tile * 0.43}px monospace`;
    ctx.fillStyle = '#2d3b40';
    ctx.fillText('LAST SERVICE  03:17', width / 2, height - tile * 2.2);
    ctx.restore();
  }

  function paintBuilding(ctx, building, tile) {
    const { x, y, width, depth, seed } = building;
    ctx.fillStyle = '#060c12';
    ctx.fillRect(x + 3, y + 4, width, depth);
    ctx.fillStyle = '#435052';
    ctx.fillRect(x + 0.5, y + 0.5, width - 1, depth - 1);
    ctx.fillStyle = seed > 0.5 ? '#23313a' : '#29363c';
    ctx.fillRect(x + 2, y + 2, width - 4, depth - 4);
    ctx.strokeStyle = '#4a585b';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x + 3, y + 3, width - 6, depth - 6);
    ctx.fillStyle = '#162129';
    ctx.fillRect(x + 5, y + 5, Math.max(2, width - 10), Math.max(2, depth - 10));
    // Rooftop seams, ventilation boxes and a few windows still lit after midnight.
    ctx.fillStyle = '#27363e';
    for (let sx = x + tile; sx < x + width - 4; sx += tile) ctx.fillRect(sx, y + 4, 0.7, depth - 8);
    if (width > tile && depth > tile) {
      ctx.fillStyle = '#3b494c';
      ctx.fillRect(x + 7, y + 7, tile * 0.5, tile * 0.65);
      ctx.fillStyle = '#111b22';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 8, y + 9 + i * 2, tile * 0.35, 1);
    }
    for (let wx = x + 6; wx < x + width - 4; wx += tile) {
      ctx.fillStyle = seed > 0.58 ? '#ac7846' : '#3b555b';
      ctx.fillRect(wx, y + depth - 4, 4, 1.5);
    }
    if (width >= tile * 4 && depth >= tile * 2) {
      ctx.fillStyle = seed > 0.5 ? '#ba705b' : '#729da0';
      ctx.font = `bold ${tile * 0.46}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(seed > 0.5 ? 'MOTEL' : 'LAST STOP', x + width / 2, y + depth * 0.65);
    }
  }

  function create({ createCanvas }) {
    const background = createCanvas(), vignette = createCanvas();
    let layout;
    return {
      name: 'canvas',
      setLayout(next) {
        layout = next;
        background.width = vignette.width = next.width;
        background.height = vignette.height = next.height;
        const ctx = background.getContext('2d');
        paintGround(ctx, next);
        next.buildings.forEach(building => paintBuilding(ctx, building, next.tile));
        const fog = vignette.getContext('2d');
        const gradient = fog.createRadialGradient(next.width / 2, next.height * 0.43, next.width * 0.12,
          next.width / 2, next.height * 0.43, next.height * 0.7);
        gradient.addColorStop(0, 'rgba(2, 7, 13, 0)');
        gradient.addColorStop(1, 'rgba(2, 7, 13, 0.78)');
        fog.fillStyle = gradient;
        fog.fillRect(0, 0, next.width, next.height);
      },
      draw(ctx, frame) {
        ctx.drawImage(background, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const lamp of layout.lamps) {
          const glow = frame.reducedMotion ? 1 : 0.94 + 0.06 * Math.sin(frame.time * 1.8 + lamp.seed * 20);
          const gradient = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, layout.tile * 2.4);
          gradient.addColorStop(0, `rgba(255, 191, 101, ${0.3 * glow})`);
          gradient.addColorStop(0.35, `rgba(222, 141, 63, ${0.12 * glow})`);
          gradient.addColorStop(1, 'rgba(200, 124, 57, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(lamp.x - layout.tile * 2.4, lamp.y - layout.tile * 2.4, layout.tile * 4.8, layout.tile * 4.8);
        }
        ctx.restore();
        for (const lamp of layout.lamps) {
          ctx.fillStyle = '#03080c';
          ctx.fillRect(lamp.x - 1, lamp.y - 1, 2, 7);
          ctx.fillStyle = '#6a6352';
          ctx.fillRect(lamp.x - 3, lamp.y - 3, 6, 6);
          ctx.fillStyle = '#ffe3a3';
          ctx.fillRect(lamp.x - 1.5, lamp.y - 1.5, 3, 3);
        }
      },
      drawAtmosphere(ctx, frame) {
        ctx.save();
        const drift = frame.reducedMotion ? 0 : Math.sin(frame.time * 0.12) * layout.width * 0.12;
        const mist = ctx.createLinearGradient(0, layout.height * 0.5, layout.width, layout.height);
        mist.addColorStop(0, 'rgba(115, 151, 153, 0)');
        mist.addColorStop(0.5, 'rgba(115, 151, 153, 0.08)');
        mist.addColorStop(1, 'rgba(115, 151, 153, 0)');
        ctx.fillStyle = mist;
        ctx.fillRect(drift, layout.height * 0.35, layout.width, layout.height * 0.65);
        if (!frame.reducedMotion) {
          ctx.strokeStyle = 'rgba(153, 186, 196, 0.17)';
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          for (let i = 0; i < 46; i++) {
            const y = (CityLayout.noise(i, 2) * layout.height + frame.time * 105) % (layout.height + 12) - 12;
            const x = (CityLayout.noise(i, 5) * layout.width - frame.time * 16 % layout.width + layout.width) % layout.width;
            ctx.moveTo(x, y);
            ctx.lineTo(x - 2, y + 7);
          }
          ctx.stroke();
        }
        ctx.drawImage(vignette, 0, 0);
        ctx.restore();
      }
    };
  }
  return { create, paintGround };
})();
