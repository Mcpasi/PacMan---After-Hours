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
  loadMaze();
  GameRenderer.setMaze(maze);
  dotsLeft = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (maze[r][c] === 2 || maze[r][c] === 3) dotsLeft++;
  resetActors();
  bonusLife = BonusLife.create(maze, TILE, { origin: player, ticksPerSecond: SIMULATION_HZ });
}

function resetActors() {
  resetSimulationClock();
  player = {
    x: 13.5 * TILE, y: 22.5 * TILE,
    dir: 0, nextDir: 0, // 0=right,1=down,2=left,3=up
    speed: getLevelSpeed(1.6, 0.1, 2.2), mouth: 0, mouthDir: 1, alive: true
  };
  ghostController = GhostController.create(maze, TILE);
  ghosts = GhostProfiles.create(TILE);
  ghosts.forEach(ghost => { ghost.speed = getLevelSpeed(ghost.speed, 0.08, 1.9); });
  powerMode = false;
  powerTimer = 0;
  ghostEatCombo = 0;
  updateUI();
}

function nextLevel() {
  if (gameState !== 'levelComplete') return;
  level++;
  resetLevel(false);
  gameState = 'playing';
  showOverlay(null);
}

function startGame() {
  initAudio();
  animFrame = 0;
  gameState = 'playing';
  document.getElementById('overlay').style.display = 'none';
  resetLevel(true);
}
