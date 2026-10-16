# Hexfall Tactics

Grid-tactics squad roguelite (like Into the Breach) on a hex board. Status: playable.

## How to play

1. Choose a squad of 3 mechs. Pick an island, then pick a mission.
2. Before your turn, each enemy moves and shows its attack in red. The red number is the damage. The black badge is the attack order.
3. Each mech can move once, then act once: use a weapon or repair. After a mech acts, it cannot move.
4. Press **End turn**. Fire burns first. Then the enemies attack in order. Then new enemies emerge from the ⚠️ spawn tiles.
5. Survive 5 turns. A boss battle ends at once when the boss dies.

Point at a target to preview the result. The board then shows the state after the shot: damage, deaths, pushed units and the new enemy aims. On touch screens, tap a target once to preview it and again to fire.

Keys: `1` `2` weapons, `R` repair, `U` undo the last move, `Tab` next mech, `Esc` cancel, `Enter` end turn.

## Rules

- **Intents follow the enemy.** An attack is stored as a direction and a distance from the enemy. Push an enemy and its attack moves with it.
- **Push and bump.** A push into a unit, a mountain or a building is a bump: both take 1 damage. A push off the board does nothing.
- **Water** drowns enemies that cannot fly. Mechs can stand in water, but their weapons do not work there.
- **Chasms** kill anything that cannot fly.
- **Forest** catches fire when it takes damage. **Fire** sets units on it burning: 1 damage at the start of each enemy phase. Repair or water puts the fire out.
- **Smoke** stops the attack of any unit in it. Smoke clears at the end of the round.
- **Shields** block the next damage to a unit or a building.
- **Mountains** block shots and break after 2 hits.
- **Buildings** feed the grid. Each hit on a building destroys one block and costs 1 grid power ⚡. At 0 power the run is lost.
- **Spawns**: stand on a ⚠️ tile to block the enemy there. The blocker takes 1 damage.
- **Undo** takes back moves, not attacks. **Reset turn** restarts the whole turn, once per battle.

## Squads

| Squad | Mechs and weapons | Unlock |
|---|---|---|
| 🛡️ Vanguard | Titan Fist (punch and push), Pulse Cannon (shot and push), Shell Lobber (artillery, pushes the tiles around the target) | Start |
| 🌀 Flux | Phase Swap (teleport and swap places), Grapple Hook (pull a unit, or pull yourself to a wall), Smoke Mortar (flying mech) | Clear 1 island |
| 🔥 Blaze | Flamethrower (fire line and push), Shield Projector (shield mechs and buildings), Ground Slam (hit and push all 6 neighbors) | Clear 2 islands |

The hangar also sells Rocket Battery, Repulsor, Arc Spear and Ram Thrusters, plus the weapons of the other squads. A mech can carry 2 weapons.

## Enemies

| Enemy | Attack |
|---|---|
| 🦂 Scuttler | Claws, 1 damage to an adjacent tile. Fast. |
| 🐛 Spitter | Shot in a line, 1 damage to the first thing hit. |
| 🪲 Mortar Beetle | Artillery over obstacles, 1 damage. |
| 🦏 Horn Brute | 2 damage and push. 4 HP. |
| 🐜 Digger | Sweeps 3 adjacent tiles, 1 damage each. |
| 🦟 Firefly | Flies. Shot in a line that sets the tile on fire. |
| 🦗 Leaper | Jumps over obstacles. Bite for 2 damage. |
| 🦖 Hive Tyrant | Island boss. 3 damage and push. Cannot be pushed. Calls a hatchling each turn. |
| 🕷️ Hive Queen | Final boss. Does not move. Artillery for 2 damage that pushes the tiles around it. Calls 2 hatchlings each turn. |

Alpha enemies (red ring) have +2 HP and +1 damage. Their share grows with each island.

## Run loop

1. Clear 3 islands in any order: Verdant Isle (forests), Tidewater (water) and Ashen Rift (chasms and fire). Each island has 3 missions and a boss.
2. Each mission offer has 2 bonus goals. They give reputation ⭐ or grid power ⚡.
3. Grid power carries over between missions. It starts at 6 (max 8). A cleared island gives +2 ⭐ and +1 ⚡.
4. In the hangar, mechs are fully repaired. Spend ⭐ on grid power, Mk II weapons, +1 max HP, new weapons or a new pilot.
5. Pilots gain XP for kills. At 3 and 8 XP they pick a perk: Thrusters, Plating, Gunner, Steady or Field Medic.
6. A destroyed mech loses its pilot for the rest of the run. Recruit a rookie in the hangar to use that mech again.
7. After 3 islands, defend the Spire at the Hive Heart for 6 turns, or kill the Hive Queen.

## Code

| File | Contents |
|---|---|
| `src/hex.ts` | Axial hex math, pixel conversion |
| `src/board.ts` | Battle state as plain data, and the effect rules: damage, push, fire, smoke, shields |
| `src/weapons.ts` | All weapons as aim rules plus a list of effects. The same list draws intents and previews. |
| `src/units.ts` | Enemies, mech frames, squads, perks |
| `src/engine.ts` | Movement, enemy AI, enemy phase steps, greedy bot |
| `src/run.ts` | Islands, missions, map generation, rewards, hangar, save data |
| `src/app.ts` | Screens, SVG board, input, animations |

Each player action returns a new battle (`(state, action) => state`). Undo, reset, previews and the AI use this.

The enemy AI tries every reachable tile and every aim. It simulates each attack and scores the result. Hits on buildings and mechs score high, hits on other enemies score low.

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.hex`:

- `hex.step(squad?)`: one bot action. Repeat it to play a full run.
- `hex.state()`, `hex.rep(n)`, `hex.unlockAll()`, `hex.toFinal()`, `hex.win()`.
