## CHANGELOG

**V.0.1.1**

- Ghost collisions overlooked at the tunnel crossing.
- Points/power pellets not collected on the end spaces of the tunnel, verified using a targeted test map.
- Figures at the edge of the tunnel were disappearing: Missing rendering on the opposite side confirmed via pixel comparison. Fixed in scripts/rendering.js.        
- Start screen cut off: At 360 × 360 px, the text and start button extended beyond the visible area. Fixed in css/ui.css.

**v.0.1.2**

*Add:* The AI learns recurring player paths. Pinky and Inky use these to intercept; new habits displace old ones.

- Knowledge is retained upon losing a life or changing levels; starting a new game resets it.