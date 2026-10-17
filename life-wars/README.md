# Life Wars

New-concept roguelite: fight with cellular automata. Status: design only. The page is a placeholder.

Place a few cells. Let the board run. Kill the enemy core.

## Play style

Combat through Game of Life rules. Each turn you place a few cells, then the board runs 10 generations. Your colony grows, dies or hits the enemy colony.

- When cells of two colors collide, cells on both sides die.
- Destroy the enemy core cells to win the fight. Protect your own core.
- Learn shapes: gliders to attack, blocks to wall, oscillators to guard.
- Rule cards change the life rules for your color only, for example "my cells survive with 4 neighbors".

## Run loop

1. 3 acts of fights. Each enemy colony has its own rule set and patterns.
2. After a fight, choose a rule card, a shape template (place a glider in one tap) or more cells per turn.
3. Elites run unusual rule sets (HighLife, Seeds) that you must read from their behavior.
4. A boss at the end of each act.

## Core systems

- **Board**: a grid of cells with owner color, wrap or walls.
- **Rules**: birth and survival counts per color, collision rule.
- **Placement**: a cell budget per turn and placement zones.
- **Templates**: saved shapes that the player can stamp.
- **Enemy AI**: tries several placements and keeps the best simulated result.
- **Meta**: unlock rule cards and templates.

## Tech plan

- Canvas 2D with a step animation for the 10 generations.
- Typed arrays for the board, so the AI can simulate many placements.
- Seeded enemy colonies.
