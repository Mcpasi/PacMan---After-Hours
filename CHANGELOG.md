## CHANGELOG

**V.0.1.1**

- Ghost collisions overlooked at the tunnel crossing.
- Points/power pellets not collected on the end spaces of the tunnel, verified using a targeted test map.
- Figures at the edge of the tunnel were disappearing: Missing rendering on the opposite side confirmed via pixel comparison. Fixed in scripts/rendering.js.        
- Start screen cut off: At 360 × 360 px, the text and start button extended beyond the visible area. Fixed in css/ui.css.

**v.0.1.2**

*Add:* The AI learns recurring player paths. Pinky and Inky use these to intercept; new habits displace old ones.

- Knowledge is retained upon losing a life or changing levels; starting a new game resets it.

**v.0.1.3**

 **Swipe controls improved:**

- Rapid turns and reversal movements are detected more reliably.               
- Long-press menus and text selection no longer interfere with the play area.

**v.0.1.5** 

**Add:** After each glitch, there is a slow transition to the 1980 look; it remains for 30 seconds with “1980” on the clock, before fading back.

**v.0.1.6**

**Add:** Rusty lantern and ice-covered pocket watch, one of each per level.

- Both freeze all spirits for 4 seconds.

**Add:** A somber background music was added.

**v.0.1.7**

**Add:** The 1980s world now uses crisp 8-bit pixel graphics for the maze, characters, coins, and power-ups. The game mechanics and world-switching remain unchanged.

**v.0.1.8**

**Fix** fix: a bug in the ghost AI and in the learning logic fixed

**v.0.1.9**

**Fix** 

- Death animation at the edge of the tunnel: The opposite side was completely missing. 

- Tunnel copies now show the missing fragments: 0 → 154 pixels. '+1 LIFE' at the top edge: The ascending text was cut off. position limit now receives 423 instead of 219 pixels.

- Death effect: Modern brass fragments produced 330 pixels outside the arcade palette.  

- Extra life effect: Gradients and smoothed fonts produced 1,295 of these pixels