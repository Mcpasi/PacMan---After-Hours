// ==================== AUDIO ====================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
const backgroundMusic = BackgroundMusic.create();
function initAudio() {
  if (!AudioCtx) return;
  try {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch {
    audioCtx = null; // Sound is optional; unavailable audio must not block Start.
  }
}
function updateBackgroundMusic() {
  if (gameState !== 'playing' || document.hidden) {
    backgroundMusic.pause();
    return;
  }
  initAudio();
  backgroundMusic.play(audioCtx);
}
function playTone(freq, duration, type = 'square', vol = 0.08) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    audioCtx = null;
  }
}
function playChomp() { playTone(400 + Math.random()*100, 0.06, 'square', 0.05); }
function playPower() { playTone(200, 0.3, 'sawtooth', 0.1); playTone(300, 0.3, 'sawtooth', 0.08); }
function playDeath() {
  if (!PlayerDeathSound.play(audioCtx)) audioCtx = null;
}
function playGhostEat() { playTone(600, 0.1, 'square', 0.1); }
