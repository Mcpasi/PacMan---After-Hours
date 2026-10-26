// Actor renderers know nothing about the environment or movement rules.
// Replace either function through GameRenderer.setActors() to introduce a new skin.
const ClassicActors = {
  player(ctx, player, options) {
    PlayerArtwork.draw(ctx, player, options);
  },
  ghosts(ctx, ghosts, options) {
    GhostArtwork.draw(ctx, ghosts, options);
  }
};
