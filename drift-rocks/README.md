# Drift Rocks

Inertia space shooter roguelite (like Asteroids roguelites). Status: design only. The page is a placeholder.

## Play style

Inertia flight in a wrap-around field. Your ship turns and thrusts. It keeps moving until you thrust the other way.

- Big rocks split into smaller rocks when shot.
- Saucers hunt you and shoot back.
- The screen wraps at the edges.

## Run loop

1. Waves get bigger and faster. Every 5 waves a boss appears.
2. Between waves, pick an upgrade: rear gun, shield, mines, a tractor beam.
3. Credits from rocks buy upgrades in the dock.
4. The run ends when the last ship is lost.

## Core systems

- **Physics**: velocity, drag (optional), wrap-around, circle collision.
- **Rocks**: size, HP, split rule, special rocks (metal, explosive).
- **Weapons**: fire rate, spread, lifetime.
- **Enemies**: saucers, mines, homing drones.
- **Meta**: unlock hulls with different handling.

## Tech plan

- Canvas 2D with vector graphics.
- Fixed-step update.
- Keyboard, gamepad, and a touch layout with a stick and buttons.
