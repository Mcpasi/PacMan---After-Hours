function loop(ts) {
  animFrame++;
  if (gameState === 'playing') {
    updatePlayer();
    updateGhosts();
    checkCollisions();
  }
  GameRenderer.render(ts, { maze, player, ghosts, powerTimer, animFrame, gameState });
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
