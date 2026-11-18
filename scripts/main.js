const SIMULATION_STEP = 1000 / SIMULATION_HZ;
const MAX_FRAME_DELTA = 100;

function resetSimulationClock() {
  lastTime = null;
  simulationAccumulator = 0;
}

function loop(ts) {
  // Bound catch-up after a suspended tab, but retain fractional ticks at any FPS.
  const delta = lastTime === null ? 0 : Math.max(0, Math.min(MAX_FRAME_DELTA, ts - lastTime));
  lastTime = ts;
  if (gameState === 'playing') {
    simulationAccumulator += delta;
    // Timestamp rounding must not defer a tick at exact 60 Hz boundaries.
    while (simulationAccumulator + 1e-7 >= SIMULATION_STEP && gameState === 'playing') {
      simulationAccumulator = Math.max(0, simulationAccumulator - SIMULATION_STEP);
      if (playerDeath) {
        updatePlayerDeath();
        continue;
      }
      animFrame++;
      updatePlayer();
      if (gameState !== 'playing') break;
      updateGhosts();
      checkCollisions();
      if (player.alive) {
        retroWorld.update();
        cherryBonus.update(retroWorld.state);
        level256Glitch.update();
      }
    }
  }
  if (gameState !== 'playing') simulationAccumulator = 0;
  updateWorldClock();
  GameRenderer.render(ts, { maze, player, ghosts, powerTimer, animFrame, gameState,
    bonusLife: bonusLife.state, playerDeath: playerDeath?.state,
    cherryBonus: cherryBonus.state,
    freezePowerUps: freezePowerUps.state,
    retroWorld: retroWorld.state,
    level256Glitch: player.alive && (gameState === 'playing' || gameState === 'paused')
      ? level256Glitch.state.effect : null });
  // ready message
  if (gameState === 'playing' && player.alive && animFrame < 90) {
    ctx.save();
    ctx.fillStyle = '#ffff00';
    ctx.font = `bold ${Math.round(25 * canvas.width / (canvas.clientWidth || canvas.width))}px monospace`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#101922';
    ctx.lineWidth = 4;
    ctx.strokeText('READY!', canvas.width / 2, canvas.height / 2);
    ctx.fillText('READY!', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
  requestAnimationFrame(loop);
}

// start
window.addEventListener('load', init);
