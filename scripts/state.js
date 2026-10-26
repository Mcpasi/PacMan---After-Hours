// ==================== GAME STATE ====================
const TILE = 16;
let canvas, ctx;
let player, ghosts = [], score = 0, highScore = 0, lives = 3;
let ghostController;
let dotsLeft = 0, powerMode = false, powerTimer = 0, ghostEatCombo = 0;
let gameState = 'title'; // title, playing, paused, levelComplete, gameOver
let animFrame = 0, lastTime = 0;
let keys = {};

const GHOST_COLORS = GhostProfiles.all.map(profile => profile.color);
const GHOST_NAMES = GhostProfiles.all.map(profile => profile.name);
