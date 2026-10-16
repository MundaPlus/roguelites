# Grid Crawler

Classic turn-based roguelike roguelite (like Brogue / Dungeon Crawl Stone Soup). Status: playable.

## How to play

1. Go down 12 floors. Pick up the Amulet 🧿 on floor 12 to win. The Ancient Dragon 🐉 guards it.
2. Nothing moves until you act. Each step, attack or item use is one turn for every creature on the floor.
3. Walk into a monster to attack it. Sleeping or wandering monsters take double damage (triple with a dagger).
4. Find the stairs `>` on each floor and go down. Death is final.

### Controls

| Input | Action |
|---|---|
| Arrows, numpad, `h j k l y u b n` | Move or attack (8 directions) |
| `.` `5` `s` | Wait one turn and search for traps |
| `x` | Auto-explore (stops when a monster shows up) |
| `R` | Rest until healed |
| `g` `,` | Pick up |
| `>` `Enter` | Go down (walks to known stairs first) |
| `i` / `q` / `r` / `z` | Pack / drink / read / zap |
| `Esc` | Menu, or stop auto-walk |
| `?` | How to play |
| Tap or click a tile | Walk there with path finding. Tap a monster next to you to attack. Tap yourself to wait, pick up or go down. |

The bottom bar has buttons for Wait, Explore, Rest, Get, Pack and Down. On a phone, a row of chips shows the monsters in view. Tap a chip for its rules and hit chances. With a mouse, hover a tile to see what is on it.

To zap a wand, pick it in the pack, then tap a target. `Enter` picks the nearest monster.

## Rules

- **Map**: 50×34 tiles of rooms and corridors with doors. Doors block sight until something stands in them. You cannot move diagonally through a door or around a wall corner.
- **Sight**: shadow casting with radius 9. You remember the tiles you saw. Items and known traps stay on the map.
- **Turns**: an energy queue. Speed 100 acts once per turn, 200 acts twice, 50 acts every other turn. Some monsters pay more energy for an attack (the ogre swings every second turn).
- **Combat**: hit chance = 70 + 3×agility + weapon accuracy − monster evasion. Damage = weapon damage + enchantment + strength/3 − a roll of the monster's armor. Monsters roll their attack minus a roll of your armor.
- **Stats**: Strength (damage, +2 max HP, needed for heavy gear), Agility (hit and dodge), Wits (wand damage, healing, regeneration, trap spotting). Gear that needs more strength than you have loses accuracy or armor.
- **Level up**: XP from kills. Each level gives max HP and one stat point of your choice.
- **Healing**: you regenerate slowly. Poison stops it. A wandering monster may arrive every 90 turns, so resting has a cost.
- **Traps**: hidden until you spot them. Wits and waiting help. You step past a known trap 70% of the time.
- **Floors**: deeper floors have more monster groups. Monsters found below their first floor get +16% HP per floor and +1 damage per 2 floors.

## Content

### Monsters (24)

| Monster | Floors | Rule |
|---|---|---|
| 🐀 Rat | 1-3 | Weak. Wanders. |
| 🦎 Kobold | 1-4 | Flees when hurt. |
| 🐕 Jackal | 1-4 | Pack of 2-4. Moves twice per turn and surrounds you. |
| 👺 Goblin | 2-6 | Hunts. May bring an archer or a shaman. |
| 🏹 Goblin Archer | 2-7 | Ranged. Keeps its distance. |
| 🦇 Bat | 2-6 | Fast, erratic, hard to hit. |
| 🧙 Goblin Shaman | 3-7 | Caster: heals allies, lightning. |
| 🐍 Pit Viper | 3-6 | Poison bite. |
| 🐛 Centipede | 4-8 | Slow. Its bite makes you weak. |
| 🕷️ Giant Spider | 4-9 | Strong poison. |
| 💀 Skeleton | 4-9 | Tough. |
| 🧟 Zombie | 5-9 | Very slow, very tough. |
| 🐗 Orc | 5-10 | Pack of 2-3. |
| 😈 Fire Imp | 6-10 | Fast. Throws fire, flees when hurt. |
| 👹 Ogre | 6-11 | Hits very hard, attacks every second turn. |
| 🐺 Dire Wolf | 6-10 | Fast pack of 2-4. |
| 👁️ Watching Eye | 6-11 | Does not move. Slows you, casts lightning. |
| 👻 Wraith | 7-12 | Drains life to heal itself. |
| 🧝 Dark Mage | 7-12 | Caster: slow, blink, lightning. |
| 🧌 Troll | 8-12 | Regenerates 2 HP per turn. |
| 🗿 Stone Golem | 9-12 | Armor 6, slow swings. |
| ☠️ Lich | 10-12 | Caster: raises skeletons, lightning, blink. |
| 🧛 Vampire | 10-12 | Drains life, flees to heal. |
| 🐉 Ancient Dragon | 12 | Boss. 200 HP, breathes fire. Guards the Amulet. |

Pack monsters that are alone and hurt run away.

### Items

Potions, scrolls and wands get random names each run (colors, nonsense labels, wood types). Use one to learn what it is.

| Kind | Types |
|---|---|
| 🧪 Potions (9) | Healing, Extra Healing, Strength, Life, Speed, Telepathy, Descent, Confusion (bad), Poison (bad) |
| 📜 Scrolls (8) | Identify, Enchant Weapon, Enchant Armor, Teleportation, Magic Mapping, Fear, Aggravate (bad), Summon Monster (bad) |
| 🪄 Wands (5) | Firebolt, Lightning (hits all in a line), Slowness, Sleep, Teleport Other |
| Weapons (7) | Dagger (sneak ×3), Short Sword, Mace, Axe (hits all adjacent), Spear (hits the foe behind), War Hammer, Greatsword |
| Armor (6) | Leather, Studded Leather, Ring Mail, Chain Mail, Banded Mail, Plate |

Weapons and armor can have an enchantment (+1 or more, rarely −1).

### Traps (5)

🎯 Poison Dart, 🔔 Alarm (wakes the floor), 🌀 Teleport, 🕳️ Trap Door (falls one floor), 🔥 Fire.

### Classes (4)

| Class | Start | Unlock |
|---|---|---|
| 🧔 Warrior | 32 HP, Short Sword +1, Ring Mail, 2 healing potions | Free |
| 🥷 Rogue | 26 HP, Dagger +1, high agility, knows the bad potions | ⭐ 40 |
| 🧙‍♀️ Mage | 22 HP, wands of Firebolt and Slowness, knows all wands, wits 8 | ⭐ 80 |
| 🦸 Paladin | 30 HP, Mace, Chain Mail, heals 50% faster | ⭐ 150 |

## Run loop

1. Choose a class on the title screen.
2. Explore each floor: items, gold, traps and monster groups. Find the stairs and go down.
3. Level up and train a stat. Find better gear and learn what the unknown items do.
4. On floor 12, take the Amulet from the dragon's room to win. Death ends the run.
5. The score is gold + 150 per floor + 5 per kill + 20 per level (+3000 for a win). Each run gives renown ⭐ (score / 60). Spend renown on the title screen to unlock classes.

The run saves after every turn (`gridcrawler.run`). Meta progress is in `gridcrawler.meta`.

## Code

| File | Contents |
|---|---|
| `src/map.ts` | Room and corridor generator with doors, shadow casting FOV, BFS distance maps, path finding, lines |
| `src/data.ts` | Monsters, weapons, armor, potions, scrolls, wands, traps, classes, XP table |
| `src/game.ts` | Game state as plain data and the pure turn function `act(state, action) => state`: energy queue, combat, monster AI, items, traps, level ups |
| `src/bot.ts` | Auto-explore, a weak bot and a good bot (used by the `x` key, the debug API and the sim) |
| `src/run.ts` | Save data, meta progress, unlocks |
| `src/app.ts` | Screens, canvas renderer, animations, keyboard, mouse and touch input |
| `src/sfx.ts` | WebAudio synth sounds |

`act` clones the state and keeps the RNG state inside it. The same seed and the same actions give the same game.

Monster AI: sleeping monsters wake up by chance when they see you. Wandering monsters walk between rooms and notice you by chance. Hunters follow a distance map to you. Fleeing monsters walk up that map. Ranged monsters step back when you get close. Casters use spells with a cooldown.

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.debug`:

- `debug.step()`: one bot action (start, pick a stat, move, fight, use an item, or rest until healed). Returns `'busy'` during animations and `'end'` on the end screen.
- `debug.state()`: screen, floor, HP, level, monsters in view, last log lines, meta.
- `debug.renown(n)`, `debug.descend()`, `debug.heal()`, `debug.clear()`.
