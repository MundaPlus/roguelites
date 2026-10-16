# Wild Camp

Survival crafting roguelite (like Don't Starve). Status: design only. The page is a placeholder.

## Play style

Survival with needs. Walk a wild map and gather wood, stone, berries and grass. Craft tools, a fire, traps and armor.

- Hunger, health and sanity drop over time.
- Night is dark. Without a light source, something attacks you.
- Seasons change: winter needs warm clothes, summer needs shade.
- Tools break. Food spoils.

## Run loop

1. Survive as many days as you can on a random map.
2. Find and build the parts of a portal to win the run.
3. Bosses roam in some seasons.
4. Each death unlocks new characters with traits.

## Core systems

- **World**: a tile map with biomes and resource nodes that grow back.
- **Crafting**: recipes with tiers (science machine, alchemy table).
- **Needs**: hunger, health, sanity, temperature.
- **Creatures**: passive, neutral and hostile, with day and night behavior.
- **Meta**: unlock characters.

## Tech plan

- Canvas 2D top-down with a camera and a day/night light layer.
- Inventory and crafting menus in DOM.
- Fixed tick simulation with save points at dawn.
