# Forget-Me-Not

New-concept roguelite: forgotten skills become enemies. Status: playable.

Learn a skill, forget a skill. What you forget comes back to hunt you.

## How to play

1. Your skills sit in memory slots. You start with 4 slots and 4 skills.
2. After a fight, pick 1 of 3 new skills or skip. When memory is full, you must forget a skill to learn the new one.
3. The forget window shows the echo that each skill becomes: its HP, its moves and the floor where it appears.
4. In a fight you get 3 ⚡ energy per turn. Click a skill (or press `1`-`7`) to use it. Each skill works once per turn.
5. Tap a foe (or press `←` `→` / `Tab`) to target it. The badge above each foe shows its next move.
6. Press **End turn** (or `E` / `Enter`). Then the foes act, one at a time.
7. `Esc` opens the menu. On other screens the arrow keys move between buttons.

## Echoes

- A forgotten skill comes back 3 floors later as an **echo**. The echo uses that skill at the level you had.
- Echo HP: `(6 + 4 × power) × act factor`. Echo skill numbers are 80% of the skill × act factor. Every echo also has a Claw attack.
- A weak skill makes a weak echo. A strong or upgraded skill makes a strong one.
- An echo joins the first fight on or after its floor. At most 2 echoes join one fight.
- Echoes **flee** when the last normal monster falls. Defeat an echo first and you get a free skill upgrade.
- Escaped echoes wait at the final boss. The **Hollow Mind** calls back every echo you did not defeat (3 on the field, the rest join on its "call" move). When it dies, the echoes it did not call yet fade.
- The **Echo ledger** (side panel, or below on a phone) lists the coming echoes with their floor, and the escaped ones. The map marks echo floors with 👻.

## Rules

- Block stops damage until your next turn. Strength adds to each hit. Poison deals its value at the turn start, then drops by 1.
- Weak: −25% damage dealt. Exposed: +50% damage taken. Thorns hurt attackers. Stun skips a foe's next move. Daze removes 1 energy next turn.
- A 🔒 seal blocks your strongest skill for one turn (Owl Librarian, The Censor).

## Skills

Power is the strength rating. Each level adds 1.5 power. Skills go up to level 3.

| Skill | Cost | Level 1 effect | Power |
|---|---|---|---|
| 👊 Jab | 1 | Deal 4 | 1 |
| 🧱 Brace | 1 | 4 block | 1 |
| ⚔️ Strike | 1 | Deal 6 | 3 |
| 🛡️ Guard | 1 | 6 block | 3 |
| 🌀 Hex | 1 | Deal 2, weak 2 | 3 |
| 🗡️ Twin Fang | 1 | Deal 3 ×2 | 4 |
| 🧪 Poison Dart | 1 | Poison 4 | 4 |
| 🎯 Expose | 1 | Exposed 2 | 4 |
| 🌵 Thorn Coat | 1 | 4 block, thorns 3 | 4 |
| 🤺 Parry | 1 | 4 block, deal 4 | 4 |
| 🌬️ Second Wind | 1 | Heal 3, 3 block | 4 |
| 🏰 Bulwark | 2 | 13 block | 4 |
| 🔨 Heavy Blow | 2 | Deal 13 | 5 |
| 🪓 Cleave | 2 | Deal 7 to all | 5 |
| 😡 Rage | 1 | +2 strength | 5 |
| 💚 Mend | 2 | Heal 10, once per fight | 5 |
| 🩸 Leech | 2 | Deal 7, heal the damage (unlock) | 6 |
| 💀 Execute | 2 | Deal 8, ×2 below half HP (unlock) | 6 |
| 💫 Concuss | 2 | Deal 5, stun (unlock) | 6 |
| ⚡ Lightning | 3 | Deal 22 (unlock) | 7 |

## Relics

| Relic | Effect |
|---|---|
| 🌊 Lethe Water | Forgotten skills come back 2 floors later |
| 📜 Faded Ink | Echoes have half HP |
| 🔔 Echo Ward | +50% damage to echoes |
| 🕯️ Memorial Candle | Heal 6 when you defeat an echo |
| 🏛️ Mind Palace | +1 memory slot, no HP cost |
| 🪨 Whetstone | Attack skills +2 damage per hit |
| 🐚 Shell Charm | Start each fight with 8 block |
| 🌿 Herb Pouch | Heal 5 after each won fight |
| 🔋 Spark Jar | +1 energy on the first turn |
| ❤️ Old Heart | +12 max HP |
| 🦷 Vampire Tooth | Heal 1 per attack skill |
| 🧶 Knotted String | Guard skills +2 block |

## Enemies

| Act | Monsters | Elite | Boss |
|---|---|---|---|
| 🌸 Petal Meadow | Slime, Thorn Rat, Dust Moth, Shell Beetle, Wasp | 🌹 Briar Knight | 🥀 Wilted Queen (calls Thorn Rats) |
| 📚 Dusty Archive | Ink Blot, Bookworm, Candle Wisp, Gargoyle, Quill Sprite | 🦉 Owl Librarian (seal) | ✒️ The Censor (seal) |
| 🌑 Hollow Mind | Doubt, Regret, Static, Mirror, Grey Moth | 👁️ Night Terror | 🧠 The Hollow Mind (calls echoes) |

Normal monsters get +20% / +40% HP and +15% / +30% damage in acts 2 and 3.

## Run loop

1. 3 acts of 8 floors (24 floors). Floor 8 of each act is a boss. Floor 24 is the final boss.
2. On each floor, pick 1 of 2 rooms. The map shows the room choices for the whole act.
3. ⚔️ Fight: pick 1 of 3 skills. 👹 Elite: also 1 of 2 relics, and the skills are 1 level higher. 💀 Boss: 1 of 3 relics.
4. ⛩️ Shrine: learn 1 of 3 stronger skills, or add a memory slot (−8 max HP), or upgrade a skill.
5. 🔥 Rest: heal 30% of max HP, or upgrade a skill.
6. Score: 10 per floor, 3 per kill, 20 per defeated echo, and 400 + 3 × HP for a win.

## Meta progress

Each run gives petals 🌼 (score / 40). Spend them on the title screen to unlock 4 skills (Leech, Execute, Concuss, Lightning) and 2 starting bars (Duelist, Alchemist). The title screen shows runs, wins, best score, best floor and defeated echoes. Save keys: `forget.run`, `forget.meta`.

## Balance (headless sim, 600 runs per bot)

| Bot | Win rate | Mean floor |
|---|---|---|
| Random fights and choices | 0% | 6 |
| Smart fights, forgets the strongest skill | 0% | 8 |
| Smart fights, hoards (never forgets, buys slots) | 14% | 14 |
| Smart fights, forgets a random skill | 20% | 16 |
| Smart fights, forgets the weakest skill | 58% | 22 |

With all unlocks, the weakest-forget bot wins 49% and the random-forget bot 13%.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Skills, relics, monsters, acts, starting bars, tuning values |
| `src/fight.ts` | Pure fight logic: cards, damage, statuses, enemy moves, echo foes |
| `src/run.ts` | Map, rooms, memory, forget and echoes, rewards, score, save data |
| `src/bot.ts` | Fight bot (one-turn lookahead) and run choice policies |
| `src/app.ts` | Screens, fight animation, input, debug API |
| `src/sfx.ts` | WebAudio synth |
| `src/rng.ts` | Seeded RNG and hash |

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.debug`:

- `debug.step()`: one bot action (start, pick a room, play a skill or end the turn, take rewards, continue). Returns `'busy'` while an animation runs.
- `debug.state()`: screen, floor, HP, memory, echoes, fight summary, end result.
- `debug.win()`, `debug.petals(n)`, `debug.echo(skill, lvl)` (adds an escaped echo), `debug.floor(n)` (on the map), `debug.learnBest()`.
