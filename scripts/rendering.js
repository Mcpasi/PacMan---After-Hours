const GameRenderer = (() => {
  let fallback, environment, layout, surface, view, glitchArtwork, retroCity, overview;
  let actors = { ...ClassicActors };
  let time = 0, previousTime = null, generation = 0;
  let motionPreference;
  const createCanvas = () => document.createElement('canvas');

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
    motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    fallback = CanvasCity.create({ createCanvas });
    overview = CityOverview.create(document.getElementById('mazeOverview'), createCanvas);
    setEnvironment(fallback);
    // Both modules are bundled locally, so GPU rendering also works offline.
    if (!window.WebGLRenderingContext && !window.WebGL2RenderingContext) return;
    const request = generation;
    Promise.all([
      import('./rendering/city-three.mjs'),
      import('./vendor/three.module.min.mjs')
    ]).then(([{ createCityScene }, three]) => {
      if (generation !== request) return;
      const scene = createCityScene({ three, canvas, architecture: CityArchitecture,
        paintGround: CanvasCity.paintGround, onFailure: useFallback });
      try { setEnvironment(scene); } catch (error) { scene.dispose(); throw error; }
    }).catch(() => { /* Missing modules and unsupported GPUs use the complete Canvas city. */ });
  }

  function setMaze(maze) {
    layout = CityLayout.create(maze, TILE);
    glitchArtwork = Level256GlitchArtwork.create(layout);
    retroCity = null;
    overview.setLayout(layout);
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
        ctx.fillStyle = '#e6a292';
        ctx.fillRect(col * TILE, row * TILE + TILE * 0.375, TILE, 2);
      } else if (cell === 2 || cell === 3) {
        ctx.fillStyle = cell === 3 ? '#fff0be' : '#e6d4ad';
        ctx.beginPath();
        const pulse = frame.reducedMotion ? 0 : Math.sin(frame.time * 2) * 0.6;
        ctx.arc(x, y, cell === 3 ? 4.5 + pulse : 2.2, 0, Math.PI * 2);
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

  function drawRetroWorld(ctx, state, view, options) {
    const mix = state.retroWorld?.mix || 0;
    surface.dataset.world = mix > 0 ? 'retro' : 'city';
    if (mix <= 0) return;
    retroCity ||= RetroCityArtwork.create(layout, createCanvas);
    const retroOptions = { ...options, world: 'retro' };
    retroCity.draw(ctx, view, surface, Math.min(1, mix), {
      ground: layer => RetroWorldArtwork.drawCollectibles(layer, state.maze, layout),
      actors: layer => drawSpriteLayer(layer, state, retroOptions)
    });
  }

  function drawDeath(ctx, state, options, draw) {
    draw(ctx, state.playerDeath, options);
    if (state.playerDeath) {
      // Flying fragments reach farther than an intact actor's one-tile margin.
      drawTunnelCopy(ctx, tunnelOffset(state.playerDeath, state.maze, TILE * 3),
        () => draw(ctx, state.playerDeath, options));
    }
  }

  function drawSpriteLayer(ctx, state, options) {
    const retro = options.world === 'retro';
    BonusLifeArtwork.drawCoin(ctx, state.bonusLife?.coin, options);
    FreezePowerUpArtwork.drawPickups(ctx, state.freezePowerUps, options);
    if (retro) CherryBonusArtwork.draw(ctx, state.cherryBonus?.fruit, options);
    // Clip at the grid edges, where the two tunnel mouths split a wrapped sprite.
    ctx.save();
    ctx.beginPath(); ctx.rect(0, -TILE * 3, layout.width, layout.height + TILE * 6); ctx.clip();
    drawActors(ctx, state, options, retro ? RetroWorldArtwork : actors);
    drawDeath(ctx, state, options, retro ? RetroWorldArtwork.death : PlayerDeathArtwork.draw);
    ctx.restore();
    const lifeEffect = retro ? RetroWorldArtwork.lifeEffect : BonusLifeArtwork.drawEffect;
    lifeEffect(ctx, state.bonusLife?.effect, options);
  }

  function drawCity(ctx, state, frame, options, glitch) {
    try { environment.draw(ctx, frame); } catch { useFallback(); fallback.draw(ctx, frame); }
    fallback.drawAtmosphere(ctx, frame);
    ctx.save();
    CityView.transform(ctx, frame.view);
    // Keep the corruption on the city plane, beneath collectibles and actors.
    glitchArtwork.draw(ctx, glitch);
    drawCollectibles(ctx, frame, state.maze);
    ctx.restore();

    ctx.save();
    CityView.transform(ctx, frame.view, frame.view.spriteHeight);
    drawSpriteLayer(ctx, state, options);
    ctx.restore();
  }

  function fitSurface(player) {
    const { clientWidth, clientHeight } = surface;
    const width = clientWidth || layout.width, height = clientHeight || layout.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const pixelsWide = Math.round(width * ratio), pixelsHigh = Math.round(height * ratio);
    if (surface.width !== pixelsWide) surface.width = pixelsWide;
    if (surface.height !== pixelsHigh) surface.height = pixelsHigh;
    return CityView.frame(layout.view, width, height, player, { allowTracking: !!(clientWidth && clientHeight) });
  }

  function render(timestamp, state) {
    const delta = previousTime === null ? 0 : Math.max(0, Math.min(100, timestamp - previousTime));
    previousTime = timestamp;
    if (state.gameState !== 'paused') time += delta / 1000;
    const reducedMotion = !!motionPreference?.matches;
    const glitch = glitchArtwork.frame(state.level256Glitch, { reducedMotion });
    view = fitSurface(state.player);
    const frame = { time, reducedMotion, lampLevels: glitch?.lampLevels, view };
    const ctx = surface.getContext('2d');
    ctx.clearRect(0, 0, surface.width, surface.height);
    ctx.save();
    ctx.scale(surface.width / view.width, surface.height / view.height);
    const options = { tile: TILE, colors: GHOST_COLORS, dirs: DIRS,
      powerTimer: state.powerTimer, animFrame: reducedMotion ? 0 : state.animFrame, time, reducedMotion,
      frozen: state.freezePowerUps?.remainingTicks > 0 };
    drawCity(ctx, state, frame, options, glitch);
    drawRetroWorld(ctx, state, view, options);
    FreezePowerUpArtwork.drawStatus(ctx, state.freezePowerUps, { ...options, tile: 24, width: view.width });
    ctx.restore();
    overview.draw(view, state, GHOST_COLORS);
  }

  return { init, setMaze, setActors, setEnvironment, render, getView: () => view };
})();
