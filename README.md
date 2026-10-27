# PacMan - After Hours

**Play it live: https://mcpasi.github.io/PacMan---After-Hours/**

**A modularly designed Pac-Man game, set in a dark atmosphere**

**Play Pac-Man - After Hours now:** In a dark, alternate world, Pac-Man tries to escape the ghosts; he can only temporarily daze them by using his power-ups. Can you reach the power-ups in time, before the ghosts catch you?

**256:** The mistakes of the past have returned; it seems unavoidable.

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

**Fixed:** The simulation now runs on a fixed 60 Hz time step, independent of the rendering FPS.

**Fixed:** After the first two deaths, labyrinth progress and score are retained. A third death results in "Game Over"; restarting resets everything completely. Level transitions remain unchanged.

**Added:**

- One bonus coin per level, appearing at a random, accessible location after 4–10 seconds of active gameplay.
- Antique brass-gold finish, embossed with a Pac-Man design; features rotation, a glowing effect, and a reflection on the ground.
- Collecting it grants an extra life, accompanied by a golden pulse effect and an “+1 LIFE” indicator.
- No bonus coin reappears after losing a life.

**Bug fixed and reproduced**

 - The collection check failed to account for 
   the tunnel wrap. With a width of 112, a 
   player at x=-8 and a coin at x=104 were not 
   recognized as being at the same position. 
 - Fix: scripts/bonus-life.js now accounts for 
   the horizontal wrap. 
 - Verification: Three new regression tests in 
   tests/bonus-life.test.js failed before the 
   fix and pass afterward. 
 - Total tests: 156 passed, one optional 
   browser test skipped.

**Fixed:** Added a full-screen toggle in the top-right corner, including an alternative view for browsers that do not support full-screen mode.

- Improved mobile scaling, especially in 
  landscape orientation.
- The entire map remains visible and 
  undistorted; graphics and game logic 
  remain unchanged.

**Game speed:** The game speed is now 20% lower at the start.

**added:** Upon contact with a ghost, Pac-Man breaks apart into nine flying fragments, accompanied by a splintering sound.

**Fixed**

- More stable touch-based direction detection and more forgiving handling of turns in cases of slightly delayed input. 
- Fixed issues with "tunnel" errors and stale touch inputs following interruptions.

**Touch fixed:**
- Counter-swipe ignored: A 20-px counter-movement was not detected, despite a 12-px threshold. Now, the actual reversal point is what counts.      
- Delayed control outside the area: In a simulated pointer-capture failure, the swipe only took effect upon release. Now, it reacts immediately.

**Offline-capable:** Devices that are not connected to the internet no longer fall back to Canvas, provided that the device is WebGL-capable.

**Test coverage**

Without a browser, browser test is skipped    

`node --test tests/*.test.js`                   
                                                   
With Chromium – all tests 

`PACMAN_BROWSER=chromium node --test tests/*.test.js`


--McPasi--

*The changes in this section are licensed under the MIT License.*

---

## My search for third-party repos and discovering Grok-PacMan

I spent hours sifting through repositories, eventually stumbled upon Grok-PacMan, clicked on the demo page, and was shocked by how badly Pac-Man had been mangled.

In his README, he claimed that tests were in place and that movements, among other things, were properly handled, ensuring the character could move around. This was not the case: the character was stuck inside a wall, the game speed was inconsistent, and the "next level" speed functionality didn't work at all. As for the tests? They consisted of a single HTML file containing only basic logic checks, there were no proper smoke tests to speak of.

There is nothing wrong with using AI agents, and there is no reason to feel ashamed of it; however, an agent should be operated by an experienced user.

## Provenance

The original project comes from https://github.com/marlandoj/grok-PacMan ,it was initially in a very poor state ,Pac-Man would get stuck in a wall, and the game was unplayable.

It should also be mentioned that Pac-Man now uses three.js, which is licensed under the MIT license. You can find the license details in `scripts/vendor/three.module.min.mjs`.

## License

MIT — see [LICENSE](LICENSE).
