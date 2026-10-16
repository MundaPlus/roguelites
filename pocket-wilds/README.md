# Pocket Wilds

Monster-taming roguelite (like Pokémon roguelites and Cassette Beasts). Status: playable.

## How to play

1. Choose a partner from 3 starters. A random wild creature joins you too.
2. Cross 5 regions. At each step, pick one of 2–3 paths.
3. In battle, pick a move with a click or the keys `1`–`4`. `S` opens the team, `B` opens the bag, `R` runs from wild battles. `Enter` continues.
4. Weaken a wild creature, then throw a charm from the bag to tame it. Your team holds 6 creatures.
5. A creature that faints is gone for the rest of the run. When all creatures faint, the run ends.
6. Beat 4 gym leaders and the Champion to win.

Tap a creature on the map to see its stats, use items on it, or make it the lead.

## Rules

- **Turn order:** the move with higher priority goes first, then the faster creature. Paralysis halves speed.
- **Damage:** level, move power and attack against defense. Same-type moves deal ×1.5. A critical hit deals ×1.5 (1 in 16, or 1 in 4 for high-crit moves). Damage rolls between 85% and 100%.
- **Status:** burn (1/16 HP per turn, attack halved), poison (1/8 HP per turn), sleep (1–3 turns), paralysis (speed halved, 25% chance to lose the turn). Fire creatures cannot burn, Storm creatures cannot be paralyzed, Stone creatures cannot be poisoned.
- **Stat stages:** some moves raise or lower ATK, DEF or SPD by up to 4 stages.
- **Heal moves:** a creature can use a heal move 2 times per battle.
- **Taming:** chance = species rate × (1 − 0.75 × HP share) × charm strength × status bonus (sleep ×2, other status ×1.5), lower for high levels. The charm shakes 3 times before it holds.
- **XP:** every defeated or tamed foe gives XP. Creatures that fought get all of it, the others get 60%. Foes above your level give more, foes below give less.
- **After a battle:** creatures wake up and heal 25% of max HP. Burn, poison and paralysis stay.
- **Trainer AI:** trainers score every move by expected damage, type, accuracy and KO chance, and pick the best one. Route trainers slip up 30% of the time, gym leaders 12%, the Champion 5%. Leaders use 1–2 potions.

## Types

| Attack | Strong against (×2) | Weak against (×½) |
|---|---|---|
| 🔥 Fire | Nature, Frost | Water, Stone, Fire |
| 💧 Water | Fire, Stone | Nature, Water |
| 🌿 Nature | Water, Stone | Fire, Nature |
| ⚡ Storm | Water, Frost | Stone, Storm, Nature |
| 🪨 Stone | Fire, Storm, Frost | Nature, Stone |
| ❄️ Frost | Nature, Beast | Fire, Frost, Water |
| 👻 Spirit | Spirit, Beast | Stone |
| 🐾 Beast | – | Spirit, Stone |

Dual-type creatures multiply both values.

## Creatures

43 original species. Each has a type (some have two), base stats (HP, ATK, DEF, SPD), a catch rate, a learnset and a nature (+10% / −10% to one stat).

| Type | Lines (evolution level) | Single forms |
|---|---|---|
| Fire | Emberkit → Blazewolf (16) → Solfang (32), Cinderling → Magmadrake (20) | Kilnmoth |
| Water | Finnip → Tidalfin (16) → Leviathorn (32), Puddlet → Torrentoad (18) | Shellby, Squidle |
| Nature | Sproutle → Thornback (16) → Elderoak (32), Budbun → Bloomhare (18) | Fungoo |
| Storm | Zappip → Voltmouse (18), Gustling → Thunderhawk (20) | Staticat |
| Stone | Pebblet → Boulderox (20) | Burrowbit, Geodon |
| Frost | Snowpup → Glacieron (20) | Rimebear, Snowswan |
| Spirit | Wispet → Phantowl (22) | Gloomcat, Hexbat, Lanternwisp |
| Beast | Scrapling → Brawlbadger (18) | Hornbuck, Tuskhog, Mightape, Apexion |

Creatures learn moves of their own type and of a second move pool. When a creature already knows 4 moves, you choose which move to forget, or skip the new move.

## Moves

46 moves, 5–7 per type. Examples:

| Move | Type | Power / Acc | Effect |
|---|---|---|---|
| Ember | Fire | 40 / 100 | 10% burn |
| Scorch Haze | Fire | – / 85 | Burns |
| Mist Veil | Water | – / 100 | Heals 50% |
| Spore Puff | Nature | – / 75 | Sleep |
| Toxic Pollen | Nature | – / 90 | Poison |
| Quick Zap | Storm | 40 / 100 | Goes first |
| Jolt Wave | Storm | – / 90 | Paralysis |
| Thunder Lance | Storm | 100 / 80 | 30% paralysis |
| Iron Shell | Stone | – / 100 | DEF +2 |
| Chill Mist | Frost | – / 95 | Foe ATK −1 |
| Soul Drain | Spirit | 60 / 100 | Heals half the damage |
| Shadow Claw | Spirit | 75 / 100 | High crit |
| Roar Up | Beast | – / 100 | ATK +2 |
| Wild Charge | Beast | 105 / 100 | 25% recoil |

## Items

| Item | Price | Effect |
|---|---|---|
| 🧪 Potion | 100 | Heals half of max HP (at least 20) |
| 💖 Big Tonic | 280 | Full heal and status cure |
| 🍃 Cure Leaf | 70 | Cures status |
| 🔮 Charm | 80 | Taming strength ×1 |
| 💠 Great Charm | 220 | Taming strength ×1.8 |
| 🌟 Prime Charm | 500 | Taming strength ×3 (region 3 on) |
| 🍬 Rare Candy | 450 | +1 level (outside battle) |

## Run loop

1. 5 regions: Mossvale, Tidecoast, Emberpeak, Frostveil, Skyreach. Each region has 8 steps: 3 route steps, a town, 3 route steps, then the gym (the Champion in Skyreach).
2. Route steps offer 2–3 of: 🌿 tall grass (wild battle), ✨ rare den (a strong rare creature), 🧢 trainer (1–3 creatures, gold), 🎁 supplies (items or gold), 🏕️ rest spot (heal 60%, cure status). Encounters come from seeded tables per region.
3. Towns have a free healer, a shop, a move tutor (3 random strong moves) and a fusion shrine. Fusion merges 2 creatures: the base gets a ★ (+10% stats, up to 3), a level above both, and the donor's strongest attack. One fusion per town.
4. 4 of 7 gym leaders appear in each run (Ivy 🌿, Marlo 💧, Volta ⚡, Brask 🔥, Petra 🪨, Nyx 👻, Yuki ❄️). Their teams grow from 2 creatures at level 7 to 4 creatures at level 28. A badge gives gold, items and a full heal.
5. The Champion has 5 creatures at level 33–35.

## Meta progress

Each run gives shards 💎 (score / 150). Spend them in the Sanctuary on the title screen: 3 new starters (Zappip, Pebblet, Wispet) and 3 rare creatures for rare dens (Lanternwisp, Geodon, Apexion). The title screen shows runs, wins, best badges, best score and the tamed species count.

Save keys: `pocketwilds.run` (the whole run, also mid-battle) and `pocketwilds.meta`.

## Balance

A headless sim plays full runs with two bots (`src/bot.ts`).

| Bot | Win rate | Average badges |
|---|---|---|
| Weak (random moves and paths, no items) | 0% | 0.4 |
| Smart (expected-damage moves, switching, potions, taming, fleeing, town use) | 29% | 2.4 |

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Types and chart, moves, species and learnsets, natures, items, regions, leaders |
| `src/mon.ts` | Creature stats, XP, level-ups, move learning, evolution |
| `src/battle.ts` | Pure battle function `battleTurn(state, choice) => { state, log }`, damage, status, taming, trainer AI |
| `src/run.ts` | Run state machine `act(run, action)`: map, nodes, towns, rewards, save data |
| `src/bot.ts` | Weak and smart bots for the sim and the debug API |
| `src/app.ts` | DOM screens, battle log playback, input, debug API |
| `src/sfx.ts` | WebAudio synth sounds |

`battleTurn` never changes its input. The RNG state is part of the battle state, so the same state and choice always give the same result.

## Debug

Open the game with `?debug` (add `&fast` to skip the battle animations). The console then has `window.debug`:

- `debug.step()`: one smart-bot action. Returns `'busy'` while a battle log plays.
- `debug.state()`: `screen` (`title`, `starter`, `map`, `battle`, `notice`, `learn`, `evolve`, `full`, `town`, `end`), region, step, badges, gold, team, battle info.
- `debug.gold(n)`, `debug.shards(n)`.
