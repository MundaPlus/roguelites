# Split Ages

New-concept roguelite: two linked timelines. Status: design only. The page is a placeholder.

Plant a seed in the past. Climb the tree in the future.

## Play style

Turn-based tactics on two boards. The two grids show the same place 100 years apart. You control one hero on each board, and both heroes act in the same turn.

- What you do in the past changes the future at once: a seed becomes a tree, a cracked wall is gone, a spared enemy has descendants.
- The future board shows a preview of the change before you confirm a move.
- To reach the exit in the future, you plan your moves in the past.
- An enemy that you defeat in the past is gone in the future, but its treasure is gone too.

## Run loop

1. Each floor uses a mix of cause rules: growth, erosion, lineage, flooding.
2. After a floor, choose an item. Some items work in one age only (a seed bag in the past, a rope in the future).
3. Elite floors add a rule that runs backward: a change in the future changes the past.
4. 12 floors and a boss that exists in both ages at once.

## Core systems

- **Boards**: two grids with the same layout and different tile states.
- **Cause rules**: functions that map a change in the past board to a change in the future board.
- **Heroes**: HP, moves, actions, item slots for each age.
- **Enemies**: patrol and attack on one board, with links to the other board.
- **Meta**: unlock cause rules and starting items.

## Tech plan

- Two canvas or DOM grids side by side (stacked on phones).
- Pure turn function `(state, moves) => state` that runs the cause rules, for undo and tests.
- Hand-made room parts combined from a seed.
