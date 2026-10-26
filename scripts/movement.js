// ==================== MOVEMENT & COLLISION ====================
const DIRS = [[1,0],[0,1],[-1,0],[0,-1]];

function canMove(x, y, dir, isGhost = false) {
  const nx = x + DIRS[dir][0] * TILE * 0.6;
  const ny = y + DIRS[dir][1] * TILE * 0.6;
  const c = Math.floor(nx / TILE);
  const r = Math.floor(ny / TILE);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true; // tunnel
  const cell = maze[r][c];
  if (cell === 0) return false;
  if (cell === 4 && !isGhost) return false; // player can't enter door
  return true;
}

function updatePlayer() {
  if (!player.alive) return;
  // Move up to each tile center before turning. Snapping after every small
  // step can round the player back to the same center forever.
  const epsilon = 1e-6;
  let remaining = player.speed;
  while (remaining > epsilon) {
    const cx = Math.floor(player.x / TILE) * TILE + TILE/2;
    const cy = Math.floor(player.y / TILE) * TILE + TILE/2;
    const centered = Math.abs(player.x - cx) < epsilon && Math.abs(player.y - cy) < epsilon;
    if (centered) {
      player.x = cx; player.y = cy;
      if (canMove(cx, cy, player.nextDir)) player.dir = player.nextDir;
      if (!canMove(cx, cy, player.dir)) break;
    } else if (player.nextDir === (player.dir + 2) % 4) {
      player.dir = player.nextDir; // Reversing within a corridor is always safe.
    }

    const axis = player.dir % 2 === 0 ? 'x' : 'y';
    const sign = DIRS[player.dir][axis === 'x' ? 0 : 1];
    let target = Math.floor(player[axis] / TILE) * TILE + TILE/2;
    if ((target - player[axis]) * sign < epsilon) target += sign * TILE;
    const distance = Math.abs(target - player[axis]);
    const step = Math.min(remaining, distance);
    player[axis] = step === distance ? target : player[axis] + sign * step;
    remaining -= step;

    // Preserve progress through the tunnel rather than snapping it away.
    if (player.x < -TILE/2) player.x += COLS * TILE;
    if (player.x > COLS * TILE - TILE/2) player.x -= COLS * TILE;
  }
  // mouth
  player.mouth += player.mouthDir * 0.3;
  if (player.mouth > 0.4 || player.mouth < 0) player.mouthDir *= -1;
  // eat
  const c = Math.floor(player.x / TILE);
  const r = Math.floor(player.y / TILE);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
    if (maze[r][c] === 2) {
      maze[r][c] = 1;
      score += 10;
      dotsLeft--;
      playChomp();
      updateUI();
    } else if (maze[r][c] === 3) {
      maze[r][c] = 1;
      score += 50;
      dotsLeft--;
      powerMode = true;
      powerTimer = 8 * SIMULATION_HZ; // Eight seconds, independent of rendering FPS.
      ghostEatCombo = 0;
      ghosts.forEach(g => {
        if (g.mode === 'house' || g.mode === 'eyes') return;
        if (!g.scared) g.reversePending = true;
        g.scared = true;
      });
      playPower();
      updateUI();
    }
  }
  if (dotsLeft <= 0) {
    gameState = 'levelComplete';
    showOverlay('LEVEL COMPLETE!', 'Press Enter or click to continue', 'NEXT LEVEL');
  }
}

function updateGhosts() {
  ghostController.update(ghosts, player, powerMode);
  if (powerMode) {
    powerTimer--;
    if (powerTimer <= 0) {
      powerMode = false;
      ghosts.forEach(g => { g.scared = false; g.reversePending = false; });
    }
  }
}

function checkCollisions() {
  if (!player.alive) return;
  ghosts.forEach(g => {
    if (!player.alive || g.mode === 'house' || g.mode === 'eyes') return;
    const dist = Math.hypot(player.x - g.x, player.y - g.y);
    if (dist < TILE * 0.7) {
      if (g.scared) {
        // eat ghost
        g.mode = 'eyes';
        g.scared = false;
        g.reversePending = false;
        const pts = [200,400,800,1600][Math.min(ghostEatCombo, 3)];
        score += pts;
        ghostEatCombo++;
        playGhostEat();
        updateUI();
      } else {
        // die
        player.alive = false;
        lives--;
        playDeath();
        updateUI();
        setTimeout(() => {
          if (lives <= 0) {
            gameState = 'gameOver';
            showOverlay('GAME OVER', `Final Score: ${score}`, 'RESTART');
          } else {
            resetLevel(false);
            player.alive = true;
          }
        }, 1500);
      }
    }
  });
}
