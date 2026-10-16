# Silent Contract

Turn-based stealth heist roguelite (like Invisible Inc.). Status: playable.

## How to play

1. Pick 3 agents. Each job is a facility on a 16×16 grid of rooms, doors, walls and cover.
2. Hack 💻 terminals to get power ⚡. Use the power to open the target, then bring your agents to the 🟩 exit pad and press **Escape**.
3. Click or tap an agent to select it. Click a tile to move. On touch screens, tap once to see the path and tap again to move.
4. Click things next to the agent to use them: a guard (takedown), a terminal, a safe, the target. Click a camera in sight to hack it.
5. Press **End turn**. The guards then move one by one.
6. Keys: `1`–`4` agent, `Tab` next agent, arrows or `WASD` step, `Z` `X` `C` `V` actions, `G` `H` `J` gadgets, `U` undo, `Enter` end turn, `L` escape, `N` guard plans, `Esc` cancel or menu, `?` help.

## Rules

- **AP:** each agent has 5 + stealth action points per turn. A step costs 1 AP. A closed door costs 1 more. A locked door costs 3 more.
- **Fog of war:** you see what your agents see (8 tiles, line of sight). Agents only walk on tiles you know. The target room and the cameras are on the building plan.
- **Guards** see in a 90° cone (4 tiles, 5 when alert). The red tiles show the cones. A guard that sees an agent spots it: alarm +1, and the guard hunts. A hunting guard that still sees an agent at the start of its turn shoots.
- **Plans:** a dotted line and an arrow show each guard's next move. Faint tiles show where guards will look during that move.
- **Cover** blocks movement. A guard cannot see an agent right behind cover, unless the guard stands next to the cover.
- **Doors** block sight. Peek through a closed door for 1 AP.
- **Takedown:** 2 AP next to a guard. It sleeps for 2 + combat turns. Stand on the body to keep it down. A guard wakes up alert (alarm +1). Guards that see a body come to look.
- **Cameras** 📷 see 4 tiles. If one sees an agent: alarm +2 and the nearest guard comes to look. Hack a camera in sight for 1 ⚡.
- **Down:** at 0 HP an agent is down. A teammate next to it revives it (2 AP, 1 HP). If all agents are down, the run is over. Agents that are not on the pad when you escape are captured.
- **Undo** is free when the action showed nothing new. Otherwise it costs a rewind ⏪ (2 per mission).

### Alarm

The alarm rises 1 tick per turn. 6 ticks make a level.

| Level | Rule |
|---|---|
| 1 | Patrols walk 1 tile faster. |
| 2 | A reinforcement guard arrives. |
| 3 | Hacked cameras reboot. A drone arrives. |
| 4 | Lockdown: closed doors lock (3 AP to force). |
| 5 | Two enforcers arrive and hunt you. |
| 6 | Full alert: guards see 1 tile farther. A hunting enforcer arrives every 2 turns. |

## Content

### Agents

| Agent | HP | 💻 / 👣 / 👊 | Gadgets | Unlock |
|---|---|---|---|---|
| 👩‍💻 Decker | 4 | 2 / 1 / 0 | Buster Chip | start |
| 🥷 Shade | 4 | 0 / 2 / 1 | Cloak | start |
| 🦾 Brick | 5 | 0 / 1 / 2 | Shock Taser | start |
| 🎯 Vesper | 4 | 1 / 1 / 1 | Stun Dart | 3 intel |
| 🩺 Patch | 4 | 1 / 1 / 0 | Medkit, Smoke Bomb | 4 intel |
| 👻 Wisp | 3 | 0 / 3 / 0 | Noisemaker | 5 intel |
| 🤖 Rook | 6 | 1 / 0 / 2 | EMP Pack | 6 intel |
| 🦊 Fennec | 4 | 1 / 2 / 1 | Tag Lens, Keycard | 8 intel |

Skills go from 0 to 3. Hacking: terminals give 2 + hacking power. Stealth: AP = 5 + stealth. At stealth 3, cameras and drones cannot see the agent. Combat: knockouts last 2 + combat turns. At combat 3, takedowns work on armored guards.

### Gadgets (charges refill each mission)

| Gadget | AP | Uses | Effect |
|---|---|---|---|
| 💉 Stun Dart | 2 | 2 | Knock out a guard in sight (5 tiles) for 2 turns. Not armored guards. |
| 💨 Smoke Bomb | 1 | 1 | A 3×3 cloud for 2 turns. Nothing sees through smoke. |
| 📣 Noisemaker | 1 | 2 | Guards within 6 tiles go to the spot. |
| ⚡ EMP Pack | 2 | 1 | Cameras and drones within 4 tiles turn off for 3 turns. |
| 🕶️ Cloak | 1 | 1 | Nobody sees the agent until the next turn. |
| 🩹 Medkit | 1 | 2 | Heal 2 HP on yourself or a neighbor. Also revives. |
| 🗝️ Keycard | 1 | 1 | Open a safe, the target or a locked door without power. |
| 💾 Buster Chip | 0 | 1 | +2 power. |
| 🔌 Shock Taser | 2 | 2 | Knock out a neighbor guard for 3 turns, also armored ones. |
| 🔭 Tag Lens | 0 | 3 | Tag a guard. You see it and its plan at all times. |

### Implants (2 slots per agent)

🦿 Leg Servos (+1 AP), 🛡️ Dermal Plate (+1 HP), 🧠 Cortex Link (+1 hacking), 🥊 Reflex Wire (takedowns cost 1 AP), 💤 Nerve Lock (knockouts +2 turns), 👁️ Sixth Sense (see guards within 4 tiles through walls), 🎒 Hidden Pocket (+1 gadget slot), 💰 Loot Scanner (safes +50% credits).

### Guards

| Guard | Notes |
|---|---|
| 💂 Guard | Walks a patrol route. Shoots for 1. |
| 👮 Sentry | Stands still and turns between two directions. |
| 🪖 Enforcer | Armored. Shoots for 2. Arrives at high alarm and hunts. |
| 🛸 Drone | Flying camera: alarm +1 and calls a guard. Cannot be knocked out. EMP or hack it (2 ⚡). |
| 🎖️ Captain | Vault boss. Armored, sees 5 tiles, shoots for 2. |

### Jobs

| Job | Target | Reward |
|---|---|---|
| 🏦 Bank Branch | 💰 Vault box | Many credits |
| 🧪 Research Lab | 📦 Prototype | A gadget + credits |
| 🖥️ Server Farm | 🗄️ Mainframe | +2 intel + credits, 3 terminals, more cameras |
| ⛓️ Detention Block | 🧍 Prisoner | A free agent |
| 🏥 Cyber Clinic | 🧬 Implant case | A free implant |
| 🏛️ The Vault | 📜 The Contract | Wins the run |

## Run loop

1. 6 days. On days 1–5 you pick 1 of 3 jobs. Stars set the security level (more guards, cameras, drones, enforcers) and the reward.
2. Day 6 is the Vault: a captain, 3 terminals, 3 cameras and a target that needs 4 power.
3. After each job you go to the safehouse. Agents heal fully. Buy gadgets and implants, train skills, sell gadgets, and hire an agent (team of up to 4).
4. A failed job (escape without the target) pays only the safes. The run ends when no agents are left or after the Vault.
5. Score: credits earned + 150 per completed job + 1000 for the Vault + 50 per surviving agent + 5 per knockout.

## Meta progress

Each run gives intel 🧩 (1 + score / 300). Server Farm jobs give 2 more. Spend intel on the title screen to unlock 5 agents and 3 starting loadouts (Seed Money +100 credits, Time Buffer +1 rewind, Field Kit: a Medkit for each starting agent).

Save keys: `silent.run`, `silent.meta`, `silent.mute`.

## Code

| File | Contents |
|---|---|
| `src/grid.ts` | Tile codes, line of sight with the cover rule, view cones, BFS paths |
| `src/engine.ts` | Mission state and the pure resolver `apply(state, action) => state`, guard plans, guard phase, alarm rules |
| `src/level.ts` | Seeded facility generator: 3×3 room cells from templates, doors and arches, objects, cameras, guards and routes |
| `src/data.ts` | Agents, gadgets, implants, guards, alarm rules, jobs, room templates, loadouts |
| `src/run.ts` | Campaign: offers, rewards, safehouse shop, training, score, save data |
| `src/bot.ts` | Mission bot (weak and smart) and campaign choices |
| `src/app.ts` | Screens, SVG board, input, guard-phase animation, debug API |

`apply` never changes its input. The app keeps the old states for undo. The smart bot plays candidate moves with `apply` to check them.

## Debug

Open the game with `?debug` (add `&fast` to skip animation waits). The console then has `window.debug`:

- `debug.step(smart = true)`: one bot action. On the title, crew, map, report and shop screens it makes the choice. In a mission it plays a whole turn and ends it. It returns `'busy'` during animations.
- `debug.state()`: `screen`, day, credits, roster, turn, alarm level, power, agents, `end`.
- `debug.credits(n)`, `debug.intel(n)`, `debug.win()` (finish the current mission), `debug.reset()`.

## Balance

A headless sim plays full campaigns. Over 300 runs: the weak bot (walks straight to the goal) wins about 0–1% and completes about half of its jobs. The smart bot (avoids cones, peeks doors, takes guards down, hacks cameras) wins about 30%.
