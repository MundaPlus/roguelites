# Dome Digger

Mining plus wave defense roguelite (like Dome Keeper). Status: design only. The page is a placeholder.

## Play style

Two phases with one clock. Between waves you dig down from the dome through rock and collect iron, water and crystals. A timer shows when the next wave comes. When the wave hits, you control the dome laser and shoot the monsters.

- Digging speed depends on the drill level and the rock hardness.
- You can only carry a few resources, so you must walk back up to drop them.
- Monsters that reach the dome damage its shield and then its HP.

## Run loop

1. A run is about 15 waves. Each wave is stronger.
2. Spend resources on upgrades: drill, carry capacity, jetpack, laser damage, shield.
3. Find gadgets in the ground: a lift, a resource converter, an orbital strike.
4. The run ends when the dome HP reaches 0. Survive all waves to win.

## Core systems

- **Map**: a tile grid of rock layers, harder deeper down, with ore veins and caves.
- **Keeper**: walk, dig, jetpack, carry stack that slows movement.
- **Waves**: flying and ground monsters with HP, speed and attack patterns.
- **Dome**: laser (aim with the mouse or keys), shield, HP.
- **Meta**: unlock domes with different weapons (laser, sword arm, turret).

## Tech plan

- Canvas 2D tile map with chunked drawing. Only the area near the camera is drawn.
- One scene for the mine and one for the defense, with a quick transition.
- Seeded map generator with layers and noise for ore placement.
