let pointerStart = null;
const KEY_DIRS = { arrowright: 0, d: 0, arrowdown: 1, s: 1, arrowleft: 2, a: 2, arrowup: 3, w: 3 };

function initInput() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onPointerCancel);
}

function onKeyDown(e) {
  const key = e.key.toLowerCase();
  keys[key] = true;
  if (key === 'p' || key === 'escape') {
    if (e.repeat || (gameState !== 'playing' && gameState !== 'paused')) return;
    e.preventDefault();
    if (gameState === 'playing') gameState = 'paused';
    else gameState = 'playing';
    showOverlay(gameState === 'paused' ? 'PAUSED' : null);
    return;
  }
  if (key === 'enter' || key === ' ') {
    e.preventDefault(); // Do not also activate a focused (possibly hidden) button.
    if (e.repeat) return;
    if (gameState === 'title' || gameState === 'gameOver') startGame();
    else if (gameState === 'paused') {
      gameState = 'playing';
      showOverlay(null);
    } else if (gameState === 'levelComplete') {
      gameState = 'playing';
      showOverlay(null);
      resetLevel(false);
      // slight speed increase
      player.speed = Math.min(2.2, player.speed + 0.1);
      ghosts.forEach(g => g.speed = Math.min(1.9, (g.speed||1.4) + 0.08));
    }
  }
  const dir = KEY_DIRS[key];
  if (Number.isInteger(dir)) {
    e.preventDefault();
    if (player && gameState === 'playing') player.nextDir = dir;
  }
}
function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }

function onPointerDown(e) {
  if (gameState !== 'playing' || !player.alive || e.isPrimary === false) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pointerStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!pointerStart || e.pointerId !== pointerStart.id || gameState !== 'playing' || !player.alive) return;
  const dx = e.clientX - pointerStart.x, dy = e.clientY - pointerStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
  player.nextDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
  pointerStart.x = e.clientX;
  pointerStart.y = e.clientY;
}

function onPointerUp(e) {
  onPointerMove(e);
  onPointerCancel(e);
}

function onPointerCancel(e) {
  if (pointerStart && e.pointerId === pointerStart.id) pointerStart = null;
}
