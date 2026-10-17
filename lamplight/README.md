# Lamplight

New-concept roguelite: move the lights, shadows fight. Status: design only. The page is a placeholder.

You never move your units. Move the lamps. The shadows fight.

## Play style

Tactics through light. Your figures stand still on a grid. You move 2–3 lamps. Each figure casts a shadow away from each lamp, and the shadows do the fighting.

- A shadow that touches an enemy figure or an enemy shadow deals damage.
- Walls block light. A figure with no lamp near it casts no shadow.
- Enemies carry their own lamps, which also change your shadows.
- One lamp move changes every shadow on the board at once.

## Run loop

1. Floors of small rooms. Clear all enemies in a room to go on.
2. After a room, choose a new lamp type, a new figure or an upgrade.
3. Lamp types: candle (short shadows), lantern, colored light (heals your figures), flicker lamp (random), moon (far away, long shadows).
4. 3 acts with a boss each. Bosses are large figures with strange shapes.

## Core systems

- **Grid**: tiles, walls, figures, lamps.
- **Shadow casting**: shadow length from lamp distance and height, blocked by walls.
- **Combat**: shadow contact damage, figure HP, enemy lamp movement.
- **Preview**: shows all shadows for the lamp position under the pointer.
- **Meta**: unlock lamp types and figures.

## Tech plan

- Canvas 2D with soft shadow polygons over a grid.
- Pure shadow function `(board, lamps) => shadowTiles` for tests and a solver bot.
- Seeded room generator.
