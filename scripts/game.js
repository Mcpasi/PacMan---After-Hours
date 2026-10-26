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
  initInput();
  loadMaze();
  resetLevel(true);
  requestAnimationFrame(loop);
}

function resetLevel(isNewGame = false) {
  loadMaze();
  GameRenderer.setMaze(maze);
  dotsLeft = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (maze[r][c] === 2 || maze[r][c] === 3) dotsLeft++;
  player = {
    x: 13.5 * TILE, y: 22.5 * TILE,
    dir: 0, nextDir: 0, // 0=right,1=down,2=left,3=up
    speed: 1.6, mouth: 0, mouthDir: 1, alive: true
  };
  ghostController = GhostController.create(maze, TILE);
  ghosts = GhostProfiles.create(TILE);
  powerMode = false;
  powerTimer = 0;
  ghostEatCombo = 0;
  if (isNewGame) {
    score = 0;
    lives = 3;
  }
  updateUI();
}

function startGame() {
  initAudio();
  animFrame = 0;
  gameState = 'playing';
  document.getElementById('overlay').style.display = 'none';
  resetLevel(true);
}
