# PacMan - After Hours

**Play it live: https://mcpasi.github.io/PacMan---After-Hours/**

**A modularly designed Pac-Man game, set in a dark atmosphere**

**Play Pac-Man - After Hours now:** In a dark, alternate world, Pac-Man tries to escape the ghosts; he can only temporarily daze them by using his power-ups. Can you reach the power-ups in time, before the ghosts catch you?

## How to play

- **Move:** Arrow keys or WASD
- **Pause:** P or Esc
- **Start:** the START GAME button (or restart from the game-over / level-complete overlays)
- Eat every dot to clear the level. The four large power pellets make the ghosts vulnerable for a short time — eat them for escalating points (200 → 400 → 800 → 1600). You have 3 lives.
---

**Touchcontrol:** Mobile controls added, simply use your screen to operate Pac-Man.

**Redesign:** The entire world of Pac-Man has been redesigned; play Pac-Man in a gloomy city, illuminated by streetlights, as you try to escape the ghosts.

**Pac-Man has been given a new design:** dark brass/amber look with soot shadows, glowing cracks, and a narrow glowing eye, includes matching life symbols and a power-glow effect.

**Navigation/AI opponents:** All four ghosts now have their own navigation system, and the enemy AI has been fundamentally overhauled.

- *Blinky:* direct, fast pursuit.            
- *Pinky:* intercepts Pac-Man by getting ahead of him.             
- *Inky:* flanks from the side opposite Blinky.
- *Clyde:* searches the area behind.

All four ghosts have also received a new design and new colors from me.

**Next Level and Game Speed:** The game speed has been standardized; losing health affects the game tempo, while starting a new game resets it.

- "Next Level": The Enter and Space keys both trigger a level transition.
- Players and ghosts become faster with each level, up to their respective maximum limits.
- Ghosts actually utilize this calculated speed.
- Losing a life preserves the current level speed; starting a new game resets it.

**Offline-capable:** Devices that are not connected to the internet no longer fall back to Canvas, provided that the device is WebGL-capable.

**Test coverage**

Without a browser, browser test is skipped    

`node --test tests/*.test.js`                   
                                                   
With Chromium – all tests 

`PACMAN_BROWSER=chromium node --test tests/*.test.js`


--McPasi--

*The changes in this section are licensed under the MIT License.*

---

## What's inside

- Classic-style tile maze with walls, dots, four power pellets, a central ghost house with staggered ghost exits, and wrap-around tunnel exits on the left and right.
- Four ghosts — Blinky, Pinky, Inky, and Clyde — each with its own simple AI behaviour (direct chase, ambush, flank, and a shy/random style), vulnerable mode after a power pellet, and eyes that return to the house to regenerate after being eaten.
- Score and high score (persisted in `localStorage`), lives display, title / level-complete / game-over overlays, and pause.
- Pac-Man mouth and ghost animations on an HTML5 Canvas, and sound effects synthesized with the Web Audio API — no audio files, no external requests.


## Provenance

The original project comes from https://github.com/marlandoj/grok-PacMan ,it was initially in a very poor state ,Pac-Man would get stuck in a wall, and the game was unplayable.

It should also be mentioned that Pac-Man now uses three.js, which is licensed under the MIT license. You can find the license details in `scripts/vendor/three.module.min.mjs`.

## License

MIT — see [LICENSE](LICENSE).
