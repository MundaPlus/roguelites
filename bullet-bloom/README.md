# Bullet Bloom

Vertical bullet-hell shooter roguelite (like Touhou-style roguelites / Steredenn). Status: design only. The page is a placeholder.

## Play style

Pattern dodging, not aiming. The screen scrolls up on its own. Enemies fire dense bullet patterns. Your ship fires straight ahead, and your hitbox is a tiny dot in the middle of the ship.

- Hold a key to move slowly and show the hitbox for precise dodging.
- Bullets that pass close to the hitbox graze it and charge the bomb.
- A bomb clears all bullets on the screen.

## Run loop

1. 5 stages, each with a mid-boss and a boss with several spell-card phases.
2. Between stages, choose one of 3 ship parts: spread shot, homing drones, a bigger bomb.
3. Lives and bombs carry over between stages.
4. Clear stage 5 to win. Loop mode after that.

## Core systems

- **Patterns**: data-driven emitters (rings, spirals, aimed bursts) with timing scripts.
- **Collision**: circle vs. point hitbox, spatial grid for thousands of bullets.
- **Ship parts**: main shot, option drones, bomb type, speed.
- **Scoring**: graze count, point items, no-hit bonus.
- **Meta**: unlock ships with different shot types.

## Tech plan

- Canvas 2D with object pools for bullets (no allocation per frame).
- Fixed 60 Hz update, independent from the frame rate.
- Keyboard and gamepad input. Touch: relative drag (the ship moves by the finger delta).
