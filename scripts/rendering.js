const GameRenderer = (() => {
  let fallback, environment, layout, surface, glitchArtwork, retroArtwork, retroSurface;
  let actors = { ...ClassicActors };
  let time = 0, previousTime = null, generation = 0;
  let motionPreference;

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
    retroSurface = document.createElement('canvas');
    motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
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
    glitchArtwork = Level256GlitchArtwork.create(layout);
    retroArtwork = RetroWorldArtwork.create(maze, TILE, { createCanvas: () => document.createElement('canvas') });
    retroSurface.width = layout.width;
    retroSurface.height = layout.height;
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

  function tunnelOffset(actor, maze, margin = TILE) {
    const row = maze[Math.floor(actor.y / TILE)];
    if (!row || row[0] === 0 || row[row.length - 1] === 0) return 0;
    if (actor.x < margin) return layout.width;
    if (actor.x > layout.width - margin) return -layout.width;
    return 0;
  }

  function drawTunnelCopy(ctx, offset, draw) {
    if (!offset) return;
    ctx.save(); ctx.translate(offset, 0);
    draw();
    ctx.restore();
  }

  function drawActors(ctx, state, options, skin) {
    skin.player(ctx, state.player, options);
    drawTunnelCopy(ctx, tunnelOffset(state.player, state.maze), () => skin.player(ctx, state.player, options));
    skin.ghosts(ctx, state.ghosts, options);
    FreezePowerUpArtwork.drawFrozenGhosts(ctx, state.ghosts, options);
    for (const offset of [layout.width, -layout.width]) {
      const wrapped = state.ghosts.filter(ghost => tunnelOffset(ghost, state.maze) === offset);
      if (wrapped.length) drawTunnelCopy(ctx, offset, () => {
        skin.ghosts(ctx, wrapped, options);
        FreezePowerUpArtwork.drawFrozenGhosts(ctx, wrapped, options);
      });
    }
  }

  function drawRetroWorld(ctx, state, options) {
    const mix = state.retroWorld?.mix || 0;
    surface.dataset.world = mix > 0 ? 'retro' : 'city';
    if (mix <= 0) return;
    // Blend a complete opaque scene, so sprites, rain and GPU scenery fade together.
    const retroContext = retroSurface.getContext('2d');
    retroContext.imageSmoothingEnabled = false;
    retroArtwork.drawMaze(retroContext, state.maze);
    const retroOptions = { ...options, world: 'retro' };
    BonusLifeArtwork.drawCoin(retroContext, state.bonusLife?.coin, retroOptions);
    FreezePowerUpArtwork.drawPickups(retroContext, state.freezePowerUps, retroOptions);
    CherryBonusArtwork.draw(retroContext, state.cherryBonus?.fruit, retroOptions);
    drawActors(retroContext, state, retroOptions, RetroWorldArtwork);
    drawFeedback(retroContext, state, retroOptions, RetroWorldArtwork);
    ctx.save(); ctx.globalAlpha = Math.min(1, mix);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(retroSurface, 0, 0); ctx.restore();
  }

  function drawFeedback(ctx, state, options, skin) {
    skin.death(ctx, state.playerDeath, options);
    if (state.playerDeath) {
      // Flying fragments reach farther than an intact actor's one-tile margin.
      drawTunnelCopy(ctx, tunnelOffset(state.playerDeath, state.maze, TILE * 3),
        () => skin.death(ctx, state.playerDeath, options));
    }
    skin.lifeEffect(ctx, state.bonusLife?.effect, options);
  }

  function render(timestamp, state) {
    const delta = previousTime === null ? 0 : Math.max(0, Math.min(100, timestamp - previousTime));
    previousTime = timestamp;
    if (state.gameState !== 'paused') time += delta / 1000;
    const reducedMotion = !!motionPreference?.matches;
    const glitch = glitchArtwork.frame(state.level256Glitch, { reducedMotion });
    const frame = { time, reducedMotion, lampLevels: glitch?.lampLevels };
    const ctx = surface.getContext('2d');
    ctx.clearRect(0, 0, surface.width, surface.height);
    try { environment.draw(ctx, frame); } catch { useFallback(); fallback.draw(ctx, frame); }
    // Corruption stays in the scenery: pellets, bonuses and every actor remain readable.
    glitchArtwork.draw(ctx, glitch);
    drawCollectibles(ctx, frame, state.maze);
    const options = { tile: TILE, colors: GHOST_COLORS, dirs: DIRS,
      powerTimer: state.powerTimer, animFrame: reducedMotion ? 0 : state.animFrame, time, reducedMotion,
      frozen: state.freezePowerUps?.remainingTicks > 0 };
    BonusLifeArtwork.drawCoin(ctx, state.bonusLife?.coin, options);
    FreezePowerUpArtwork.drawPickups(ctx, state.freezePowerUps, options);
    drawActors(ctx, state, options, actors);
    fallback.drawAtmosphere(ctx, frame);
    drawFeedback(ctx, state, options, { death: PlayerDeathArtwork.draw, lifeEffect: BonusLifeArtwork.drawEffect });
    drawRetroWorld(ctx, state, options);
    FreezePowerUpArtwork.drawStatus(ctx, state.freezePowerUps, { ...options, width: layout.width });
  }

  return { init, setMaze, setActors, setEnvironment, render };
})();
