# Deep Lure

Fishing roguelite roguelite (like Dredge). Status: design only. The page is a placeholder.

## Play style

Calm fishing with a bad feeling. Sail a small boat across a foggy sea map. At fishing spots, cast and play a reel minigame: keep the tension bar inside the safe zone while the fish pulls.

- Each fish has a fight pattern (steady, jumpy, deep diver).
- The hold is a grid. Fish take up cells, as in a backpack puzzle.
- At night, panic rises. High panic brings strange events and damages the boat.
- Some catches are aberrant: they are worth more but carry a curse.

## Run loop

1. Each day: sail out from port, fish, and return to sell before night.
2. Money buys rods, lures, engines, hull space and lamps.
3. A run is 14 days. Pay off the debt on the boat by the last day to win.
4. Rare fish unlock new regions on the map.

## Core systems

- **Map**: sea regions with fishing spots, rocks, ports and fog.
- **Reel minigame**: tension, fish stamina, rod strength, line breaks.
- **Hold**: grid inventory with fish shapes.
- **Fish**: region, depth, time of day, value, pattern, curse.
- **Meta**: unlock boats and starting gear.

## Tech plan

- Canvas 2D top-down map with a boat that steers with momentum.
- DOM overlay for the reel minigame and the hold grid.
- Seeded fish tables per spot and day.
