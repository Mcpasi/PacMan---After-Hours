function init() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  GameRenderer.init(canvas);
  try {
    highScore = Math.max(0, parseInt(localStorage.getItem('pacmanHigh'), 10) || 0);
  } catch {
    highScore = 0; // Storage can be blocked in private or embedded browsers.
  }
  document.getElementById('highScore').textContent = 'HIGH: ' + highScore;
  document.getElementById('startBtn').addEventListener('click', startGame);
  GameDisplay.init();
  initInput();
  loadMaze();
  resetLevel(true);
  requestAnimationFrame(loop);
}

function getLevelSpeed(base, increment, maximum) {
  // Derive from the level, not the previous actor: respawns keep their pace
  // and repeated transitions cannot accumulate floating-point drift.
  return Math.min(maximum, Math.round((base + (level - 1) * increment) * 100) / 100);
}

function resetLevel(isNewGame = false) {
  if (isNewGame) {
    level = 1;
    score = 0;
    lives = 3;
  }
  if (isNewGame || !retroWorld) retroWorld = RetroWorld.create({ ticksPerSecond: SIMULATION_HZ });
  if (isNewGame || !level256Glitch) level256Glitch = Level256Glitch.create({
    ticksPerSecond: SIMULATION_HZ, onStart: () => retroWorld.trigger()
  });
  if (isNewGame || !ghostLearning) ghostLearning = GhostLearning.create();
  loadMaze();
  GameRenderer.setMaze(maze);
  dotsLeft = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (maze[r][c] === 2 || maze[r][c] === 3) dotsLeft++;
  resetActors();
  bonusLife = BonusLife.create(maze, TILE, { origin: player, ticksPerSecond: SIMULATION_HZ });
  if (isNewGame || !cherryBonus) cherryBonus = CherryBonus.create(maze, TILE, { origin: player });
  else cherryBonus.setMaze(maze, { origin: player });
  cherryBonus.update(retroWorld.state);
  const cherryPosition = cherryBonus.position;
  freezePowerUps = FreezePowerUps.create(maze, TILE, { origin: player, ticksPerSecond: SIMULATION_HZ,
    reserved: cherryPosition ? [cherryPosition] : [] });
}

function resetActors() {
  resetPointerInput();
  resetSimulationClock();
  playerDeath = null;
  freezePowerUps?.resetEffect();
  player = {
    x: 13.5 * TILE, y: 22.5 * TILE,
    dir: 0, nextDir: 0, touchTurn: null, // 0=right,1=down,2=left,3=up
    speed: getLevelSpeed(1.3, 0.1, 2.2), mouth: 0, mouthDir: 1, alive: true
  };
  ghostController = GhostController.create(maze, TILE, { learning: ghostLearning });
  ghosts = GhostProfiles.create(TILE);
  ghosts.forEach(ghost => { ghost.speed = getLevelSpeed(ghost.speed, 0.08, 1.9); });
  powerMode = false;
  powerTimer = 0;
  ghostEatCombo = 0;
  updateUI();
}

function updatePlayerDeath() {
  if (!playerDeath || !playerDeath.update()) return;
  playerDeath = null;
  if (lives <= 0) {
    gameState = 'gameOver';
    showOverlay('GAME OVER', `Final Score: ${score}`, 'RESTART');
  } else {
    resetActors();
  }
}

function nextLevel() {
  if (gameState !== 'levelComplete') return;
  level++;
  resetLevel(false);
  gameState = 'playing';
  showOverlay(null);
}

function startGame() {
  animFrame = 0;
  gameState = 'playing';
  showOverlay(null);
  resetLevel(true);
}
