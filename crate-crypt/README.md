# Crate Crypt

Push-block puzzle roguelite (like Sokoban roguelites). Status: design only. The page is a placeholder.

## Play style

Sokoban-style puzzles as a dungeon run. Push crates onto pressure plates to open the door. You can push, but not pull, and only one crate at a time.

- Undo is unlimited inside a room, but each room has a move budget.
- Special crates: ice (slides until it hits something), heavy (needs a power-up), bomb.
- Monsters move when you move and block crates.

## Run loop

1. Each floor is a set of connected rooms built from puzzle templates.
2. Clear rooms to earn keys and tools: a pull glove, a crate teleport, an extra undo budget.
3. The move budget carries over between rooms on a floor.
4. Reach floor 10 to win.

## Core systems

- **Grid**: walls, floor, plates, crates, doors.
- **Generator**: reverse-play generation (start solved, pull crates backward) so every room can be solved.
- **Tools**: one-use items that break a rule.
- **Monsters**: simple patterns on the grid.
- **Meta**: unlock tools and characters.

## Tech plan

- DOM or Canvas tile grid.
- Pure move function `(state, dir) => state` with an undo stack.
- Keyboard, swipe and on-screen arrows.
