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
  canvas.addEventListener('contextmenu', onContextMenu);
  // Also steer and finish outside the canvas if pointer capture failed.
  window.addEventListener('pointermove', e => {
    if (e.target !== canvas) onPointerMove(e); // Canvas moves already ran before bubbling.
  });
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
  pointerStart = { id: e.pointerId, x: e.clientX, y: e.clientY, dir: null, peak: null,
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
  // Browsers may batch a corner or a reversal into one move. Keep the actual
  // path and its extremes instead of steering only from the final position.
  if (typeof e.getCoalescedEvents === 'function') {
    for (const sample of e.getCoalescedEvents()) {
      if (sample.pointerId === pointerStart.id) updateSwipe(sample);
    }
  }
  updateSwipe(e); // Also works without history, or if it omits the newest point.
}

function updateSwipe(e) {
  let dx = e.clientX - pointerStart.x, dy = e.clientY - pointerStart.y;
  // Measure a reversal from the finger's extreme, including sub-threshold motion,
  // rather than making it cross back over the last accepted command's position.
  if (pointerStart.dir !== null) {
    const horizontal = pointerStart.dir % 2 === 0;
    const position = horizontal ? e.clientX : e.clientY;
    const delta = position - pointerStart.peak;
    const forward = delta * (pointerStart.dir < 2 ? 1 : -1);
    if (forward > 0) pointerStart.peak = position;
    else if (forward < 0) {
      if (horizontal) dx = delta;
      else dy = delta;
    }
  }
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_THRESHOLD) return;
  // Keep the buffered direction while finger drift is too diagonal to be intentional.
  if (Math.max(ax, ay) < Math.min(ax, ay) * SWIPE_AXIS_BIAS) return;
  player.nextDir = ax > ay ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
  player.touchTurn = pointerStart.touch ? player.nextDir : null;
  pointerStart.dir = player.nextDir;
  pointerStart.peak = ax > ay ? e.clientX : e.clientY;
  pointerStart.x = e.clientX;
  pointerStart.y = e.clientY;
}

function onContextMenu(e) {
  // A held finger is a controller, not a request for a browser menu. Keep
  // desktop right-clicks and menus outside active gameplay unchanged.
  if (gameState === 'playing' && player.alive &&
      (pointerStart?.touch || e.pointerType === 'touch' || e.pointerType === 'pen')) e.preventDefault();
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
