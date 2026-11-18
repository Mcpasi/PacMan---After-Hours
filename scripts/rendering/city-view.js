// An orthographic projection shared by WebGL, Canvas and the pixel world. World coordinates
// follow the movement grid (positive y is south, positive z is above the street).
const CityView = (() => {
  const yaw = 8 * Math.PI / 180;
  const elevation = 50 * Math.PI / 180;
  const right = Math.cos(yaw), south = Math.sin(yaw);
  const pitch = Math.sin(elevation), rise = Math.cos(elevation);

  function create({ width, height, tile }) {
    const margin = tile * 0.7;
    const boardWidth = Math.ceil(width * right + height * south + margin);
    const boardHeight = Math.ceil((width * south + height * right) * pitch + tile * 2 * rise + margin);
    const centerX = width / 2, centerY = height / 2, centerZ = tile * 0.32;
    const distance = Math.hypot(width, height, tile);
    const target = [centerX, -centerY, centerZ];
    const position = [target[0] + south * rise * distance, target[1] - right * rise * distance,
      target[2] + pitch * distance];
    const b = south * pitch, d = right * pitch;
    const x = boardWidth / 2 - right * centerX + south * centerY;
    const y = boardHeight / 2 - b * centerX - d * centerY + rise * centerZ;
    return {
      width: boardWidth, height: boardHeight, worldWidth: width, tile,
      lift: rise, spriteHeight: tile * 0.32, ground: [right, b, -south, d, x, y],
      camera: { position, target, far: distance * 3 }
    };
  }

  function frame(board, width, height, focus, { allowTracking = true } = {}) {
    const fit = Math.min(width / board.width, height / board.height);
    const minTile = width < 700 || height < 500 ? 26 : 28;
    const tracking = allowTracking && fit * board.tile < minTile - 1;
    const scale = tracking ? minTile / board.tile : fit;
    // Masked tunnel sprites cross from one projected edge to the other at x = 0.
    const wrapX = (focus.x % board.worldWidth + board.worldWidth) % board.worldWidth;
    const [focusX, focusY] = project(board, wrapX, focus.y, board.spriteHeight);
    const left = offset(width, board.width * scale, focusX * scale);
    const top = offset(height, board.height * scale, focusY * scale);
    const [a, b, c, d, x, y] = board.ground;
    return {
      width, height, scale, tracking, left, top,
      lift: board.lift * scale, spriteHeight: board.spriteHeight,
      ground: [a * scale, b * scale, c * scale, d * scale, x * scale + left, y * scale + top]
    };
  }

  function offset(available, extent, focus) {
    const free = available - extent;
    if (free >= 0) return free / 2;
    return Math.max(free, Math.min(0, available / 2 - focus));
  }

  function project(view, x, y, z = 0) {
    const [a, b, c, d, left, top] = view.ground;
    return [a * x + c * y + left, b * x + d * y + top - view.lift * z];
  }

  function transform(ctx, view, z = 0) {
    const [a, b, c, d, x, y] = view.ground;
    ctx.transform(a, b, c, d, x, y - view.lift * z);
  }

  function unproject(view, x, y) {
    const [a, b, c, d, left, top] = view.ground;
    const determinant = a * d - b * c;
    return [(d * (x - left) - c * (y - top)) / determinant, (a * (y - top) - b * (x - left)) / determinant];
  }

  return { create, frame, project, transform, unproject };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CityView;
