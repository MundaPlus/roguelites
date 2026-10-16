# Idle Empire

Incremental idle roguelite (like Cookie Clicker / Antimatter Dimensions with prestige). Status: design only. The page is a placeholder.

## Play style

Incremental growth. Click to earn, then buy generators that earn for you. Each generator tier buys the tier below it.

- Upgrades multiply production and unlock new mechanics.
- Challenges change the rules for a run ("no clicking", "only 3 generators").
- The game also progresses when the tab is closed (offline progress).

## Run loop

1. A run builds to a target, then you prestige: reset for a permanent currency.
2. The prestige currency buys a skill tree that changes the next runs.
3. Each layer of prestige adds a new mechanic.
4. Reach the final layer to finish the game.

## Core systems

- **Numbers**: big-number math (mantissa and exponent).
- **Generators**: cost growth, production, tier chains.
- **Upgrades and challenges**: rule modifiers.
- **Prestige**: layers, currencies, skill tree.
- **Save**: timestamps for offline progress.

## Tech plan

- DOM panels updated a few times per second.
- A small big-number class or a library such as break_infinity.js.
- Autosave to localStorage with export and import.
