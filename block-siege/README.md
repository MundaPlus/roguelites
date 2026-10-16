# Block Siege

Falling-block combat roguelite (like Tetris with enemies). Status: design only. The page is a placeholder.

## Play style

Falling-block puzzle as combat. You play in a well, as in Tetris. An enemy stands above the well. Each line you clear fires an attack at it.

- Damage grows with the number of lines cleared at once (1, 3, 6, 10).
- Special blocks add effects when their line clears: fire (burn), ice (slow the enemy), bomb (clear the area), heart (heal).
- Enemies attack on a timer: they push garbage rows into your well, speed up the drop, or lock cells.
- A piece that tops out costs HP and clears the top rows.

## Run loop

1. A map with fights, elites, shops, events and rest stops. Three acts with a boss each.
2. After a fight, add a piece shape or a special block to your bag, or upgrade one.
3. Relics change the rules: "the hold slot holds 2 pieces", "T-spins deal double".
4. Your bag of pieces works like a deck. Remove weak pieces in the shop.

## Core systems

- **Well**: 10×20 grid, rotation with wall kicks, hold slot, next queue, hard and soft drop.
- **Piece bag**: standard 7 shapes plus new shapes (pentominoes, single blocks) and special blocks.
- **Combat**: enemy HP, attack timer, attack types (garbage, speed, lock, shield).
- **Combos**: back-to-back clears and T-spins raise the damage.
- **Meta**: unlock new shapes and special blocks.

## Tech plan

- Canvas 2D at a fixed cell size, input with DAS (delayed auto shift) and ARR (auto repeat rate) settings.
- Touch: tap to rotate, drag to move, swipe down to drop.
- Pure well logic `(state, input) => state` for tests.
