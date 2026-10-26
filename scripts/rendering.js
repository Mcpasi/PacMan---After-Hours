const GameRenderer = (() => {
  let fallback, environment, layout, surface;
  let actors = { ...ClassicActors };
  let time = 0, previousTime = null, generation = 0;
  let reducedMotion = false;

  function setEnvironment(next) {
    if (!next || typeof next.draw !== 'function' || typeof next.setLayout !== 'function') {
      throw new TypeError('An environment needs draw() and setLayout().');
    }
    if (layout) next.setLayout(layout);
    const previous = environment;
    environment = next;
    generation++;
    surface.dataset.renderer = next.name || 'custom';
    if (previous && previous !== fallback && previous !== next) previous.dispose?.();
  }

  function useFallback() {
    if (environment !== fallback) setEnvironment(fallback);
  }

  function init(canvas) {
    surface = canvas;
    reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    fallback = CanvasCity.create({ createCanvas: () => document.createElement('canvas') });
    setEnvironment(fallback);
    // Both modules are bundled locally, so GPU rendering also works offline.
    if (!window.WebGLRenderingContext && !window.WebGL2RenderingContext) return;
    const request = generation;
    Promise.all([
      import('./rendering/city-three.mjs'),
      import('./vendor/three.module.min.mjs')
    ]).then(([{ createCityScene }, three]) => {
      if (generation !== request) return;
      const scene = createCityScene({ three, canvas, paintGround: CanvasCity.paintGround, onFailure: useFallback });
      try { setEnvironment(scene); } catch (error) { scene.dispose(); throw error; }
    }).catch(() => { /* Missing modules and unsupported GPUs use the complete Canvas city. */ });
  }

  function setMaze(maze) {
    layout = CityLayout.create(maze, TILE);
    fallback.setLayout(layout);
    if (environment !== fallback) {
      try { environment.setLayout(layout); } catch { useFallback(); }
    }
  }

  function setActors(next) {
    for (const key of ['player', 'ghosts']) {
      if (key in next && typeof next[key] !== 'function') throw new TypeError(`${key} must be a renderer function.`);
    }
    actors = { ...actors, ...next };
  }

  function drawCollectibles(ctx, frame, maze) {
    for (const { row, col } of layout.collectibles) {
      const cell = maze[row][col];
      const x = (col + 0.5) * TILE, y = (row + 0.5) * TILE;
      if (cell === 4) {
        ctx.fillStyle = '#d09087';
        ctx.fillRect(col * TILE, row * TILE + TILE * 0.4, TILE, 2);
      } else if (cell === 2 || cell === 3) {
        ctx.fillStyle = cell === 3 ? '#ffe9b2' : '#d4c8a2';
        ctx.beginPath();
        const pulse = frame.reducedMotion ? 0 : Math.sin(frame.time * 2) * 0.6;
        ctx.arc(x, y, cell === 3 ? 4.5 + pulse : 1.8, 0, Math.PI * 2);
        ctx.fill();
        if (cell === 3) {
          ctx.strokeStyle = 'rgba(255, 222, 156, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 7 + pulse, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
  }

  function render(timestamp, state) {
    const delta = previousTime === null ? 0 : Math.max(0, Math.min(100, timestamp - previousTime));
    previousTime = timestamp;
    if (state.gameState !== 'paused') time += delta / 1000;
    const frame = { time, reducedMotion };
    const ctx = surface.getContext('2d');
    ctx.clearRect(0, 0, surface.width, surface.height);
    try { environment.draw(ctx, frame); } catch { useFallback(); fallback.draw(ctx, frame); }
    drawCollectibles(ctx, frame, state.maze);
    const options = { tile: TILE, colors: GHOST_COLORS, dirs: DIRS,
      powerTimer: state.powerTimer, animFrame: reducedMotion ? 0 : state.animFrame, time, reducedMotion };
    BonusLifeArtwork.drawCoin(ctx, state.bonusLife?.coin, options);
    actors.player(ctx, state.player, options);
    actors.ghosts(ctx, state.ghosts, options);
    fallback.drawAtmosphere(ctx, frame);
    BonusLifeArtwork.drawEffect(ctx, state.bonusLife?.effect, options);
  }

  return { init, setMaze, setActors, setEnvironment, render };
})();
