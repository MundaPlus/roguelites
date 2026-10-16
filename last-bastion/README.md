# Last Bastion

Run-based tower defense roguelite (like Rogue Tower). Status: design only. The page is a placeholder.

## Play style

Placement and planning. Enemies walk a path toward your core. You place towers next to the path. The run ends when the core has 0 HP.

## Run loop

1. Each wave adds a new map tile at the end of the path. The path gets longer and can split.
2. After each wave, choose one of three cards: a new tower, a tower upgrade or a global buff.
3. Gold comes from kills. Spend it on more towers or on upgrades.
4. Every 10 waves a boss wave comes.
5. Survive wave 50 to win. You can continue in endless mode.

## Core systems

- **Towers**: ballista (single target), mortar (area), frost (slow), tesla (chain), flame (cone). Each tower has an upgrade tree with two branches.
- **Terrain**: high ground adds range, forest blocks some shots, water slows enemies.
- **Enemies**: fast, armored, flying, healer, splitter, boss.
- **Meta**: unlock towers and starting relics with crystals that you keep after a run.

## Tech plan

- Canvas 2D on a square grid. The path finder runs only when a new tile comes.
- Speed control: pause, 1×, 2×, 4×.
- Touch: tap a cell to place, tap a tower to upgrade or sell.
