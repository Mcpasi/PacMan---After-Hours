// ==================== GAME STATE ====================
const TILE = 16;
// Actor speeds and timers use simulation ticks, never rendered frames.
const SIMULATION_HZ = 60;
let canvas, ctx;
let player, ghosts = [], score = 0, highScore = 0, lives = 3;
let level = 1;
let ghostController;
let bonusLife;
let playerDeath = null;
let dotsLeft = 0, powerMode = false, powerTimer = 0, ghostEatCombo = 0;
let gameState = 'title'; // title, playing, paused, levelComplete, gameOver
let animFrame = 0, lastTime = null, simulationAccumulator = 0;
let keys = {};

const GHOST_COLORS = GhostProfiles.all.map(profile => profile.color);
const GHOST_NAMES = GhostProfiles.all.map(profile => profile.name);
