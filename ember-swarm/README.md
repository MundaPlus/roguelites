# Ember Swarm

Auto-shooter survival roguelite. You only move. Your weapons fire on their own. Survive 10 minutes, then kill the Ash Colossus.

## Run

```bash
npm run dev            # in this folder, or `npm run dev:ember` at the root
npm run build          # output in dist/ (static files, open from any web server)
```

Open with `?debug` to get `window.ember.game()` and `window.ember.save` in the console.

## Controls

- WASD or arrow keys: move
- Touch, pen or mouse: drag anywhere to move (virtual joystick)
- 1 / 2 / 3: pick a level-up card. R: reroll
- Esc or P: pause

## Run loop

1. Pick a hero. Each hero starts with a different weapon and bonus.
2. Kill enemies. Pick up the XP gems they drop.
3. On each level-up, pick 1 of 3 cards: a new weapon, a weapon upgrade or a passive item. You can hold 5 weapons and 5 passives.
4. Elites arrive every 75 seconds. They drop a chest with free upgrades or an evolution.
5. Swarm rings close in every 90 seconds.
6. At 10:00 the Ash Colossus boss arrives. It dashes at you and summons imps. Kill it to win.
7. Gold you collect stays after the run. Spend it on heroes and permanent upgrades.

## Weapons and evolutions

A weapon at level 5 plus its passive item unlocks the evolution card.

| Weapon | Passive | Evolution |
|---|---|---|
| ☄️ Ember Bolt | ♊ Twin Sigil | Phoenix Barrage |
| 🔥 Flame Whip | ❤️‍🔥 Ember Heart | Inferno Lash |
| 🌀 Cinder Orbit | 🔍 Wide Lens | Solar Halo |
| ♨️ Heat Haze | 🪶 Phoenix Feather | Inferno Heart |
| ⚡ Arc Lightning | ⏳ Hourglass | Storm Crown |
| 💣 Firebomb | 🕯️ Long Candle | Hellfire Rain |

## Code map

| File | Job |
|---|---|
| `src/main.ts` | Boot, screens, main loop, save handling |
| `src/game.ts` | Run state, update, spawn director, rendering, HUD |
| `src/weapons.ts` | Weapon data and behavior |
| `src/items.ts` | Passive items and level-up card rolls |
| `src/enemies.ts` | Enemy types, scaling, boss |
| `src/meta.ts` | Save data, heroes, permanent upgrades |
| `src/ui.ts` | DOM overlays: title, level-up, pause, game over |
| `src/spatial.ts` | Spatial grid for fast collision queries |
| `src/input.ts` | Keyboard and drag joystick |

## Balance knobs

- Run length and boss time: `RUN_LENGTH` in `src/game.ts`
- Spawn rate and enemy cap: `direct()` in `src/game.ts`
- Enemy stats and HP scale per minute: `src/enemies.ts`
- XP curve: `xpFor()` in `src/game.ts`
