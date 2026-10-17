# Glyph Tongue

New-concept roguelite: learn new magic rules every run. Status: playable.

You write spells from 8 runes. Each run gives the runes new meanings and a new grammar. You learn the language by casting spells and reading the results.

## How to play

1. Tap rune keys (or press `1`-`8`) to write a spell. Press **Cast** (`Enter`). The spell length starts at 3.
2. The result log shows every effect: which rune made it, whom it hit and how much. Runes that did nothing are grey ("silent").
3. Tap a foe (or press `Tab`) to select it. Some targets hit the selected foe.
4. Open the **📓 notebook** (`N`). It keeps a log of every cast. Each rune has a guess list and a note field. Your guesses show on the rune keys. The notebook is saved with the run.
5. The first two rooms are **test rooms** with two dummies. Nothing hurts you there. Use them to experiment: single runes first, then pairs in both orders.
6. In real fights, each silent rune causes **wild magic** that hurts you (1 / 2 / 3 damage in act 1 / 2 / 3). A wrong target can hit you too.
7. Other keys: `Backspace` erase, `R` write the last spell again, `M` mute, `Esc` menu.

## The language

Each run deals 3 elements, 2 targets and 3 modifiers to the 8 runes. The Lexicon tab in the notebook lists the whole pool.

| Element | Effect (base power) |
|---|---|
| 🔥 Harm | Deals 6 damage |
| 💚 Mend | Heals 5 |
| 🛡️ Ward | 6 shield until the next turn |
| ☠️ Venom | 4 poison (deals its value each turn, then drops by 1) |
| 🩸 Drain | Deals 4 damage, the caster heals 4 per target |
| 🌀 Hex | Dulls the next hit of the target by 5 |

| Target | Hits |
|---|---|
| 🙋 Self | You |
| 🎯 Foe | The selected foe |
| 👥 All | Every foe |
| 🩹 Weakest | The foe with the lowest HP |

| Modifier | Effect |
|---|---|
| ✖️ Amp | ×2 power (each extra Amp adds +1×) |
| ➕ Swell | +3 power |
| ➗ Half | ×0.5 power |
| 💫 Spread | Hits every foe at ×0.6 power |
| 🪞 Twin | Also hits the other side (you, or the selected foe) |

### Grammar (3 rules every run)

- **Target order**: target runes go BEFORE or AFTER the element they change.
- **Modifier order**: the same for modifiers. The two orders are set apart, so they can differ.
- **Default target**: an element with no target hits either you or the selected foe.

A word binds to the nearest element on its side. A word with no element on its side is silent. If two targets bind to one element, the closer one wins.

### Special rules (2 of 5 every run)

| Rule | Effect |
|---|---|
| Cancel pair | Two runes cancel. With both in a spell, every copy of both is silent. |
| Resonance | Two runes next to each other give +4 to every effect. The log shows "Resonance". |
| Stutter | A rune written twice in a row is silent. |
| Head word | Only the first element of a spell works. |
| Taboo | Any spell with one rune burns you for 3. The log shows the burn. |

So every run has 5 rules plus 8 rune meanings to learn. That is small enough to learn in one run.

## Foes

Foes show their next move: ⚔️ attack, 🛡️ shield, 🤐 silence runes for a turn, ☠️ poison, ✚ heal, 💢 rage, 📯 summon. From turn 9 (elite 12, boss 14) foes are restless and gain +2 attack each turn, so no fight lasts forever.

| Act | Foes | Elite | Boss |
|---|---|---|---|
| 🌿 The Mire | Bog Slime, Ink Imp, Mute Moth, Spit Toad | 🗿 Stone Tutor | 🪨 Babbling Golem |
| 📚 The Archive | Paper Wolf, Scroll Mimic, Hush Wisp, Inkling | 🦉 Archivist | 🕯️ Scribe Wraith (summons Inklings) |
| 🗼 The Spire | Glyph Knight, Echo Bat, Rune Eater, Spire Adder | 🐉 Grammar Hydra | 🌑 The Unspeaker (summons Rune Eaters) |

## Run loop

1. 3 acts. Act 1 has 9 steps, acts 2 and 3 have 8. At each step choose a room. The last step is the boss.
2. Act 1 starts with 2 test rooms (6 casts each).
3. Rooms: fight, elite, campfire (heal 30% or study), scribe shop, study hall (a short test room), library (pay 6 HP to reveal one fact).
4. After a fight: gold and one pick of 3: a new rune, +1 spell length (up to 6), a hint scroll, a charm or +6 max HP. Elites and bosses also offer a charm.
5. A hint scroll (📜) reveals one hidden rune meaning or rule.
6. After each boss you heal 50% of max HP.
7. Score: rooms cleared, foes beaten, +250 for a win, +5 for each rune named right in the notebook at the end. The end screen shows the full language of the run.

## Charms

| Charm | Effect |
|---|---|
| 🪞 Mirror Ward | Start each fight with 6 shield |
| 🏮 Lantern | Test rooms and study give 3 more casts |
| 🔍 Lens of Reading | The log shows which element each rune bound to |
| 🦷 Fang | Heal 1 for each foe your spell damages |
| 🧥 Thick Cloak | +10 max HP |
| 🧘 Calm Mind | Wild magic deals 1 less per silent rune |
| 🖋️ Ink Well | +12 gold after each fight |
| 🪶 Phoenix Quill | Once per run, survive a killing blow with 12 HP |

## Meta progress

Each run gives ink 🖋️ (score / 40). Spend it on perks on the title screen:

| Perk | Effect |
|---|---|
| 🗣️ Linguist | Start each run with one grammar rule revealed |
| 🕯️ Long Candle | Test rooms give 3 more casts |
| 🔓 Seventh Rune | Start with 7 runes instead of 6 |
| 🎒 Scholar Satchel | Start with 1 hint scroll |
| 🦏 Tough Hide | +8 max HP |

## Code

| File | Contents |
|---|---|
| `src/lang.ts` | Rune meanings, world generation from the seed, the spell parser, facts |
| `src/fight.ts` | Fight state, casting, foe turns |
| `src/data.ts` | Foes, acts, charms, perks |
| `src/run.ts` | Run state, map plan, rewards, shop, score, save data (`glyph.run`, `glyph.meta`) |
| `src/bot.ts` | The learning bot (hypothesis table) and the run policy for the sim and the debug API |
| `src/app.ts` | Screens, canvas stage, notebook, animations, input |

The parser is a pure function of the world, the spell and the fight context. The bot uses the same parser to test its hypotheses.

## Balance

A headless sim plays full runs with three bots (500 runs each):

| Bot | Win rate |
|---|---|
| Random spells and choices | 0% |
| Learner (keeps a hypothesis table and learns only from the cast log) | 49% |
| Oracle (knows the language from the start) | 67% |

The learner knows on average 7.3 of 8 runes at the end of a run.

## Debug

Open the game with `?debug` (add `&fast` to skip animation waits). The console then has `window.debug`:

- `debug.step()`: one bot action. The bot is the learner: it reads only the cast log and the revealed facts. Returns `'busy'` while an animation runs.
- `debug.state()`: `screen` (`'end'` on the win/loss screen), act, step, HP, fight info and the number of runes the bot knows.
- `debug.world()`: the hidden language of the run. `debug.ink(n)`: add ink.
