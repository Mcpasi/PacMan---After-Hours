function showOverlay(title, msg = '', btn = 'CONTINUE') {
  const ov = document.getElementById('overlay');
  if (!title) { ov.style.display = 'none'; return; }
  ov.style.display = 'flex';
  ov.innerHTML = `<h1>${title}</h1><p>${msg}</p><button id="ovBtn">${btn}</button>`;
  document.getElementById('ovBtn').onclick = () => {
    if (gameState === 'paused') { gameState = 'playing'; resetSimulationClock(); showOverlay(null); }
    else if (gameState === 'gameOver' || gameState === 'title') startGame();
    else if (gameState === 'levelComplete') nextLevel();
  };
}

function updateUI() {
  document.getElementById('score').textContent = 'SCORE: ' + score;
  if (score > highScore) {
    highScore = score;
    try {
      localStorage.setItem('pacmanHigh', highScore);
    } catch {
      // Keep the in-memory score even when persistence is unavailable.
    }
    document.getElementById('highScore').textContent = 'HIGH: ' + highScore;
  }
  const livesEl = document.getElementById('lives');
  livesEl.innerHTML = '';
  for (let i = 0; i < lives; i++) {
    const d = document.createElement('canvas');
    d.className = 'life';
    d.width = d.height = 24;
    d.ariaHidden = 'true';
    PlayerArtwork.draw(d.getContext('2d'), { x: 12, y: 12, dir: 0, mouth: 0.4, alive: true },
      { tile: 24, reducedMotion: true });
    livesEl.appendChild(d);
  }
}
