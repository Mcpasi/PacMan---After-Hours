// Stream the arcade track through its own quiet bus; effects keep their full volume.
const BackgroundMusic = (() => {
  const SOURCE = 'sounds/background_sound.mp3';
  const VOLUME = 0.025;

  function create({ createAudio = () => new Audio() } = {}) {
    let audio = null, context = null, source = null, gain = null;

    function pause() {
      try { audio?.pause(); } catch {}
    }

    function release() {
      pause();
      for (const node of [source, gain]) { try { node?.disconnect(); } catch {} }
      audio = context = source = gain = null;
    }

    function play(audioContext) {
      if (!audioContext) return false;
      try {
        if (context !== audioContext) release();
        if (!audio) {
          audio = createAudio();
          audio.src = SOURCE;
          audio.loop = true;
          audio.preload = 'auto';
          context = audioContext;
          source = context.createMediaElementSource(audio);
          gain = context.createGain();
          // Web Audio gain also works on mobile browsers that ignore media volume.
          gain.gain.setValueAtTime(VOLUME, context.currentTime);
          source.connect(gain);
          gain.connect(context.destination);
        }
        if (audio.paused) audio.play()?.catch(() => {});
        return true;
      } catch {
        release(); // Missing media, blocked playback or device failures cannot stop the game.
        return false;
      }
    }

    return { play, pause };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BackgroundMusic;
