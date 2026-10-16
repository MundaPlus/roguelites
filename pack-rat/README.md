# Pack Rat

Backpack-builder auto-battler roguelite (like Backpack Hero / Backpack Battles). Status: design only. The page is a placeholder.

## Play style

Spatial build puzzles. Your backpack is a grid. Items have shapes and take up cells. Many items have stars on their sides: they buff the items placed in those cells. Fights run on their own, and each item acts on its own cooldown.

- Drag items to place them. Right-click or tap twice to rotate.
- A sword with a whetstone next to its star gets +damage.
- Bags extend the grid. The shape of the grid matters.

## Run loop

1. Each round: shop phase, then a fight against a ghost build of the same round.
2. The shop offers 5 items. Reroll for gold. Lock items to keep them for the next round.
3. You have 5 lives. A lost fight costs a life. Win 10 rounds to win the run.
4. Choose a class at the start. Each class has its own item pool.

## Core systems

- **Grid**: cells, item shapes (polyomino masks), rotation, star cells.
- **Items**: cooldown, effects (damage, block, heal, poison, stamina), tags (weapon, food, gem).
- **Battle sim**: a pure time-step simulation, so a fight can be replayed and tested.
- **Opponents**: generated builds per round with the same item budget.
- **Meta**: unlock classes and new items.

## Tech plan

- DOM grid with pointer drag and drop; snap to cells; rotate with a key or a double tap.
- Battle replay as a timeline of events, shown with bars and floating numbers.
- Seeded RNG for the shop and the opponent builds.
