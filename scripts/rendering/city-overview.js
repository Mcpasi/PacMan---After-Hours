const CityOverview = (() => {
  const cell = 5;

  function create(surface, createCanvas) {
    const plan = createCanvas();
    let layout;

    function setLayout(next) {
      layout = next;
      const width = layout.width / layout.tile * cell, height = layout.height / layout.tile * cell;
      plan.width = surface.width = width;
      plan.height = surface.height = height;
      const ctx = plan.getContext('2d');
      ctx.fillStyle = '#244046';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0b151e';
      for (const { row, col } of layout.streets) ctx.fillRect(col * cell, row * cell, cell, cell);
    }

    function draw(view, state, colors) {
      surface.hidden = !view.tracking;
      if (!view.tracking) return;
      const { player, maze, ghosts } = state;
      const x = (player.x + layout.width) % layout.width;
      const [left, top] = CityView.project(view, x, player.y, view.spriteHeight);
      surface.classList.toggle('is-lower', left > view.width * 0.64 && top < Math.min(150, view.height * 0.38));
      const ctx = surface.getContext('2d');
      const scale = cell / layout.tile;
      ctx.drawImage(plan, 0, 0);
      for (const { row, col } of layout.collectibles) {
        const value = maze[row][col];
        if (value < 2 || value > 3) continue;
        ctx.fillStyle = value === 3 ? '#ffe2a0' : '#acb9ab';
        const size = value === 3 ? 3 : 1;
        ctx.fillRect(col * cell + (cell - size) / 2, row * cell + (cell - size) / 2, size, size);
      }
      const corners = [[0, 0], [view.width, 0], [view.width, view.height], [0, view.height]];
      ctx.strokeStyle = '#6b9c9c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      corners.forEach(([u, v], index) => {
        const [gx, gy] = CityView.unproject(view, u, v);
        if (index === 0) ctx.moveTo(gx * scale, gy * scale);
        else ctx.lineTo(gx * scale, gy * scale);
      });
      ctx.closePath(); ctx.stroke();
      for (const ghost of ghosts) {
        if (ghost.mode === 'house' || ghost.mode === 'eyes') continue;
        ctx.fillStyle = ghost.scared ? '#76bcfa' : colors[ghost.color];
        const gx = (ghost.x + layout.width) % layout.width;
        ctx.fillRect(Math.floor(gx * scale) - 1, Math.floor(ghost.y * scale) - 1, 3, 3);
      }
      ctx.fillStyle = '#fff39f';
      ctx.fillRect(Math.floor(x * scale) - 2, Math.floor(player.y * scale) - 2, 5, 5);
    }

    return { setLayout, draw };
  }

  return { create };
})();
