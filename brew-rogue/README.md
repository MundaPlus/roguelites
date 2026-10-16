# Brew Rogue

Potion-brewing roguelite roguelite (like Potion Craft). Status: design only. The page is a placeholder.

## Play style

A puzzle about paths. Each ingredient moves your potion marker along a fixed path on an effect map. Grinding an ingredient longer uses more of its path. Water pulls the marker back toward the center. The goal is to stop on an effect: healing, fire, luck, sleep, and others.

- Effects have strength levels. A marker close to the center of an effect gives a stronger potion.
- Danger zones on the map ruin the potion.
- Salts turn the map or push the marker in a fixed direction.

## Run loop

1. Each day, customers ask for potions with a price and a deadline.
2. Buy ingredients from merchants, or go on gathering trips that have risks.
3. Pay the debt to the guild every week. Miss a payment and the run ends.
4. A rival alchemist takes the best orders if your reputation falls behind.

## Core systems

- **Effect map**: a 2D map with effect zones, danger zones and paths.
- **Ingredients**: path shape, length, price, rarity.
- **Brewing**: grind amount, stirring, water, salts.
- **Orders**: effect, strength, deadline, price, reputation.
- **Meta**: unlock new maps, ingredients and shop upgrades.

## Tech plan

- SVG for the effect map and the potion path, DOM for the shop and orders.
- Ingredient paths as polylines. Stirring moves along the polyline.
- Seeded order and merchant tables per day.
