# Key Mage

Typing roguelite (like Nanotale / Epistory). Status: playable.

## How to play

1. Enemies walk down the field toward your mage. Each enemy has a word above it.
2. Type the word to cast a bolt at that enemy. The first letter locks the closest enemy whose word fits. The typed part lights up.
3. A key that fits no word is a typo. The key does not count and your combo resets. `Backspace` removes a letter.
4. Each correct word adds 1 to the combo (+5% damage per word, up to ×2). Accuracy in the fight also scales damage.
5. Type a spell word before the target word to change the spell. Spell words cost mana. Mana refills over time.
6. `Esc` opens the menu and pauses the fight. On other screens, `1`–`9` pick a choice and `Enter` presses the main button.
7. On touch screens an on-screen keyboard shows below the field. The ⌨️ button turns it on or off. You can also tap the spell chips.

## Difficulty

Choose the difficulty on the title screen before a new run. The game saves the choice. The title screen shows the best score and wins for each difficulty. The end screen shows the difficulty of the run.

| Difficulty | Enemy speed | Spawn and boss pace | Enemy HP | Other |
|---|---|---|---|---|
| 🐢 Relaxed | ×0.5 | ×1.95 slower | ×0.75 | Little growth per act, 1 less shield word, no longer words in act 3 |
| 🧙 Normal | ×1 | ×1 | ×1 | — |
| ⚡ Swift | ×1.28 | ×0.81 (faster) | ×1.1 | — |

Changing words and the cultist's shields also follow the pace.

## Spell words

| Word | Kind | Mana | Effect |
|---|---|---|---|
| 🔥 `fire` | Element | 10 | The next word deals +30% damage and burns for 3 s. |
| ❄️ `frost` | Element | 10 | The next word slows the target to 40% speed for 4 s. |
| ⚡ `volt` | Element | 10 | The next word chains to 1 more enemy for 60% damage. |
| 🗡️ `lance` | Shape | 15 | The next word also hits every enemy in the same lane for 70%. |
| 💥 `nova` | Casts at once | 30 | Hits every enemy near you. Uses the primed element. |
| 🧱 `wall` | Casts at once | 25 | Blocks the lane of the closest enemy for 6 s. Uses the primed element (fire burns, frost slows, volt zaps). |
| 💚 `mend` | Casts at once | 35 | Heals 2 HP. |

A run starts with `fire` and `nova`. Learn the others at shrines, as fight rewards or in the shop.

## Word colors

| Color | Meaning |
|---|---|
| White | A normal word. Tough enemies get a new word after each hit. |
| Blue with 🛡 | A shield word. It breaks one shield and gives no damage. |
| Violet | The word changes every 3 s, also while you type it. |
| Red | A decoy (wisp). Typing it costs 1 HP and your combo. It fades after 8 s. |

## Runes

19 runes change the rules. Examples: Kindling (a burning enemy that dies sets the next one on fire), Deep Freeze, Arc Coil (volt chains 3 times), Wide Nova, Stone Wall, Thorn Wall, Piercing Lance, Focus (combo up to 30), Steady Hand (a typo halves the combo), Mana Well, Quick Spring, Frugal Ink, Sharp Mind, Long Words, Ward, Gold Tongue. Echo, Leech Quill and Full Font are Grimoire unlocks.

## Enemies

| Act | Enemies | Elite | Boss |
|---|---|---|---|
| 🌲 Whisper Woods | Imp, Slime (splits), Goblin, Bat (zigzag), Wisp (decoy) | 👹 Ogre Brute: long words | 🌳 Elder Treant: throws acorns, calls imps, bats, goblins |
| 🧊 Frost Caves | Skeleton (shield), Ice Bat, Ice Golem, Wraith (word changes), Imp, Wisp | 🎭 Shapeshifter: changing words and a shield | 👸 Frost Queen: throws ice shards, calls skeletons, bats, wraiths |
| ⚡ Storm Spire | Storm Knight (2 shields), Drake, Cultist (gives allies shields), Specter, Ice Bat, Wisp | 🧟 Dread Lich: long changing words, 2 shields | 🧛 Storm Archmage: throws sparks, calls knights, drakes, specters |

- Bosses stay at the top and have phrases with spaces instead of words. Each phrase deals damage. They throw missiles with short words and call helpers.
- Enemy HP and speed grow with each act.
- Words come in 4 tiers: 3–4, 5–6, 7–8 and 9–12 letters (717 hand-written words). No two enemies on screen share a word. The game avoids shared first letters when it can.

## Run loop

1. 3 acts with 7 steps each. At each step choose one of the rooms: fight, elite, shrine or shop. The last step is the boss.
2. A fight is 3–4 waves. A wave is a quick burst of enemies, then a short pause.
3. After a fight: gold and one pick of 3 (a spell word, a rune, or HP / max HP / max mana). Elites and bosses give a choice of runes.
4. Shrine: learn a spell word or a rune, or heal 4 HP.
5. Shop: runes, a spell word, healing, max HP and max mana.
6. HP carries over between fights. The run ends when HP reaches 0 or the third boss falls.

## Meta progress

Each run gives shards 💎 (score / 70). Spend them in the Grimoire on the title screen. It unlocks `frost`, `volt` and `wall` as start spells, and the runes Echo, Leech Quill and Full Font. The title screen also shows runs, wins, best act, best score and best WPM.

## Balance

A headless sim plays full runs with bot typists (300 runs each, no Grimoire unlocks). Win rates:

| Bot | Speed | Typos | Spells | Relaxed | Normal | Swift |
|---|---|---|---|---|---|---|
| Weak | 36 WPM | 7% | none | 41% | 0% | 0% |
| Mid | 48 WPM | 5% | yes | 100% | 3% | 0% |
| Good | 55 WPM | 4% | yes | 100% | 42% | 0% |
| Fast | 84 WPM | 4% | yes | 100% | 98% | 44% |

## Code

| File | Contents |
|---|---|
| `src/battle.ts` | Real-time battle: spawns, movement, typing and target lock, spells, damage, walls, bosses. Pure, no DOM. |
| `src/bot.ts` | Bot typist (speed, typo rate, spell use) for the debug API and the sim |
| `src/data.ts` | Spells, runes, enemies, acts, boss phrases, Grimoire unlocks |
| `src/words.ts` | Word lists by tier |
| `src/run.ts` | Run state, map, rewards, shrine, shop, score, save data (`keymage.run`, `keymage.meta`) |
| `src/app.ts` | Screens, canvas renderer, effects, on-screen keyboard, input, debug API |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG and hash |

## Debug

Open the game with `?debug` (add `&fast` to skip the banners). The console then has `window.debug`:

- `debug.step(sec = 3)`: one bot action. In a fight it plays `sec` seconds with a fast bot typist (84 WPM, 2% typos).
- `debug.state()`: screen, act, step, HP, gold, spells, runes, the fight (enemies with words, buffer, combo) and the end result.
- `debug.type(text)`, `debug.win()`, `debug.gold(n)`, `debug.shards(n)`.
