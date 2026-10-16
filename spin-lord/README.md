# Spin Lord

Slot-machine deck builder roguelite (like Luck be a Landlord). Status: design only. The page is a placeholder.

## Play style

Engine building with luck. Each spin places symbols from your pool at random on a 5×4 grid. Each symbol pays coins, and many react to their neighbors.

- A cat next to milk eats it and pays 9. A miner next to ore breaks it into gems.
- Some symbols grow over time, some destroy others, some copy their neighbors.
- Empty cells pay nothing, so a bigger pool is not always better.

## Run loop

1. Rent comes due every few spins and grows each time. Miss a payment and the run ends.
2. After each spin, add one of 3 offered symbols, or skip.
3. After each rent payment, pick an item (passive effect) from 3.
4. Removal tokens and reroll tokens let you shape the pool.
5. Pay 12 rents to win. Endless mode after that.

## Core systems

- **Symbols**: base value, rarity, tags (animal, food, ore, person), effects that check adjacent cells.
- **Resolve order**: effects run in a fixed order (destroy, transform, then pay), so the result is easy to predict.
- **Items**: passive rules ("fruit pays +1", "every 5th spin pays double").
- **Rent schedule**: spins per rent and rent amount per stage.
- **Meta**: unlock symbols and items, plus harder rent schedules.

## Tech plan

- DOM grid with a reel animation (CSS transforms), then each symbol effect shown one step at a time.
- Pure spin function `(pool, rng) => { grid, events, coins }` for tests and replays.
- Seeded RNG per spin.
