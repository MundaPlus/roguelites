# Storm Haven

Settlement builder roguelite roguelite (like Against the Storm). Status: design only. The page is a placeholder.

## Play style

A city builder in short runs. Each settlement starts with a few villagers, some wood and food. Place buildings, assign villagers and set up production chains: wood to planks, grain to flour to bread.

- Villagers need food and shelter. Unmet needs lower their resolve, and unhappy villagers leave.
- Clearing the forest opens glades with resources and dangers.
- The year cycles through drizzle, clearance and storm. The storm makes everything harder.

## Run loop

1. On the world map, choose where to found the next settlement. Each biome has its own resources and curses.
2. Each settlement has a list of orders (for example "store 50 bread", "build 3 houses").
3. Meet the orders before the impatience bar fills to win the settlement.
4. Each win gives upgrades for the capital that help in the next settlements.

## Core systems

- **Map**: a tile grid with forest, glades and roads.
- **Buildings**: production recipes, worker slots, build cost.
- **Villagers**: species with different needs and skills.
- **Economy**: storage, hauling, recipe chains, trade with a caravan.
- **Meta**: capital upgrades and new building blueprints.

## Tech plan

- Canvas 2D tile map with a camera (pan and zoom), DOM panels for buildings and orders.
- Fixed tick simulation (for example 4 ticks per second) with pause and speed controls.
- Seeded map generation per settlement.
