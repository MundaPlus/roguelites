# Starward Drift

Ship crew management with pause roguelite (like FTL). Status: design only. The page is a placeholder.

## Play style

Real-time ship combat with pause. You command a small ship with rooms (weapons, shields, engines, oxygen, medbay, pilot). Each room needs power and crew. You aim weapons at enemy rooms to knock out their systems.

- Shields block one shot per layer and recharge.
- Hull breaches and fires spread in rooms. Crew repair them and put out fires.
- Pause at any time to give orders.

## Run loop

1. Each sector is a map of beacons. Jump to the next one while a rebel fleet moves in from the left.
2. Beacons hold fights, events with choices, stores and distress calls.
3. Collect scrap to buy weapons, crew, system upgrades and fuel.
4. Reach the exit of 6 sectors, then defeat the flagship.

## Core systems

- **Ship**: room grid, doors, systems with power levels, reactor power budget.
- **Crew**: position, path finding between rooms, skills, health.
- **Weapons**: charge time, power cost, damage, projectile type (laser, missile, beam).
- **Events**: text events with choices and outcomes from a data file.
- **Meta**: unlock ships with different layouts and starting gear.

## Tech plan

- Canvas 2D for both ships, DOM for system power bars and the event text.
- Fixed-step simulation with pause. The same sim drives the enemy AI.
- Data-driven ships and events as TypeScript objects.
