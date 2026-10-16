# Silent Contract

Turn-based stealth heist roguelite (like Invisible Inc.). Status: design only. The page is a placeholder.

## Play style

Turn-based stealth on a grid. A team of 2–4 agents enters a random facility. Each agent has action points (AP) for moving, opening doors and using gadgets.

- Guards follow patrol routes. Cameras have view cones. A seen agent is chased.
- Knocked-out guards wake up after a few turns.
- The alarm level rises each turn and when you trip sensors. Higher levels add guards and lock doors.
- Hack terminals to turn off cameras or open safes.

## Run loop

1. Each mission: reach the target room, take the loot, reach the exit.
2. Between missions, spend credits on gadgets, implants and new agents.
3. The campaign lasts a fixed number of days. Each day you choose one mission from a map.
4. The last mission is a high-security vault.

## Core systems

- **Grid**: rooms, doors, walls, cover tiles, line of sight with peeking at doors.
- **Agents**: AP, HP, gadget slots, skills (hacking, stealth, combat).
- **Guards**: patrol, investigate noise, chase, alert others. Their next moves are shown.
- **Alarm**: a level from 0 to 6 with a rule at each step.
- **Meta**: unlock agents and starting loadouts.

## Tech plan

- Canvas or SVG grid with fog of war and view cones.
- Pure turn resolver `(state, action) => state` for undo and AI tests.
- Seeded level generator from room templates.
