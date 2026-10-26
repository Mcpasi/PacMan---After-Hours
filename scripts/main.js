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
      animFrame++;
      updatePlayer();
      if (gameState !== 'playing') break;
      updateGhosts();
      checkCollisions();
    }
  }
  if (gameState !== 'playing') simulationAccumulator = 0;
  GameRenderer.render(ts, { maze, player, ghosts, powerTimer, animFrame, gameState, bonusLife: bonusLife.state });
  // ready message
  if (gameState === 'playing' && animFrame < 90) {
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('READY!', canvas.width/2, canvas.height/2);
  }
  requestAnimationFrame(loop);
}

// start
window.addEventListener('load', init);
