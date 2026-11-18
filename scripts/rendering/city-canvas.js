const CanvasCity = (() => {
  const asphalt = ['#202e36', '#233139', '#25343c'];

  function paintGround(ctx, layout) {
    const { width, height, tile } = layout;
    const unit = tile / 16;
    ctx.fillStyle = '#192730';
    ctx.fillRect(0, 0, width, height);
    for (const { col, row, seed, curbs } of layout.streets) {
      const x = col * tile, y = row * tile;
      ctx.fillStyle = asphalt[Math.floor(seed * asphalt.length)];
      ctx.fillRect(x, y, tile, tile);
      // Kerbs follow the wall edges and leave each intersection open.
      const edge = 2.2 * unit;
      const kerbs = [[0, 0, tile, edge], [tile - edge, 0, edge, tile],
        [0, tile - edge, tile, edge], [0, 0, edge, tile]];
      ctx.fillStyle = '#35474e';
      curbs.forEach((hasCurb, index) => {
        if (hasCurb) {
          const [left, top, w, h] = kerbs[index];
          ctx.fillRect(x + left, y + top, w, h);
        }
      });
      if (seed > 0.65) {
        ctx.fillStyle = 'rgba(128, 171, 176, 0.13)';
        ctx.beginPath();
        ctx.ellipse(x + tile * 0.48, y + tile * 0.68, tile * 0.36, tile * 0.11, -0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(171, 206, 195, 0.16)';
        ctx.fillRect(x + 5 * unit, y + 10 * unit, 6 * unit, 0.65 * unit);
      } else if (seed < 0.1) {
        ctx.fillStyle = '#132129';
        for (let bar = 0; bar < 4; bar++) ctx.fillRect(x + (4 + bar * 2) * unit, y + 3 * unit, unit, 4 * unit);
      }
      if (curbs.filter(Boolean).length === 1 && seed > 0.46) {
        ctx.fillStyle = 'rgba(177, 194, 186, 0.22)';
        for (let stripe = 0; stripe < 4; stripe++) {
          ctx.fillRect(x + (3 + stripe * 2.5) * unit, y + 12 * unit, 1.4 * unit, 2.4 * unit);
        }
      }
    }
    // Both ends of a wrap corridor share the same painted tunnel markings.
    ctx.save();
    ctx.strokeStyle = '#75aba7';
    ctx.lineWidth = 1.25 * unit;
    for (const row of layout.tunnels) {
      const y = (row + 0.5) * tile;
      for (const [edge, dir] of [[0, 1], [width, -1]]) {
        for (const offset of [4, 9]) {
          const x = edge + dir * offset * unit;
          ctx.beginPath();
          ctx.moveTo(x + dir * 3 * unit, y - 4 * unit);
          ctx.lineTo(x, y);
          ctx.lineTo(x + dir * 3 * unit, y + 4 * unit);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function tint(color, amount) {
    return '#' + [1, 3, 5].map(index =>
      Math.round(parseInt(color.slice(index, index + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
  }

  const faces = Object.fromEntries(Object.entries(CityArchitecture.materials).map(([key, material]) => {
    const { color, emissive } = material;
    return [key, [emissive ? color : tint(color, 0.71), emissive ? color : tint(color, 0.54), color]];
  }));

  function polygon(ctx, color, points) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fill();
  }

  function paintBox(ctx, view, box) {
    CityArchitecture.faces(view, box).forEach((face, index) => polygon(ctx, faces[box.material][index], face));
  }

  function create({ createCanvas }) {
    const ground = createCanvas(), structures = createCanvas(), vignette = createCanvas();
    const cacheScale = 2;
    vignette.width = vignette.height = 128;
    const fog = vignette.getContext('2d');
    const gradient = fog.createRadialGradient(64, 61, 29, 64, 61, 87);
    gradient.addColorStop(0, 'rgba(2, 7, 13, 0)');
    gradient.addColorStop(1, 'rgba(2, 7, 13, 0.38)');
    fog.fillStyle = gradient;
    fog.fillRect(0, 0, 128, 128);
    const glow = createCanvas();
    glow.width = glow.height = 64;
    const light = glow.getContext('2d');
    const pool = light.createRadialGradient(32, 32, 0, 32, 32, 32);
    pool.addColorStop(0, 'rgba(255, 200, 121, 0.55)');
    pool.addColorStop(0.3, 'rgba(239, 153, 73, 0.23)');
    pool.addColorStop(1, 'rgba(208, 116, 51, 0)');
    light.fillStyle = pool;
    light.fillRect(0, 0, 64, 64);
    let layout, lanterns, defaultView;

    function drawLayer(ctx, layer, view) {
      ctx.drawImage(layer, view.left, view.top, layout.view.width * view.scale, layout.view.height * view.scale);
    }

    function screenPoint(view, [x, y]) {
      return [view.left + x * view.scale, view.top + y * view.scale];
    }

    return {
      name: 'canvas',
      setLayout(next) {
        layout = next;
        const { width, height, tile, view } = next;
        defaultView = CityView.frame(view, width, height, { x: width / 2, y: height / 2 }, { allowTracking: false });
        for (const layer of [ground, structures]) {
          layer.width = view.width * cacheScale;
          layer.height = view.height * cacheScale;
        }
        const pavement = ground.getContext('2d');
        pavement.scale(cacheScale, cacheScale);
        CityArchitecture.platform(next).forEach(part => paintBox(pavement, view, part));
        pavement.save();
        CityView.transform(pavement, view);
        pavement.beginPath(); pavement.rect(0, 0, width, height); pavement.clip();
        paintGround(pavement, next);
        pavement.fillStyle = 'rgba(4, 11, 19, 0.33)';
        for (const block of next.buildings) {
          pavement.fillRect(block.x + block.height * 0.26, block.y + block.height * 0.34, block.width, block.depth);
        }
        pavement.restore();

        const walls = structures.getContext('2d');
        walls.scale(cacheScale, cacheScale);
        for (const block of CityArchitecture.orderedBuildings(next)) {
          CityArchitecture.building(block, tile).forEach(part => paintBox(walls, view, part));
        }
        lanterns = next.lamps.map(({ x, y }) => ({
          foot: CityView.project(view, x, y),
          head: CityView.project(view, x, y, tile * CityArchitecture.lanternHeight)
        }));
      },
      draw(ctx, frame) {
        const { width, height, tile, lamps } = layout;
        const view = frame.view || defaultView;
        const pulse = frame.reducedMotion ? 1 : 0.96 + 0.04 * Math.sin(frame.time * 1.8);
        drawLayer(ctx, ground, view);
        ctx.save();
        CityView.transform(ctx, view);
        ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        const reach = tile * 2.25;
        for (const [index, { x, y }] of lamps.entries()) {
          ctx.globalAlpha = pulse * (frame.lampLevels?.[index] ?? 1);
          ctx.drawImage(glow, x - reach, y - reach, reach * 2, reach * 2);
        }
        ctx.restore();
        drawLayer(ctx, structures, view);

        ctx.save();
        for (const [index, { foot, head }] of lanterns.entries()) {
          const [x, y] = screenPoint(view, head);
          const s = view.scale;
          ctx.strokeStyle = '#202c33'; ctx.lineWidth = tile * s * 0.105;
          ctx.beginPath(); ctx.moveTo(...screenPoint(view, foot)); ctx.lineTo(x, y); ctx.stroke();
          ctx.fillStyle = '#756c57'; ctx.fillRect(x - 1.9 * s, y - 1.4 * s, 3.8 * s, 3.8 * s);
          ctx.globalAlpha = pulse * (frame.lampLevels?.[index] ?? 1);
          ctx.fillStyle = '#ffdea3'; ctx.fillRect(x - 1.05 * s, y - s, 2.1 * s, 2.7 * s);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      },
      drawAtmosphere(ctx, frame) {
        const view = frame.view || defaultView;
        const { width, height } = view;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const halo = frame.reducedMotion ? 0.4 : 0.4 + 0.1 * Math.sin(frame.time * 1.8);
        for (const [index, { head }] of lanterns.entries()) {
          const [x, y] = screenPoint(view, head);
          const radius = 7 * view.scale;
          ctx.globalAlpha = halo * (frame.lampLevels?.[index] ?? 1);
          ctx.drawImage(glow, x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        const drift = frame.reducedMotion ? 0 : Math.sin(frame.time * 0.12) * width * 0.12;
        const mist = ctx.createLinearGradient(drift, height * 0.5, width + drift, height);
        mist.addColorStop(0, 'rgba(115, 151, 153, 0)');
        mist.addColorStop(0.5, 'rgba(115, 151, 153, 0.07)');
        mist.addColorStop(1, 'rgba(115, 151, 153, 0)');
        ctx.fillStyle = mist;
        ctx.fillRect(0, height * 0.35, width, height * 0.65);
        if (!frame.reducedMotion) {
          ctx.strokeStyle = 'rgba(155, 189, 201, 0.19)';
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          for (let i = 0; i < 46; i++) {
            const y = (CityLayout.noise(i, 2) * height + frame.time * 105) % (height + 12) - 12;
            const x = (CityLayout.noise(i, 5) * width - frame.time * 16 % width + width) % width;
            ctx.moveTo(x, y);
            ctx.lineTo(x - 2, y + 7);
          }
          ctx.stroke();
        }
        ctx.drawImage(vignette, 0, 0, width, height);
        ctx.restore();
      }
    };
  }

  return { create, paintGround };
})();
