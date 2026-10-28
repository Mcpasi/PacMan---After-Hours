// The 1980 skin shares the live grid and actors, never a second gameplay world.
const RetroWorldArtwork = (() => {
  const ghostColors = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'];

  function wallContours(maze, tile) {
    const edges = new Map();
    const wall = (row, col) => maze[row]?.[col] === 0;
    function edge(x, y, dx, dy) {
      const key = `${x},${y}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({ x, y, dx, dy });
    }
    maze.forEach((row, r) => row.forEach((cell, c) => {
      if (cell !== 0) return;
      if (!wall(r - 1, c)) edge(c, r, 1, 0);
      if (!wall(r, c + 1)) edge(c + 1, r, 0, 1);
      if (!wall(r + 1, c)) edge(c + 1, r + 1, -1, 0);
      if (!wall(r, c - 1)) edge(c, r + 1, 0, -1);
    }));
    const contours = [];
    while (edges.size) {
      const start = edges.values().next().value[0];
      const points = [];
      let current = start;
      do {
        points.push({ x: current.x * tile, y: current.y * tile });
        const key = `${current.x},${current.y}`, choices = edges.get(key);
        choices.splice(choices.indexOf(current), 1);
        if (!choices.length) edges.delete(key);
        const x = current.x + current.dx, y = current.y + current.dy;
        if (x === start.x && y === start.y) break;
        // At diagonally touching walls, turn right rather than joining both islands.
        const rank = next => {
          const cross = current.dx * next.dy - current.dy * next.dx;
          return cross === 1 ? 0 : cross === 0 ? 1 : 2;
        };
        current = edges.get(`${x},${y}`).reduce((a, b) => rank(a) <= rank(b) ? a : b);
      } while (current);
      contours.push(points);
    }
    return contours;
  }

  function paintBackground(ctx, maze, tile) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, maze[0].length * tile, maze.length * tile);
    ctx.beginPath();
    for (const points of wallContours(maze, tile)) {
      points.forEach((point, index) => {
        const previous = points[(index + points.length - 1) % points.length];
        const next = points[(index + 1) % points.length];
        const radius = tile * 0.18;
        const entry = { x: point.x + Math.sign(previous.x - point.x) * radius,
          y: point.y + Math.sign(previous.y - point.y) * radius };
        const exit = { x: point.x + Math.sign(next.x - point.x) * radius,
          y: point.y + Math.sign(next.y - point.y) * radius };
        if (index === 0) ctx.moveTo(entry.x, entry.y);
        else ctx.lineTo(entry.x, entry.y);
        ctx.quadraticCurveTo(point.x, point.y, exit.x, exit.y);
      });
      ctx.closePath();
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2121ff'; ctx.lineWidth = tile * 0.25; ctx.stroke();
    ctx.strokeStyle = '#000000'; ctx.lineWidth = tile * 0.125; ctx.stroke();
  }

  function create(maze, tile, { createCanvas }) {
    const background = createCanvas();
    background.width = maze[0].length * tile;
    background.height = maze.length * tile;
    paintBackground(background.getContext('2d'), maze, tile);
    return {
      drawMaze(ctx, liveMaze) {
        ctx.save();
        ctx.drawImage(background, 0, 0);
        liveMaze.forEach((row, r) => row.forEach((cell, c) => {
          const x = (c + 0.5) * tile, y = (r + 0.5) * tile;
          if (cell === 4) {
            ctx.fillStyle = '#ffb8ff';
            ctx.fillRect(c * tile, r * tile + tile * 0.4, tile, tile * 0.125);
          } else if (cell === 2) {
            ctx.fillStyle = '#ffb8ae';
            ctx.fillRect(x - tile / 16, y - tile / 16, tile / 8, tile / 8);
          } else if (cell === 3) {
            ctx.fillStyle = '#ffb8ae';
            ctx.beginPath(); ctx.arc(x, y, tile * 0.28, 0, Math.PI * 2); ctx.fill();
          }
        }));
        ctx.restore();
      }
    };
  }

  function player(ctx, actor, { tile }) {
    if (!actor.alive) return;
    const mouth = 0.2 + actor.mouth * 0.6;
    ctx.save(); ctx.translate(actor.x, actor.y); ctx.scale(tile, tile);
    ctx.rotate(actor.dir * Math.PI / 2);
    ctx.fillStyle = '#ffff00';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, 0.45, mouth, Math.PI * 2 - mouth);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function ghosts(ctx, roster, { tile, dirs, powerTimer = 0, time = 0, reducedMotion = false }) {
    for (const ghost of roster) {
      if (ghost.mode === 'house' && ghost.houseTimer > 30) continue;
      const flash = ghost.scared && !reducedMotion && powerTimer < 120 && Math.floor(time * 4) % 2 === 1;
      const eyesOnly = ghost.mode === 'eyes';
      ctx.save(); ctx.translate(ghost.x, ghost.y); ctx.scale(tile, tile);
      if (!eyesOnly) {
        ctx.fillStyle = ghost.scared ? (flash ? '#ffffff' : '#2121ff') : ghostColors[ghost.color] || ghostColors[0];
        ctx.beginPath(); ctx.moveTo(-0.45, 0.45); ctx.lineTo(-0.45, -0.05);
        ctx.arc(0, -0.05, 0.45, Math.PI, Math.PI * 2);
        ctx.lineTo(0.45, 0.45);
        const step = reducedMotion ? 0 : Math.floor(time * 8) % 2;
        for (let foot = 1; foot <= 6; foot++) {
          ctx.lineTo(0.45 - foot * 0.15, (foot + step) % 2 ? 0.3 : 0.45);
        }
        ctx.closePath(); ctx.fill();
      }
      if (ghost.scared && !eyesOnly) {
        ctx.fillStyle = flash ? '#ff0000' : '#ffb8ae';
        for (const x of [-0.17, 0.17]) ctx.fillRect(x - 0.05, -0.15, 0.1, 0.1);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(-0.25, 0.18);
        for (let tooth = 1; tooth <= 6; tooth++) ctx.lineTo(-0.25 + tooth / 12, tooth % 2 ? 0.1 : 0.18);
        ctx.stroke();
      } else {
        const [dx, dy] = dirs[ghost.dir];
        for (const x of [-0.18, 0.18]) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(x, -0.12, 0.13, 0.17, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2121ff';
          ctx.fillRect(x + dx * 0.06 - 0.06, -0.18 + dy * 0.065, 0.12, 0.12);
        }
      }
      ctx.restore();
    }
  }

  return { create, player, ghosts };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RetroWorldArtwork;
