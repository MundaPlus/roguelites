# Time Bar Tales

Turn-based JRPG party roguelite with time bars (like Final Fantasy ATB). Status: playable.

## How to play

1. Choose 2 heroes (3 with the Guild unlock) and climb a tower of 15 floors.
2. In battle, every hero and enemy has a time bar that fills by Speed. When a bar is full, that unit acts.
3. Enemies act at once. A hero with a full bar waits for your command: ⚔️ Attack, ✨ Skill, 🎒 Item or 🛡️ Defend.
4. Pick a target. The command panel shows the expected damage and if the target is weak or resists.
5. Beat the Chronomancer on floor 15 to win.

Input:

- Mouse and touch: tap a command, then tap a target. Tap an enemy from the main menu to attack it.
- Keys: `↑` `↓` choose, `Enter` / `Space` / `Z` confirm, `Esc` / `X` back, `←` `→` change target, `Tab` next ready hero, `1`–`4` commands.
- Outside battle, the arrow keys move the focus between buttons.

## Rules

- **Fill rate**: (Speed + 12) × 1.25 per second. Haste ×1.5, Slow ×0.5. Sleep stops the bar.
- **Wait mode** stops all bars while a hero waits for a command. **Active mode** does not. Change it on the title screen, in battle or in the menu. Battle speed ×1, ×1.5 or ×2.
- **Damage**: power × Attack (or Magic) × 1.55 × 50 / (50 + Defense or Spirit), ±10%. Critical hits deal ×1.5.
- **Elements**: 🔥 fire, ❄️ ice, ⚡ thunder, ✨ holy, 🌑 dark. Weak ×2, resist ×0.5, immune ×0, absorb heals.
- **Rows**: weapon hits from or into the back row deal 40% less. Spells, bows and some skills ignore rows.
- **Defend** halves damage until the hero's next turn.
- **Statuses**: ⏩ Haste, 🐌 Slow, ☠️ Poison (4% max HP every 2 s), 💤 Sleep (a hit wakes the unit), 🔰 Protect (−35% physical damage). Bosses are immune to sleep and resist slow.
- After a battle, living heroes get XP and 12% of their MP back. Fallen heroes stay down until an inn, a Phoenix Down or Raise.

## Classes

Each class has a start skill and a tree of 3 tiers with 2 skills each. Tier n needs level 2n and one skill from the tier before. Each level gives 1 skill point.

| Class | Start | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| 🤺 Knight | Power Strike | Fortify / Holy Blade | Sweep / Shield Wall | Lionheart / Valor |
| 🧙 Mage | Fire | Blizzard / Thunder | Fira / Sleep | Flare / Tempest |
| 🥷 Thief | Steal | Quick Hit / Poison Edge | Flurry / Slow Dart | Assassinate / Mug |
| 🧝 Healer | Cure | Protect / Esuna | Cura / Banish | Raise / Haste |
| 🧚 Bard (Guild) | Swift Song | Lullaby / Dirge | Hymn / Shrill Note | Requiem / Encore |
| 🧞 Summoner (Guild) | Salamander | Frost Wyrm / Storm Roc | Ruby Fox / Sun Lion | Night Dragon / Phoenix |

## Enemies

Enemies follow scripts: rules with conditions (half HP, every third turn, a hurt ally), fixed patterns, a second pattern below half HP, and counters (against weapon hits, spells or one element).

| Zone | Floors | Enemies | Elite | Boss |
|---|---|---|---|---|
| 🌿 Mossy Halls | 1–5 | Green Jelly, Cave Bat, Goblin, Spore Cap, Plague Rat, Ember Wisp | 👹 Ogre (counters hits) | 🧌 Troll King: calls goblins, regenerates |
| ❄️ Frost Galleries | 6–10 | Ice Wolf, Frost Imp, Skeleton, Yeti, Wraith | 🗿 Crystal Golem (counters spells) | 🐉 Rime Dragon: absorbs ice, second pattern |
| ⚡ Storm Spire | 11–15 | Harpy, Stormling, Iron Scorpion, Naga, Demon, Vampire | 🦁 Chimera (three breaths) | 🕰️ Chronomancer: Slowga, Time Crush empties your bars, calls Clockgears |

## Items and gear

- 10 items: Potion, Hi-Potion, Ether, Phoenix Down, Remedy, Speed Tonic, Fire Bomb, Ice Gem, Volt Jar, Elixir. Thieves can steal more.
- 35 pieces of gear in 3 slots (weapon, armor, accessory) and 3 tiers. Gear changes stats, gives weapon elements, element resistance, status immunity, or perks (bows ignore rows, the Hourglass starts the bar half full, the Lucky Charm gives +25% gold).

## Run loop

1. Each floor offers 2–3 doors: ⚔️ battle, 💀 elite, 🛏️ inn, 🛒 shop, ❓ event, 🎁 treasure. Floors 5, 10 and 15 hold a boss. Floors 2, 4, 9 and 14 always offer an inn.
2. Battles give gold, XP and item drops. Elites and bosses give a choice of 3 pieces of gear.
3. Inn: rest (full HP and MP, revives) and recruit up to 4 heroes.
4. 8 events with choices: Time Fountain, Lost Merchant, Old Shrine, Trapped Chest, Lost Adventurer, Clock Library, Gambling Den, Clockmaker.
5. Manage gear, rows and skills in 👥 Party.

The run saves after each room (`tbt.run`). If you leave during a battle, the battle starts again from the beginning.

## Meta progress

Each run gives crystals 💎 (score / 40, plus 10/20/30 for bosses). Spend them in the Guild on the title screen: Bard, Summoner, a supply crate, a fat purse, the Lucky Charm, veteran heroes (level 2), and a third starting hero. Meta data is in `tbt.meta`.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Elements, statuses, classes, skills, enemy moves and scripts, items, gear, zones, events, Guild |
| `src/party.ts` | Hero stats from class, level and gear. XP and the skill tree |
| `src/battle.ts` | Pure ATB simulation: `newBattle`, `tick(b, dt)`, `advance`, `command`, damage, statuses, enemy AI, counters |
| `src/run.ts` | Doors, encounters, rewards, shop, inn, events, score, save data |
| `src/bot.ts` | Weak and smart battle bots, run choices (doors, shop, inn, events, gear, skills) |
| `src/app.ts` | Screens, battle DOM with bars and menus, animation queue, input, debug API |
| `src/sfx.ts` | WebAudio synth |

The battle has no DOM. `tick(b, dt)` moves time forward in 0.05 s steps and records events. The app plays the events as animations and pauses time while they play.

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.debug`:

- `debug.step()`: one bot action for the current screen. Returns `'busy'` while an animation plays.
- `debug.state()`: screen, floor, gold, party, battle units and the end result.
- `debug.gold(n)`, `debug.crystals(n)`, `debug.win()` (wins the current battle).

## Balance

The headless sim plays full runs with the bots. Last result (300 runs each, 2 starting heroes): weak bot 0% wins (most die at the Troll King), smart bot 53% wins (most losses at the Chronomancer).
