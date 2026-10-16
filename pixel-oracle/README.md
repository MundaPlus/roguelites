# Pixel Oracle

Nonogram logic roguelite (like Picross roguelites). Status: design only. The page is a placeholder.

## Play style

Logic puzzles with numbers. A grid has number clues for each row and column. The clues give the lengths of the painted runs. Paint cells and mark empty cells to reveal a picture.

- A wrong paint costs 1 HP.
- Spells give help: reveal a row, check a cell, mark all empties in a line.
- Each puzzle can be solved by logic, with no guessing.

## Run loop

1. Each floor is a set of puzzles of growing size (5×5 up to 20×20).
2. Solved pictures can be monsters (fight), chests (loot) or keys.
3. Mana from clean solves buys spells.
4. Clear 8 floors to win.

## Core systems

- **Puzzle**: grid, clues, line solver to check that a puzzle needs no guessing.
- **Generator**: random or picture-based grids, rejected when not line-solvable.
- **Spells**: help effects with mana costs.
- **HP**: lost on wrong cells, refilled at shrines.
- **Meta**: unlock spells and picture packs.

## Tech plan

- DOM grid with click and drag to paint many cells.
- A line solver for generation checks and a hint system.
- Keyboard cursor control.
