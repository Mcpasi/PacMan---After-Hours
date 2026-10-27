let pointerStart = null;
const SWIPE_THRESHOLD = 12;
const SWIPE_AXIS_BIAS = 1.25;
const KEY_DIRS = { arrowright: 0, d: 0, arrowdown: 1, s: 1, arrowleft: 2, a: 2, arrowup: 3, w: 3 };

function initInput() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onPointerCancel);
  // Also finish outside the canvas if the browser could not capture the pointer.
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('blur', resetPointerInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetPointerInput();
  });
}

function onKeyDown(e) {
  const key = e.key.toLowerCase();
  keys[key] = true;
  if (key === 'p' || key === 'escape') {
    if (e.repeat || (gameState !== 'playing' && gameState !== 'paused')) return;
    e.preventDefault();
    if (gameState === 'playing') gameState = 'paused';
    else gameState = 'playing';
    resetSimulationClock();
    showOverlay(gameState === 'paused' ? 'PAUSED' : null);
    return;
  }
  if (key === 'enter' || key === ' ') {
    if (e.target === document.getElementById('fullscreenBtn')) return;
    e.preventDefault(); // Do not also activate a focused (possibly hidden) button.
    if (e.repeat) return;
    if (gameState === 'title' || gameState === 'gameOver') startGame();
    else if (gameState === 'paused') {
      gameState = 'playing';
      resetSimulationClock();
      showOverlay(null);
    } else if (gameState === 'levelComplete') nextLevel();
  }
  const dir = KEY_DIRS[key];
  if (Number.isInteger(dir)) {
    e.preventDefault();
    if (player && gameState === 'playing') {
      player.nextDir = dir;
      player.touchTurn = null;
    }
  }
}
function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }

function onPointerDown(e) {
  if (pointerStart || gameState !== 'playing' || !player.alive || e.isPrimary === false) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pointerStart = { id: e.pointerId, x: e.clientX, y: e.clientY,
    touch: e.pointerType === 'touch' || e.pointerType === 'pen' };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Some browsers retire the pointer before capture; window still handles release.
  }
}

function onPointerMove(e) {
  if (!pointerStart || e.pointerId !== pointerStart.id) return;
  if (gameState !== 'playing' || !player.alive) { resetPointerInput(); return; }
  const dx = e.clientX - pointerStart.x, dy = e.clientY - pointerStart.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_THRESHOLD) return;
  // Keep the buffered direction while finger drift is too diagonal to be intentional.
  if (Math.max(ax, ay) < Math.min(ax, ay) * SWIPE_AXIS_BIAS) return;
  player.nextDir = ax > ay ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
  player.touchTurn = pointerStart.touch ? player.nextDir : null;
  pointerStart.x = e.clientX;
  pointerStart.y = e.clientY;
}

function onPointerUp(e) {
  onPointerMove(e);
  onPointerCancel(e);
}

function onPointerCancel(e) {
  if (pointerStart && e.pointerId === pointerStart.id) resetPointerInput();
}

function resetPointerInput() {
  const pointer = pointerStart;
  pointerStart = null; // Clear first: releasing capture may synchronously report its loss.
  if (!pointer) return;
  try {
    if (canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
  } catch {
    // Capture may already have ended as the page lost focus.
  }
}
