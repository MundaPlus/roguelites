# Neon Depths

Twin-stick room-clearing roguelite (like The Binding of Isaac or Hades). Status: design only. The page is a placeholder.

## Play style

Fast and skill-based. Move with WASD, aim with the mouse, hold the button to shoot. Space dodge-rolls with short i-frames.

## Run loop

1. Each floor is a grid of rooms made by a random walk. The doors lock until the room is clear.
2. Room types: fight, treasure, shop, challenge, boss.
3. Items change how your shots behave: piercing, homing, split on hit, bounce, bigger, faster. Items stack, so builds combine.
4. Beat the floor boss to go deeper. Five floors per run.
5. Neon shards stay after death. Spend them in the hub on permanent upgrades and new starting loadouts.

## Core systems

- **Shot modifiers** as a pipeline: each item adds a step that changes a projectile.
- **Enemies**: chasers, turrets, dashers, splitters, bullet-pattern casters.
- **Bosses**: phases with bullet patterns.
- **Synergies**: some item pairs give a bonus effect.

## Tech plan

- Phaser 3 or a small custom Canvas engine with arcade physics.
- Gamepad support for twin-stick play.
- Room templates as small JSON grids, mixed with random placement.
