# Lane Push

Real-time lane attack roguelite (like Clash Royale / reverse Plants vs. Zombies). Status: playable.

## How to play

1. You attack from the bottom. The enemy defends the top with towers and a keep.
2. Energy (the purple bar) fills over time, up to 10. Every card costs energy. In the last 60 s of a battle energy fills twice as fast.
3. Drag a card from your hand onto the field. Or tap a card, then tap the field. Keys: `1`–`4` pick a card, `Q` `W` `E` play it in the left, middle or right lane.
4. Units go in your half (below the river). They snap to the nearest lane. Spells go anywhere.
5. Break the keep to win the battle. The keep sleeps until a lane tower falls or you hit it.
6. `Space` pauses. `Esc` clears the selected card or opens the menu.

## Rules

- Your deck has 8 cards. You hold 4. The small card left of the hand comes next. A played card goes to the back of the queue.
- Units walk up their lane and fight the nearest enemy in the same lane. When the lane tower falls, units in that lane go for the keep.
- Target types: `ground` units cannot hit flyers. `towers only` units (Giant, Hog Rider, Balloon, Golem) walk past enemy units.
- Splash hits every enemy near the target. Spells deal 35% damage to towers.
- The enemy has its own deck of 8, a hand of 4, the same energy rules and the same unit logic. Its AI defends first: splash against swarms, anti-air against flyers, high damage or swarms against tanks. It spends spare energy on counter-pushes.
- Enemy units that reach the bottom wall hurt your camp (🏕️). The camp HP carries over between battles.
- A battle lasts 3 minutes. If time runs out, you lose the battle and the camp takes 8 damage (14 for a boss). A lost boss can be tried again.
- The run ends when the camp reaches 0 HP.

## Cards

Card levels go from 1 to 4. Each level adds 15% HP and damage. Stats below are at level 1.

| Card | Cost | Type | Notes |
|---|---|---|---|
| 🗡️ Knight | 3 | Unit | 680 HP, melee, ground |
| 🏹 Archers | 3 | 2 units | Ranged, hit air |
| 👺 Goblins | 2 | 3 units | Fast melee swarm |
| 🗿 Giant | 5 | Unit | 2100 HP, towers only |
| 💣 Bomber | 3 | Unit | Ranged splash, ground only |
| 🦇 Minions | 3 | 3 flyers | Hit air and ground |
| 🔫 Musketeer | 4 | Unit | Long range, hits air |
| 🪓 Valkyrie | 4 | Unit | Melee splash, 1000 HP |
| 🐗 Hog Rider | 4 | Unit | Fast, towers only |
| 💀 Skeleton Army | 3 | 10 units | Shreds tanks, dies to splash |
| 🔱 Spear Goblins | 2 | 3 units | Cheap ranged, hit air |
| 🔥 Fireball | 4 | Spell | 400 damage, radius 42 |
| 🎯 Arrows | 3 | Spell | 150 damage, radius 66 |
| ✨ Zap | 2 | Spell | 100 damage and a short stun |
| 💚 Heal | 3 | Spell | Heals your units by 380 |
| ❄️ Freeze | 4 | Spell | Freezes enemy units and towers for 4 s |
| 🧙 Wizard | 5 | Unit | Ranged splash, hits air (unlock 💎30) |
| 🐉 Baby Dragon | 4 | Flyer | Splash (unlock 💎30) |
| 😡 Rage | 2 | Spell | +40% speed and attack speed for 6 s (unlock 💎30) |
| 🎈 Balloon | 5 | Flyer | Towers only, bomb on death (unlock 💎45) |
| 🤖 P.E.K.K.A | 7 | Unit | 1900 HP, 360 damage per hit (unlock 💎45) |
| ⚡ Lightning | 6 | Spell | Hits the 3 strongest enemies (unlock 💎60) |
| 🪨 Golem | 8 | Unit | 3400 HP, splits into 2 Golemites (unlock 💎60) |
| 🧹 Witch | 5 | Unit | Splash, calls 3 skeletons every 9 s (unlock 💎75) |

Start deck: Knight, Archers, Goblins, Giant, Bomber, Minions, Fireball, Arrows.

## Towers

| Tower | HP | Notes |
|---|---|---|
| 🏹 Arrow Tower | 1150 | Shoots air and ground |
| 💥 Cannon Tower | 1350 | Splash, ground only (elites) |
| ⛲ Healing Tower | 1050 | Heals enemy units and towers near it (elites) |
| 🏰 Keep | 1800 | Wakes when a tower falls or it is hit |

Layouts: Three Towers, Bastion (strong middle), Twin Gate (open middle lane, stronger keep), Cannon Wall and Healing Spring (elites), Boss Keep. Tower HP grows ×1.2 in act 2 and ×1.4 in act 3.

## Run loop

1. 3 acts with 5 steps each: battle, battle or elite, shop or camp, battle or elite, boss.
2. After a win: gold and a draft of 3 cards. A new card replaces one of your 8. You can upgrade a card instead, or skip. New cards come at level 1, 2 or 3 by act.
3. Elites and bosses also give a choice of 3 perks. Bosses repair half of the camp.
4. Shop: 3 cards, a card upgrade, a camp repair and a perk. Camp: repair 35% of the camp or upgrade a card for free.
5. Enemy decks come from an act pool (act 1: basic cards, act 3 adds P.E.K.K.A, Witch, Lightning). Enemy cards are level 1, 2 and 3 by act. The enemy energy rate grows with the act.

| Act | Boss | Power |
|---|---|---|
| 🌲 Green Border | 👹 Goblin Chief | Sends 3 goblins down a lane every 16 s |
| 🏔️ Frost Pass | 🧊 Frost Witch | Freezes your biggest group every 15 s |
| 🌋 Dragon Spire | 🐲 Dragon Lord | Fireball every 13 s, a dragon per lane at half HP |

Perks: Deep Well (max energy 12), Quick Brew (+12% energy rate), Head Start (8 starting energy), Thick Hide (+12% HP), Sharp Blades (+12% damage), Spellbook (+25% spells), Siege Crew (+25% damage to towers), War Drums (+15% speed), Stone Wall (+20 camp), Spyglass (see the enemy hand).

## Meta progress

Each run gives gems 💎 (score / 40). Spend them in the Barracks on the title screen to add 8 cards to the draft and shop pool. The title screen shows runs, wins, best act, best score and towers broken.

Save data: `lanepush.run` and `lanepush.meta` in `localStorage`. The run saves between nodes. If you leave during a battle, the battle starts again when you continue.

## Code

| File | Contents |
|---|---|
| `src/sim.ts` | Fixed-tick battle (30 ticks/s): energy, hand cycle, deploy, units, towers, spells, bosses |
| `src/ai.ts` | Threat reading, counter scores, enemy AI, weak and good player bots |
| `src/data.ts` | Cards, towers, perks, bosses, acts |
| `src/run.ts` | Map plan, encounters, rewards, shop, score, save data, bot draft |
| `src/app.ts` | Screens, canvas renderer, drag and tap input, effects, debug API |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG and hash |

Both sides only act through `deploy()` with their own energy and hand, so the rules are the same for the player and the AI.

## Balance

A headless sim plays full runs with two bots (no unlocks):

| Bot | Runs | Run wins | Battles won |
|---|---|---|---|
| Weak (random cards, random lanes) | 200 | 0% | 11% |
| Good (tank first, support behind, defends, smart spells) | 200 | 49% | 75% |

With all 8 unlocks the good bot wins 79% of runs.

## Debug

Open the game with `?debug` (add `&fast` for quick bot runs). The console then has `window.debug`:

- `debug.state()`: screen, run, deck, perks, and the battle (time, energy, hand, towers, unit count).
- `debug.step()`: one bot action. In a battle it simulates 5 s (15 s with `&fast`) with the good bot. On other screens it picks a room, a reward, a shop item or a camp choice. Repeated calls play a full run to the `end` screen.
