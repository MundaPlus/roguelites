# Dash Lanes

Endless lane runner roguelite (like Subway Surfers with roguelite upgrades). Status: design only. The page is a placeholder.

## Play style

Reflex running. The runner moves forward on its own in 3 lanes. Swipe or press keys to switch lanes, jump and slide.

- Obstacles: barriers (jump), bars (slide), trains (switch lanes).
- Coins and power-ups lie in the lanes: magnet, shield, jetpack.
- Speed rises over time.

## Run loop

1. A run is a series of zones. At each gate, choose the next zone and a perk.
2. Perks: double jump, coin magnet range, one extra hit.
3. Bosses chase you in boss zones; dodge their attacks to win.
4. One crash without a shield ends the run.

## Core systems

- **Track**: chunks of obstacle patterns with difficulty ratings.
- **Runner**: lane, jump arc, slide timing, hit box.
- **Perks**: stacking modifiers for the run.
- **Zones**: themes with their own obstacle sets.
- **Meta**: unlock runners and starting perks.

## Tech plan

- Canvas 2D pseudo-3D (scaled sprites) or a simple WebGL view.
- Swipe input with a short buffer, keyboard arrows.
- Seeded chunk selection per run.
