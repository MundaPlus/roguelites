# Hexfall Tactics

Grid-tactics squad roguelite (like Into the Breach). Status: design only. The page is a placeholder.

## Play style

Chess-like planning. You control a squad of 3 on a small hex grid. Each enemy shows its attack one turn before it hits. You win by moving enemies, not only by killing them: push them into each other, into water or into the path of other attacks.

## Run loop

1. Pick an island. Each island has 4 missions and a final battle.
2. A mission lasts 5 turns. Protect the buildings and meet a bonus goal.
3. Squad members gain XP and pick perks. A dead member is gone for the run.
4. Between missions, spend reputation on new weapons, repairs or recruits.
5. Clear all islands to reach the last fight.

## Core systems

- **Hex grid**: axial coordinates, line of sight, push directions.
- **Intents**: enemies plan in the enemy phase and resolve after the player phase.
- **Weapons**: push, pull, swap, area shots, shields, terrain changes.
- **Terrain**: water, chasm, forest (burns), mountain (blocks).
- **Meta**: unlock squads with different weapon sets and pilot perks.

## Tech plan

- Canvas or SVG hex rendering.
- Turn resolver as a pure function `(state, action) => state`, so undo and AI tests are easy.
- Simple enemy AI: score each tile and attack, pick the best one.
