# Street Brawl

Side-scrolling beat 'em up roguelite (like Streets of Rage / River City roguelites). Status: playable.

## How to play

1. Walk right along the street. When a fight starts, the screen locks. Beat every enemy to go on.
2. You move left and right and up and down the street (depth). Attacks hit only targets in about the same lane. Step out of a lane to dodge.
3. Press punch again and again for a combo string. The last hit knocks the enemy down.
4. Heavy is one strong hit. After 2 punches, heavy is a launcher: the enemy flies up and you can hit it again in the air (juggle).
5. Jump, then punch or heavy for a jump kick or a dive kick. A jump also clears shockwaves and thrown knives.
6. Grab an enemy in front of you. Punch to knee it (up to 3 times). Heavy or grab throws it. Hold back to throw it behind you. A thrown enemy knocks down other enemies.
7. Stand on a weapon and press grab to pick it up. Punch swings it. Heavy throws it.
8. Specials are strong moves with a cooldown. You cannot be hit during most of them.

| Action | Keyboard | Mouse | Gamepad | Touch |
|---|---|---|---|---|
| Move | Arrows or `WASD` | – | Left stick or D-pad | Stick |
| Punch | `J` or `Z` | Left click | X | 👊 |
| Heavy | `K` or `X` | Right click | Y | 🦶 |
| Jump | `Space` or `C` | – | A | ⤴️ |
| Grab / pick up | `L` or `V` | – | B | ✊ |
| Special 1 / 2 | `U` / `I` (or `1` / `2`) | – | LB / RB | Top-left buttons |
| Menu | `Esc` or `P` | ☰ | Start | ☰ |

Touch buttons show on touch screens. On a desktop, the "touch buttons" link under the canvas turns them on. On menus, `Enter` or gamepad A presses the main button.

## Rules

- **Hitstun**: a hit stops the target for a few frames. Hits inside that window chain into a combo.
- **Knockdown**: string finishers, heavy hits, dive kicks, throws and some specials knock down. A downed enemy cannot be hit. It gets up after a short time.
- **Juggles**: an enemy in the air can be hit again. Each juggle hit lifts it less.
- **Armor**: Bruisers do not flinch during their attacks until they take enough damage. Bosses flinch only when their poise breaks.
- **Group AI**: only some enemies attack at a time (1 in district 1, up to 3 in district 5). The others wait around you and switch sides to surround you. Tossers keep their distance and throw bottles down your lane.
- **Telegraphs**: a red `!` over an enemy shows a strong attack. Get out of its lane.
- **You get hurt**: 3 quick hits in a row knock you down. After you get up, you blink and cannot be hit for a moment.
- **Combo bonus**: a combo of 8 or more hits gives cash (1 per 4 hits).
- **Pickups**: break crates, barrels and bins for food, cash and weapons. Food heals at once.
- **Extra life**: when you fall with an extra life, you get up with 60% HP and push enemies away.
- Your weapon stays with you to the next street.

## Fighters

| Fighter | HP | Speed | Light string | Throw | Special | Unlock |
|---|---|---|---|---|---|---|
| 🥊 Rex | 110 | 1.9 | Jab, Jab, Cross, Hook (4 hits) | 18 | 💨 Dash Punch | Free |
| 🦵 Mika | 90 | 2.3 | Jab, Low Kick, Jab, High Kick, Roundhouse (5 hits) | 14 | 🌀 Spin Kick | ⭐ 20 |
| 💪 Tank | 125 | 1.55 | Slap, Chop, Hammer (3 hits) | 26, grabs Bruisers | 💥 Ground Slam | ⭐ 40 |

## Specials

You can know 2 specials. Shops sell new ones. With 2 known, you choose which one to forget.

| Special | Cooldown | Effect |
|---|---|---|
| 💨 Dash Punch | 4 s | Rush forward, hit everyone in the way, knockdown |
| 🌀 Spin Kick | 5 s | Kick both sides 4 times |
| 💥 Ground Slam | 7 s | Leap, then a shockwave knocks down everyone close |
| 🐉 Dragon Upper | 4 s | Rising uppercut, launches high |
| 👊 Mega Punch | 6 s | Charge without flinching, then a 44 damage punch |
| 🔥 Second Wind | 25 s | Heal 20 HP and push nearby enemies away |

## Weapons

| Weapon | Hits | Swing | Thrown |
|---|---|---|---|
| 🔧 Lead Pipe | 10 | 13, long reach | 16 |
| 🍾 Bottle | 3 | 12 | 22, shatters |
| 🪑 Chair | 5 | 20, wide, knockdown | 24 |
| 🔪 Knife | 7 | 9, fast | 26 |
| 🏏 Bat | 8 | 15, knockdown | 18 |

A thrown weapon that is not glass drops to the ground with half its hits left.

## Enemies

| Enemy | HP | Attacks | Notes |
|---|---|---|---|
| 🧢 Grunt | 34 | Punch, haymaker | Plain thug |
| 🔪 Slasher | 28 | Fast slash, thrown knife | Drops a knife (35%) |
| 🐻 Bruiser | 90 | Belly slam, charge across the street | Armor during attacks. Only Tank can grab him |
| 🎯 Tosser | 26 | Bottle toss, shove | Keeps away. Drops a bottle (30%) |
| 🐆 Runner | 24 | Flying kick from range, jab | Fast |

Enemy HP is ×1, 1.28, 1.5, 2.15 and 2.7 in districts 1 to 5. Enemy damage is ×1, 1.2, 1.32, 1.85 and 2.2.

| District | Gangs | Boss |
|---|---|---|
| 🏙️ Downtown | Grunt, Slasher, Runner | 🏍️ Spike the Biker: chain whip, charge, calls grunts |
| 🏮 Night Market | + Tosser | 🔪 Chef Cleaver: chop, knife fan over 3 lanes, calls slashers |
| ⚓ The Docks | Grunt, Slasher, a few Bruisers and Tossers | ⚓ Anchor Jack: hammer fist, ground shockwave, calls bruisers |
| 🚇 Subway | All five | 🐍 Viper: kick rush, flying knee, calls runners |
| 🌃 Neon Tower | All five | 🎩 Mr. Big: cane, pistol, cane charge, calls guards |

Bosses call 2 helpers at 66% and 33% HP. When a boss falls, its gang falls too.

## Run loop

1. Title: continue or start a run, read the rules, unlock fighters.
2. Choose a fighter.
3. Each district has 5 steps. At each step choose one of 2 places: a street (3 fights), a tough street (more enemies at once, +50% cash), a shop or a diner. Step 5 is the boss street.
4. A cleared street gives its cash plus a clear bonus. After a boss, choose 1 of 3 free upgrades.
5. Shops sell food, a feast, +20 max HP, an extra life, a new special, 3 upgrades and a weapon to start the next fight with. Prices grow 15% per district.
6. The diner heals 50% of max HP, or trains +10 max HP.
7. Beat Mr. Big in district 5 to win. Lose all HP and the run ends.
8. The run saves between streets (`sb.run`). If you leave during a fight, that street restarts when you continue.

### Upgrades

| Upgrade | Max | Effect |
|---|---|---|
| 🤜 Brass Knuckles | 3 | +20% light damage |
| 🥾 Steel Toes | 3 | +25% heavy, jump and launcher damage |
| ➕ Extra Hit | 1 | One more jab in the light string |
| 🤼 Iron Grip | 2 | Throws +60%, knees +40%, hold longer |
| 🛡️ Thick Skin | 3 | Take 12% less damage |
| 🔨 Weapon Master | 2 | Weapons last 50% longer and hit 25% harder |
| 🧘 Focus | 2 | Special cooldowns 20% shorter |
| 💉 Adrenaline | 3 | Heal 2 HP per KO |
| 💰 Hustler | 2 | +30% cash from KOs |
| 🤹 Juggler | 2 | +35% damage on enemies in the air |

## Meta progress

Each run gives stars ⭐: 4 per district reached, 1 per 15 KOs, +15 for a win. Spend them on the title screen to unlock Mika and Tank. The title screen also shows runs, wins, best district, best score, total KOs and the best combo (`sb.meta`). Score = KOs × 10 + cash earned × 2 + district × 600 + best combo × 25 (+5000 for a win).

## Code

| File | Contents |
|---|---|
| `src/game.ts` | Pure simulation: fixed 60 Hz step, input buffer, combo strings, hit and hurt boxes, hitstun, juggles, grabs and throws, weapons, projectiles, enemy group AI with attack tokens, waves and the camera lock |
| `src/data.ts` | Fighters, moves, specials, weapons, enemies, bosses, districts, upgrades, prices |
| `src/run.ts` | Run state, branching district map, shop, rewards, score, stars, save data |
| `src/bot.ts` | Fighting bots (good, weak, random) for the debug API and the balance sim |
| `src/app.ts` | Screens, canvas renderer (vector fighters with poses, depth sorting, hit-stop, shake, particles), keyboard, mouse, gamepad and touch input |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG |

Characters are vector stick figures with a pose per move phase (wind-up, strike, recovery). Each frame draws all actors, items and props sorted by depth.

## Debug

Open the game with `?debug` (add `&fast` to skip the end-of-street pause). The console then has `window.debug`:

- `debug.step(frames?)`: one bot action. In a fight it simulates `frames` frames (default 600) with the good fighting bot. On other screens it picks a choice like a careful player.
- `debug.state()`: screen, run stats, the current stage (player position and state, enemies, wave, combo).
- `debug.auto(on)`: the bot plays in real time.
- `debug.clear()`, `debug.cash(n)`, `debug.stars(n)`, `debug.hp(n)`.

A full run with repeated `debug.step()` takes about 150 to 250 calls.
