# Neon Depths

Twin-stick room-clearing roguelite (like The Binding of Isaac). Dive five floors, stack shot items and beat The Overmind.

## Run

```bash
npm run dev            # in this folder, or `npm run dev:neon` at the root
npm run build          # output in dist/
```

## Controls

| Input | Move | Shoot | Dodge | Bomb | Other |
|---|---|---|---|---|---|
| Keyboard + mouse | WASD | Hold left click, or arrow keys | Space, Shift or right click | E or Q | F auto-fire, Tab map, Esc pause |
| Gamepad | Left stick | Right stick | A or RB | B or LB | Start pause, Select map |
| Touch | Left thumb | Right thumb (fires while held) | DODGE button | 💣 button | II pause |

The dodge roll gives a short time with no damage. Bombs break rocks and hurt everything close, you too.

## Run loop

1. Each floor is a grid of rooms. The doors lock until the room is clear.
2. Room types: fight, treasure (👑, free item), shop (🛒, items, hearts and bombs for coins), challenge (⚔️, 3 waves for an item, floor 2+) and boss (💀).
3. Door frames show the room type behind them: red boss, gold treasure, green shop, orange challenge.
4. Beat the boss to get an item and a hatch down to the next floor. You heal 1 heart on each new floor.
5. Beat The Overmind on floor 5 to win.
6. Neon shards (💠) stay after death. Spend them in the hub on upgrades and loadouts.

## Content

| Kind | Count | File |
|---|---|---|
| Items | 36: 11 stat items, 15 shot modifiers, 4 helpers and defenses, 6 boss items | `src/items.ts` |
| Synergies | 8 item pairs that give a bonus | `src/items.ts` |
| Enemies | 13 types. Some come as gold elites with more HP and better drops | `src/enemies.ts` |
| Bosses | 5, one per floor, each with an enrage phase | `src/bosses.ts` |
| Room templates | 14, flipped at random | `src/dungeon.ts` |
| Hub upgrades | 9 | `src/meta.ts` |
| Loadouts | 6 | `src/meta.ts` |

Bosses: Core Sentinel, Hive Mother, Prism Warden, Glitch King, The Overmind.

## Code map

| File | Job |
|---|---|
| `src/game.ts` | Game loop, rooms, physics, shots, damage, drawing, HUD |
| `src/dungeon.ts` | Floor layout, room templates, tile rules |
| `src/enemies.ts` | Enemy types, AI helpers, bullet pattern helpers |
| `src/bosses.ts` | Bosses as lists of timed attacks per phase |
| `src/items.ts` | Items and synergies |
| `src/meta.ts` | Save data, hub upgrades, loadouts |
| `src/render.ts` | Glow sprites, shapes, the cached room layer |
| `src/input.ts` | Keyboard, mouse, gamepad, touch sticks |
| `src/sfx.ts` | WebAudio sound effects |
| `src/ui.ts`, `src/main.ts` | Hub, pause and result screens, the frame loop |

## Add content

- **An item**: add an `ItemDef` to `ITEMS` in `src/items.ts`. Its `apply` changes `Stats` (see `src/types.ts`). Shot behavior comes from the stats, for example `pierce`, `homing` or `split`.
- **An enemy**: add an `EnemyDef` to `ENEMIES` in `src/enemies.ts`. Set `cost` and `minFloor` so rooms can pick it. Use `chase`, `keepRange`, `every`, `ring` and `fan`.
- **A boss**: write a function that returns a list of attacks per phase, then add it with `boss(...)` to `BOSSES` in `src/bosses.ts`.
- **A room template**: add 9 rows of 15 characters to `TEMPLATES` in `src/dungeon.ts`. `#` rock, `X` block, `o` pit, `?` maybe rock.

## Debug

Open the game with `?debug`. Then the browser console has `neon`:

- `neon.god()` turns damage off and on.
- `neon.give('seeker')` gives an item. `neon.items()` lists the item ids.
- `neon.kill()` kills all enemies in the room. `neon.coins(50)` adds coins.
- `neon.speed(3)` runs the game 3 times faster.

The seed is on the pause screen. Type it on the title screen to play the same floors again.
