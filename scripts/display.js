const GameDisplay = (() => {
  let container, button, expanded = false, pending = false;

  function nativeElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }

  function setExpanded(active) {
    expanded = active;
    container.classList.toggle('is-expanded', active);
    document.body.classList.toggle('game-expanded', active);
    button.setAttribute('aria-pressed', String(active));
    const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  async function toggle() {
    if (pending) return;
    pending = true;
    try {
      if (expanded) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (nativeElement() === container && exit) await exit.call(document);
        setExpanded(nativeElement() === container);
      } else {
        // Also works on iPhones and in embeds that cannot enter native fullscreen.
        setExpanded(true);
        const request = container.requestFullscreen || container.webkitRequestFullscreen;
        if (request) {
          try { await request.call(container); } catch { /* Keep the expanded in-page view. */ }
        }
      }
    } catch {
      // A refused exit must leave the control in sync with the actual browser state.
      setExpanded(nativeElement() === container);
    } finally {
      pending = false;
    }
  }

  function init() {
    container = document.getElementById('gameContainer');
    button = document.getElementById('fullscreenBtn');
    button.addEventListener('click', toggle);
    const sync = () => setExpanded(nativeElement() === container);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !expanded || nativeElement() === container) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle();
    }, true);
  }

  return { init };
})();
