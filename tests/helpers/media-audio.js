function createMediaAudio({ playback = 'playing' } = {}) {
  return {
    src: '', loop: false, preload: '', volume: 1, paused: true, currentTime: 0, plays: 0, pauses: 0, playback,
    play() {
      this.plays++;
      if (this.playback === 'throws') throw new Error('Media playback unavailable');
      this.paused = this.playback === 'blocked';
      return this.paused ? Promise.reject(new Error('Media playback blocked')) : Promise.resolve();
    },
    pause() { this.paused = true; this.pauses++; }
  };
}

module.exports = { createMediaAudio };
