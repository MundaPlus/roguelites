# Starward Drift

Ship crew management roguelite with pause (like FTL). Status: playable.

## How to play

1. Pick a ship on the title screen. A run has 6 sectors. Each sector is a map of beacons.
2. On the map, tap a linked beacon to jump there. A jump costs 1 fuel. The rebel fleet (the red zone) moves one step after each jump. Reach the exit beacon ⭐ before the fleet catches you.
3. Beacons hold fights, events with choices, stores and distress calls.
4. In a fight, the game runs in real time. Press `Space` or the ⏸ button to pause at any time. You can give all orders while paused. A fight starts paused.
5. After sector 6, fight the Rebel Flagship. Destroy it twice to win.

### Fight controls

| Action | Mouse / touch | Keys |
|---|---|---|
| Pause / resume | ⏸ button | `Space` |
| Power a system up / down | `+` / `−` in the Reactor panel | `A`/`Z` shields, `S`/`X` engines, `D`/`C` oxygen, `F`/`V` medbay |
| Power a weapon on / off | ⏻ on the weapon card | `Shift`+`1`–`4` |
| Aim one weapon | Tap the weapon card, then an enemy room | `1`–`4`, then click a room |
| Aim all powered weapons | Tap an enemy room with no weapon picked | |
| Move crew | Tap a crew member (on the ship or in the list), then a room of your ship | `Q` / `Tab` cycles crew |
| Auto crew on / off | 🤖 button | `G` |
| Jump away (FTL charged) | 🌀 button | `J` |
| Game speed 1× / 2× / 3× | ⏩ button | |
| Cancel a selection | Right click | `Esc` |

## Rules

- **Reactor.** The reactor has a fixed number of power bars. Each system uses the bars you give it. Weapons use their own power cost when they are on.
- **Systems.** A hit on a room damages the system in it (red bars). Damaged bars lose their power until crew repair them.

| System | Effect |
|---|---|
| 🛡️ Shields | 2 power = 1 layer. A layer blocks one laser or flak shot and recharges in about 2 s. |
| ⚙️ Engines | +5% evasion per power. Charge the FTL drive. |
| 💨 Oxygen | Refills the air in all rooms. With no power the air drains. |
| 🩹 Medbay | Heals crew in the room (5 HP/s per power). |
| 🎯 Weapons | Power capacity for the weapons. |
| 🧭 Pilot | Needs no power. Must be manned for evasion and the FTL drive. Level 2 keeps 50% evasion unmanned, level 3 keeps 80%. |

- **Crew.** Crew walk between rooms through doors (path finding on the tile grid). In a room they fight fires first, then seal breaches, then repair the system, then man it. Manned shields, engines, weapons and pilot work better. Crew gain skill ★ while they man a station.
- **Auto crew.** When on, idle crew run to fires, breaches and broken systems, and to the medbay when hurt. Then they return to their station. A move order sets a new station.
- **Fires** 🔥 spread to the next rooms, burn the system, hurt crew and use up air. A fire dies without air. **Breaches** 🕳️ leak air. Crew in a room with less than 10% air lose health.
- **Evasion.** Each laser, ion, flak and missile shot can miss. Beams never miss.
- **FTL.** The drive charges during a fight while the engines have power and the pilot is manned. When it is full you can jump away. You get no reward.
- A fight ends when the enemy hull reaches 0 or its whole crew dies (more scrap). You lose when your hull reaches 0 or your whole crew dies.

## Content

### Weapons (16)

| Weapon | Type | Shots × damage | Charge | Power | Note |
|---|---|---|---|---|---|
| 🔹 Basic Laser | laser | 1 × 1 | 10 s | 1 | |
| 🔷 Burst Laser I | laser | 2 × 1 | 11 s | 2 | |
| 💠 Burst Laser II | laser | 3 × 1 | 12 s | 2 | |
| 🔶 Heavy Laser I | laser | 1 × 2 | 9 s | 1 | fire, breach |
| 🟧 Heavy Laser II | laser | 2 × 2 | 14 s | 3 | fire, breach |
| ⛓️ Chain Laser | laser | 2 × 1 | 15 s | 2 | each volley charges 15% faster (to 55%) |
| 🚀 Leto Missile | missile | 1 × 1 | 9 s | 1 | ignores shields, uses a missile |
| 🧨 Artemis Missile | missile | 1 × 2 | 11 s | 1 | ignores shields |
| 💣 Breach Missile | missile | 1 × 3 | 16 s | 3 | often breaches |
| 〰️ Mini Beam | beam | 1 | 12 s | 1 | 1 room |
| ⚡ Pike Beam | beam | 1 | 16 s | 2 | sweeps 3 rooms |
| 🔱 Halberd Beam | beam | 2 | 17 s | 3 | sweeps 2 rooms |
| 🔥 Fire Beam | beam | 0 | 20 s | 2 | sets 2 rooms on fire, any shield blocks it |
| 🌀 Ion Blast | ion | 1 stack | 9 s | 1 | pops a layer and stops the recharge, or jams a system |
| 🌪️ Heavy Ion | ion | 2 stacks | 13 s | 2 | |
| 🎇 Flak Gun | flak | 3 × 1 | 15 s | 2 | shells spread around the target |

A beam loses 1 damage per shield layer. Missiles pass shields.

### Crew races (5)

| Race | HP | Trait |
|---|---|---|
| Human | 100 | Balanced |
| Engi | 100 | Repairs twice as fast |
| Rockman | 150 | Fire does not hurt. Slow. |
| Zoltan | 70 | 1 free power for the system in its room |
| Lanius | 90 | Needs no oxygen |

### Augments (9)

Scrap Arm (+15% scrap), Auto Reloader (+10% charge), Shield Booster (+35% recharge), Stealth Plating (+7% evasion), Nano Medbots (1 HP/s heal), Fire Suppressor, Missile Replicator (35% free missiles), Hull Drone (+1 hull per jump), Pre-Igniter (weapons start charged). A ship holds 3.

### Ships (4)

| Ship | Layout | Start | Unlock |
|---|---|---|---|
| 🛰️ Kestrel | 8 rooms | Burst Laser II, Artemis, 3 humans | Always |
| 🔵 Torus | 7 rooms | Ion Blast, Heavy Laser I, 2 Engi + human | Reach sector 3 |
| 🪨 Basalt Hammer | 7 rooms, long | Burst Laser I, Heavy Laser I, Artemis, hull 36, 2 Rockmen | Reach sector 5 |
| 🏮 Lantern | 6 rooms, small | 2 shield layers, Burst Laser I, Basic Laser, 2 Zoltans | Win one run |

### Enemies (8)

Pirate Raider, Rebel Fighter, Engi Defender (ion), Zoltan Monitor (strong shields), Rock Cruiser (missiles), Auto Scout (no crew, systems self-repair), Rebel Elite (when the fleet catches you) and the Rebel Flagship. Each sector has its own mix. Hull, shields, engines, weapon count and weapon tier grow with the sector. The enemy uses the same simulation and crew AI as the player.

### Sectors

Civilian Lanes, Engi Reach, Pirate Nebula, Zoltan Shell, Rock Homeworlds, Rebel Stronghold. Each map has 17–20 beacons, 2 stores and one exit. A new sector gives 2 fuel.

### Events (18)

Derelict Hulk, Distress Call, Asteroid Field, Refugee Station, Slaver Ship, Ion Storm, Old Drydock, Rebel Checkpoint, Fuel Trader, Weapon Cache, Plague Ship, Solar Flare, Pirate Toll, Friendly Convoy, Old Engineer, Faint Signal, Science Lab, Smuggler Den. Some choices need a crew race or a system level (shown in brackets).

## Run loop

1. Sector start → jump between beacons → fights, events, stores.
2. Fight reward: scrap, often fuel and missiles, sometimes a weapon, augment or crew.
3. Store: 3 weapons, 1 crew member, 1 augment, fuel (3), missiles (5), hull repair (2–3 per point), weapon sales at half price.
4. 🔧 Ship (from the map or a store): buy system levels and reactor power, move weapons between the ship (4 slots) and the cargo hold (3 slots).
5. Fuel 0: a jump burns 3 hull instead.
6. Exit ⭐ → next sector. After sector 6 → Rebel Flagship (a Federation tender repairs 10 hull first). The Flagship has two phases. Phase 2 repairs it and adds a shield bar and an ion gun.
7. Score = scrap earned + 15 per ship destroyed + 150 per sector + 2000 and 20 per hull point on a win.

## Meta progress

The title screen shows runs, wins, best sector, best score and ships destroyed. Reaching sectors and winning unlock new ships.

## Save data

`localStorage` keys: `starward.run` (the run, including a fight in progress), `starward.meta` (stats and unlocks), `starward.mute`.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Systems, weapons, races, augments, ship layouts, player ships, enemies, sectors, events |
| `src/ship.ts` | Room grid, doors, BFS path finding, crew, reactor power, evasion |
| `src/combat.ts` | Fixed-step simulation (20 steps per second): crew work, fire, air, shields, weapons, projectiles, crew AI, enemy generation |
| `src/run.ts` | Sector maps, beacons, fleet, events, stores, rewards, upgrades, save data, score |
| `src/bot.ts` | Weak and good bots for the balance sim and the debug API |
| `src/render.ts` | Canvas renderer of both ships, shots and effects, click hit tests |
| `src/app.ts` | Screens, DOM panels, input, game loop, debug API |
| `src/sfx.ts` | WebAudio synth sounds |

## Debug

Open the game with `?debug` (add `&fast` to skip the end-of-fight wait). The console then has `window.debug`:

- `debug.state()`: `screen` (`title`, `map`, `event`, `store`, `reward`, `ship`, `combat`, `end`), sector, hull, scrap, fuel, crew and the fight state.
- `debug.step()`: one bot action. In a fight the good bot plays 8 seconds of game time (power, volley aim, flee). Repeated calls play a full run to `end`.
- `debug.scrap(n)`, `debug.win()` (set the enemy hull to 0).

## Balance

Headless sim, 200 runs per ship and bot. The weak bot aims at random rooms, keeps the start power and never upgrades. The good bot aims volleys at the shield room, then weapons, and buys upgrades.

| Ship | Weak bot wins | Good bot wins |
|---|---|---|
| Kestrel | 0% | 29% |
| Torus | 0% | 56% |
| Basalt Hammer | 0% | 45% |
| Lantern | 0% | 47% |
