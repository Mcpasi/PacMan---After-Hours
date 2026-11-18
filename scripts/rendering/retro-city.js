// Paint the same city geometry into an opaque, limited-palette pixel scene.
const RetroCityArtwork = (() => {
  const projection = typeof module !== 'undefined' && module.exports ? require('./city-view') : CityView;
  const architecture = typeof module !== 'undefined' && module.exports ? require('./city-architecture') : CityArchitecture;
  const sky = '#090d22';
  const street = '#141d39';
  const curb = '#334575';
  const grate = '#252f57';
  const tunnel = '#6dd9ce';
  const faces = {
    foundation: ['#111731', '#0d142e', '#1a2649'],
    coping: ['#344779', '#293867', '#5777ba'],
    stone: ['#263866', '#1b2953', '#465a8c'],
    brick: ['#3d315a', '#302848', '#62517c'],
    tile: ['#1e4b64', '#193b55', '#3e6b85'],
    slate: ['#22345f', '#1b2953', '#2b3d66'],
    copper: ['#1c455e', '#172e4b', '#30586d'],
    tar: ['#332c56', '#252243', '#453d6a'],
    casement: ['#131d39', '#131d39', '#1c284b'],
    pane: ['#526899', '#435581', '#526899'],
    warm: ['#ffb56a', '#eb875d', '#ffd18d'],
    cool: ['#7de0d0', '#509cae', '#9cebdc']
  };
  const colors = [...new Set([sky, street, curb, grate, tunnel, ...Object.values(faces).flat()])];

  function polygon(ctx, vertices, color) {
    // Span filling uses pixel centers, so all sloped edges stay on-palette.
    const rows = vertices.map(([, y]) => y);
    const start = Math.ceil(Math.min(...rows) - 0.5), end = Math.ceil(Math.max(...rows) - 0.5);
    ctx.fillStyle = color;
    for (let row = start; row < end; row++) {
      const sample = row + 0.5;
      let left = Infinity, right = -Infinity;
      for (const [index, [ax, ay]] of vertices.entries()) {
        const [bx, by] = vertices[(index + 1) % vertices.length];
        if ((ay > sample) === (by > sample)) continue;
        const x = ax + (sample - ay) * (bx - ax) / (by - ay);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
      const x = Math.ceil(left - 0.5), width = Math.ceil(right - 0.5) - x;
      if (width > 0) ctx.fillRect(x, row, width, 1);
    }
  }

  function paint(ctx, layout) {
    const { width, height, tile, view } = layout;
    const unit = tile / 16;
    function groundRect(x, y, w, h, color) {
      const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      polygon(ctx, corners.map(([px, py]) => projection.project(view, px, py)), color);
    }
    function building(part) {
      architecture.faces(view, part).forEach((shape, index) => polygon(ctx, shape, faces[part.material][index]));
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.width, view.height);
    architecture.platform(layout).forEach(building);
    groundRect(0, 0, width, height, street);
    const kerbs = [[0, 0, tile, unit], [tile - unit, 0, unit, tile], [0, tile - unit, tile, unit], [0, 0, unit, tile]];
    for (const { row, col, curbs, seed } of layout.streets) {
      const x = col * tile, y = row * tile;
      curbs.forEach((present, index) => {
        const [dx, dy, w, h] = kerbs[index];
        if (present) groundRect(x + dx, y + dy, w, h, curb);
      });
      if (seed < 0.24) {
        groundRect(x + unit * 3, y + unit * 11, unit * 4, unit, grate);
        groundRect(x + unit * 5, y + unit * 13, unit * 5, unit, grate);
      }
    }
    for (const row of layout.tunnels) {
      for (const x of [unit * 3, width - unit * 8]) {
        groundRect(x, (row + 0.25) * tile, unit * 5, unit * 2, tunnel);
        groundRect(x, (row + 0.625) * tile, unit * 5, unit * 2, tunnel);
      }
    }
    for (const block of architecture.orderedBuildings(layout)) {
      architecture.building(block, tile).forEach(building);
    }
  }

  function create(layout, createCanvas) {
    const backdrop = createCanvas(), sprites = createCanvas(), frame = createCanvas(), output = createCanvas();
    const board = layout.view, pad = layout.tile * 3;
    backdrop.width = board.width; backdrop.height = board.height;
    sprites.width = layout.width + 2 * pad; sprites.height = layout.height + 2 * pad;
    paint(backdrop.getContext('2d'), layout);

    function draw(ctx, view, surface, mix, { ground, actors }) {
      const width = Math.ceil(view.width / view.scale), height = Math.ceil(view.height / view.scale);
      if (frame.width !== width || frame.height !== height) {
        frame.width = width; frame.height = height;
      }
      const layer = frame.getContext('2d'), source = sprites.getContext('2d');
      const left = Math.round(view.left / view.scale), top = Math.round(view.top / view.scale);
      layer.imageSmoothingEnabled = false;
      layer.fillStyle = sky;
      layer.fillRect(0, 0, width, height);
      layer.drawImage(backdrop, left, top);
      function composite(paintSprites, elevation) {
        source.clearRect(0, 0, sprites.width, sprites.height);
        source.save(); source.translate(pad, pad);
        paintSprites(source);
        source.restore();
        layer.save(); layer.translate(left, top);
        projection.transform(layer, board, elevation);
        // Padding keeps transformed texture edges transparent, even at a tunnel.
        layer.drawImage(sprites, -pad, -pad);
        layer.restore();
      }
      composite(ground, 0);
      composite(actors, board.spriteHeight);
      if (output.width !== surface.width || output.height !== surface.height) {
        output.width = surface.width; output.height = surface.height;
      }
      // Resolve nearest-neighbor pixels before blending. Both opacity paths
      // then use identical source pixels at the backing canvas resolution.
      const pixels = output.getContext('2d');
      pixels.imageSmoothingEnabled = false;
      pixels.drawImage(frame, 0, 0, Math.round(width * view.scale * output.width / view.width),
        Math.round(height * view.scale * output.height / view.height));
      ctx.save(); ctx.globalAlpha = mix;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(output, 0, 0);
      ctx.restore();
    }

    return { draw };
  }

  return { create, paint, colors };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RetroCityArtwork;
