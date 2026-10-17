# Tip the Scales

New-concept roguelite: turn-based tactics on a balance beam over a pit. Status: playable.

Everyone stands on one beam. Tip it, and the low end slides off.

## How to play

1. Tap one of your units (or press `1`–`4`). Green cells show where it can walk. Red rings show what it can attack.
2. Tap a cell or a target. The game shows a preview: a dashed ghost beam with the new tilt, arrows for every slide, ☠ for every fall, and the damage. The meter shows the new tilt in gold.
3. Tap the same target again, or press Confirm (`Enter`), to do it. With a mouse, pointing at a target also shows the preview.
4. Each unit can walk once, then act once: attack, use a skill, or brace. Acting ends that unit's turn.
5. Press End turn (`E`). The enemies then act with the same rules.
6. Undo (`U`) takes back any action of the current turn. The rules have no randomness, so the preview is always exact.

## Rules

| Rule | Detail |
|---|---|
| Moment | Sum of weight × (cell − pivot) over all units. |
| Tilt | Moment ÷ the beam's step, rounded toward 0. Capped at ±4. |
| Slide | After every action, each unit slides `|tilt| − 1 − grip` cells toward the low end. |
| Limit | At tilt ±4, grip does not help. Every unit slides 3 cells. |
| Stop and fall | A sliding unit stops at the next unit. A unit that slides past the edge falls into the pit. |
| Repeat | After the slides, the tilt is measured again. Slides repeat until nothing moves. |
| No slide | Floating units (negative weight) and braced units never slide. Brace lasts until your next turn. A unit cannot brace two turns in a row. |
| Round limit | After round 30 the enemies give up and you win the fight. This only stops stalemates. |
| Knock-back | Pushes the target away from the attacker. A push into a unit deals 1 damage to both. A push past the edge is a fall. |
| Walking | Units can walk past allies, but not past enemies or crates. |

A defeated or fallen unit leaves the beam, so its weight leaves too. The preview shows this.

## Beams

| Beam | Rule |
|---|---|
| 🪵 Plank | One pivot in the middle. 11 cells, step 7. |
| 🪵 Short Plank | 9 cells, step 6. Less room before the edge. |
| ⛩️ Twin Trestle | Pivots at −2 and +2. It only tilts when the moment around the outer pivot on the heavy side passes 0. |
| 🧊 Ice Beam | Any slide goes 1 cell further. |
| 🪢 Rope Swing | A sway of ±1 adds to the tilt. The sway flips each time you end your turn. The panel previews the flip. |

## Units

| Unit | Weight | HP | Grip | Move | Attack | Notes |
|---|---|---|---|---|---|---|
| 🛡️ Warden | 4 | 9 | 1 | 2 | 2, knock 1 | Front line |
| 🗡️ Rogue | 2 | 6 | 2 | 3 | 3 | No knock-back |
| 🏹 Archer | 2 | 5 | 1 | 2 | 2, knock 1 | Range 3 |
| 🔨 Smith | 5 | 10 | 1 | 1 | 2, knock 2 | |
| 🎈 Aeronaut | −2 | 5 | – | 3 | 1, knock 1 | Floats. Knows Hook. Unlock: tip 8 enemies |
| ⚓ Anchor | 7 | 11 | 2 | 2 | 1, knock 1 | Unlock: reach act 2 |
| 🧽 Sponge | 2 | 9 | 1 | 2 | 2, knock 1 | +1 weight per hit. Unlock: reach act 3 |

## Squads

| Squad | Units | Start item | Unlock |
|---|---|---|---|
| ⚖️ Guild | Warden, Rogue, Archer | – | – |
| ⚓ Ironfoot | Smith, Anchor, Rogue | Chalk | Reach act 2 |
| 🎈 Oddballs | Aeronaut, Sponge, Warden | Helmets | Win a run or tip 30 enemies |

## Enemies

| Act | Enemies | Boss |
|---|---|---|
| 🌉 Rickety Bridge | 🐀 Rat, 🐗 Boar, 👺 Goblin (Shove), 🦇 Bat (weight −1) | 🐸 Bog King: weight 8, Leap |
| 🏔️ Frozen Gorge | 🪃 Slinger (range 3), 🧌 Ogre (weight 7), 🪝 Hookman (Hook), 🫧 Gas Bag (weight −3), Goblin | 🤖 Iron Colossus: weight 10, Slam |
| ☁️ Sky Scales | 🗿 Golem, 🐡 Bloater (+2 weight per hit), 🦏 Rhino, 😈 Imp (Swap), Slinger, Hookman | 👑 Scalekeeper: drops 🪨 boulders, Hook |

Some fights also have a 📦 crate (weight 3). Anyone can push it or break it.

Enemy AI: each enemy tries every walk and action with the same preview. It scores damage to you, your units that fall, and your units near the low edge. It avoids its own falls. Its sense for tipping grows with each act.

## Skills and items

| Skill | Effect |
|---|---|
| 👐 Shove | Push a neighbour 2 cells. No damage. |
| 🪝 Hook | Pull a unit 2–4 cells away next to you. 1 damage. |
| 🧱 Ballast | +3 weight until your next turn. |
| 🦘 Leap | Jump to an empty cell up to 4 away. |
| 🔄 Swap | Swap places with a unit up to 2 cells away. |
| 💥 Slam | 1 damage to both neighbours and knock them 1 cell. |

| Item | Effect |
|---|---|
| 🧂 Chalk | +1 grip for all your units |
| 🔪 Whetstone | +1 attack damage |
| 🦯 Long Pole | +1 knock-back |
| 🪢 Climbing Rope | Once per fight, an ally that would fall hangs on (2 damage) |
| 🩹 Bandages | +3 healing after each fight |
| 🥾 Spiked Boots | Ice does not add to your slides |
| ⛑️ Helmets | +2 max HP for all units |
| 👟 Spring Shoes | +1 move |

## Run loop

1. 3 acts. Each act has 3 fights and a boss.
2. After each won fight, pick one: a new unit (party of up to 4), a skill to teach (up to 2 per unit), an item, or rest (+4 HP).
3. Every unit heals 4 HP after a fight. A new act heals the party to full.
4. Units lost in a fight are gone for the run. The run ends when the whole party is lost.
5. Score: 50 per fight won, 15 per enemy tipped off, 5 per enemy defeated, 200 per act reached, 600 for a win.

## Meta progress

The title screen shows runs, wins, best score and the total number of enemies tipped off. These totals unlock 3 units for rewards and 2 squads.

## Balance

Headless sim, 300 runs per squad, fresh meta (no unlocks). The random bot plays random legal actions and random rewards. The preview bot tries every walk + action with the preview, then plays out the enemy turn for its 3 best plans. The sim uses the same code as the game: `smartTurn`, `enemyPhase`, `botReward` and `botTeach` in `src/bots.ts`, and `debug.step()` calls the same functions.

| Squad | Random bot | Preview bot | Tipped off / defeated per run |
|---|---|---|---|
| Guild | 0% | 48% | 10.4 / 16.4 |
| Ironfoot | 0% | 34% | 8.2 / 13.7 |
| Oddballs | 0% | 54% | 11.4 / 16.4 |

Browser check: 12 `debug.step()` runs, 7 wins.

## Code

| File | Contents |
|---|---|
| `src/beam.ts` | Pure rules: moment, tilt, slides, falls, actions, enemy AI scoring |
| `src/bots.ts` | Enemy phase driver, random bot, preview bot |
| `src/data.ts` | Units, skills, items, beams, acts, squads |
| `src/run.ts` | Run state, seeded fight setup, rewards, score, save data |
| `src/app.ts` | Screens, SVG beam renderer, animation, input, debug API |
| `src/sfx.ts` | WebAudio synth |

`apply(battle, action)` returns the new battle, the animation frames and the events. The app uses the same call for the preview and for the real move.

Save keys: `scales.run` (also holds the fight in progress), `scales.meta`, `scales.mute`.

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.debug`:

- `debug.step()`: one bot action. In a fight the preview bot plays a full turn and ends it. Returns `'busy'` during animations.
- `debug.state()`: `screen`, act, fight, tilt, units and the end result.
- `debug.start(seed, squad?)`: start a run with a fixed seed. The result matches the sim for the same seed.
- `debug.toFight(act, fight)`: jump to a fight (act 0–2, fight 0–3, 3 = boss).
- `debug.win()`: win the current fight.
