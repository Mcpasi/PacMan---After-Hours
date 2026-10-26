// Actor renderers know nothing about the environment or movement rules.
// Replace either function through GameRenderer.setActors() to introduce a new skin.
const ClassicActors = {
  player(ctx, player, { tile }) {
    if (!player.alive) return;
    const mouth = 0.2 + player.mouth * 0.6;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.dir * Math.PI / 2);
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, tile * 0.45, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  ghosts(ctx, ghosts, options) {
    GhostArtwork.draw(ctx, ghosts, options);
  }
};
