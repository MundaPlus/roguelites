# Deep Lure

Fishing roguelite (like Dredge). Status: playable.

You owe the bank 10,000 coins for your boat. You have 14 days to pay. Fish by day, sell in port, and stay out of the dark. Some fish are wrong.

## How to play

1. **Sail.** Hold the mouse or a finger on the sea to steer toward that point. Keys: `W` `A` `S` `D` or the arrows. The boat keeps its momentum, so slow down early.
2. **Fish.** Stop on a ripple spot and press `F`, `Space` or the Cast button. The ▾ marks show the water depth. The 🐟 marks show how many fish are left today.
3. **Reel.** Hold `Space`, the mouse or the reel button to raise the line tension. Let go to lower it. Keep the marker in the green zone to pull the fish in. In the red zone the line strains and can snap. Below the green zone the fish swims away.
4. **Stow.** Each fish has a shape. Tap a hold cell to place it (the cell is the top-left corner of the shape). `R` rotates, `A` places it automatically, `X` throws it back. Tap a stored fish to pick it up and move it.
5. **Sell.** Dock at a port (`E`) before night. Sell the catch, repair, buy gear and lures, then sleep or sail again.
6. **Pay.** Pay the debt at the harbormaster in Greyharbor. When the debt is 0, you win.

Other keys: `H` opens the hold, `K` uses a repair kit, `Esc` opens the menu.

## Rules

- **Time.** The clock runs 6 game minutes per second with the engine on and 1 minute per second when you drift. A cast costs 40 minutes (28 with the Spinner). Night starts at 20:00. At 06:00 a new day starts, also at sea.
- **Hull.** A hit on a rock or a shore faster than 42 speed costs 1 hull point. At 0 the boat sinks: you lose the cargo, the tow adds 150 to the debt, and you wake up in Greyharbor the next morning.
- **Panic** rises at night and falls by day and near ports. The lamp and the Glow Lure slow it down. High panic brings:
  - 20+: strange visitors (night events with two choices).
  - 40+: shades. They chase the boat and ram the hull. Lamp light burns them.
  - 60+: phantom rocks appear in the fog ahead.
  - 80+: something rams the hull now and then. Fish pull harder.
  - 100: you scrape the hull in a panic.
- **Freshness.** Fish lose 20% of their value per day (down to 40%).
- **Aberrant fish** (👁️) bite more at night and at high panic. They fight in an erratic way and pull harder. They sell for 2.2× (3.4× in Cinder Pier) but carry a curse while they are in the hold.
- **Regions.** Thick fog blocks the closed regions. A rare fish opens the next one.
- Each port wants one fish per day and pays +50% for it.

## Regions

| Region | Opens with | Port | Fish |
|---|---|---|---|
| Grey Shallows | open | Greyharbor (home, harbormaster) | Sprat, Mackerel, Flounder, Cod, Gloom Eel (night), **Pearl Carp** |
| Kelp Reach | open | Kelpmoor (lures) | Kelpfish, Sea Bass, Lionfish, Lantern Squid (night), Rock Lobster, **Golden Grouper** |
| Coral Teeth | Pearl Carp | Reefwatch | Parrotfish, Box Jelly (night), Moray Eel, Reef Shark, **Crown Turtle** |
| Ashen Flats | Golden Grouper | Cinder Pier (lures, aberrant ×3.4) | Ash Sole, Cinder Crab, Bone Pike (night), **Ember Koi** |
| The Trench | Crown Turtle or Ember Koi | Lantern Rock | Anglerfish, Gulper Eel, Oarfish (night), The Old Mother (night, legendary) |

25 species in total. Bold fish are rare and open a region.

## Fish fight patterns

| Pattern | Pull |
|---|---|
| Steady | An even pull. |
| Jumpy | Short hard tugs. |
| Deep diver | Long strong dives, then a rest. A weak rod cannot hold the big divers. |
| Thrasher | The pull rises and falls fast. |
| Erratic | The pull changes at random (all aberrant fish). |

## Curses

| Curse | Effect while aboard |
|---|---|
| Whispering | Panic rises 30% faster. |
| Heavy | The boat is 10% slower. |
| Gnawing | At dawn it eats a fish next to it. |
| Leaking | At night it can crack the hull. |

## Gear

| Slot | Tiers (cost) | Effect |
|---|---|---|
| 🎣 Rod | Bamboo, Fiberglass (170), Carbon (460), Abyssal (1,000) | Line strength, width of the green zone, depth 1–3 |
| ⚙️ Engine | Putter, Twin (190), Diesel (480), Turbine (950) | Speed ×1 to ×1.75 |
| 🛡️ Hull | Plank, Oak (150), Steel (400), Ironclad (850) | 3 to 6 hull points |
| 📦 Hold | Crate 5×4, Wide 6×4 (150), Deep 6×5 (380), Great 7×6 (780) | Hold grid size |
| 🏮 Lamp | Candle, Oil Lamp (140), Searchlight (400), Lighthouse Lens (880) | Light radius, burns shades, panic ×1 to ×0.45 |

Lures (Kelpmoor, Cinder Pier): Spinner (fast bites, cheaper casts), Glow Lure (night fish, less panic), Deep Jig (+1 rod depth), Silver Lure (rare fish ×2.5). A snapped line can take the lure with it.

Each port sells different tiers. Greyharbor has tier 2 of everything. The best gear is in the far ports.

## Run loop

1. Start in Greyharbor on day 1 with 40 coins.
2. Each day: sail out, fish, get back before 20:00, sell, upgrade, sleep.
3. Land the rare fish to open new regions. Their fish are worth much more.
4. Pay the 10,000 coin debt in Greyharbor before day 14 ends. Paying it wins the run at once.
5. Score: a win gives 5,000 + 300 per day left + 25 per species + half the coins left. A loss gives 30% of the paid debt + 25 per species.

## Meta progress

Each run gives pearls 🦪 (score / 400). Spend them in the Dockyard on the title screen: 2 repair kits, an old chart, the Oil Lamp, the Twin Engine, the Wide Hold or the Fiberglass Rod at the start. The Journal keeps every species you ever landed.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Regions, fish, curses, gear, lures, ports, night events, constants |
| `src/world.ts` | Seeded map: regions, islands, rocks, spots, nav grid, A* path finder |
| `src/game.ts` | Run state and all rules: boat physics, clock, panic, shades, casting, hold, ports, events, score |
| `src/reel.ts` | Reel minigame state and step |
| `src/hold.ts` | Grid hold: shapes, rotation, placement |
| `src/bot.ts` | Bots for tests and the sim (path planning, reeling, port choices) |
| `src/render.ts` | Canvas renderer: sea, fog, light, minimap, reel overlay |
| `src/run.ts` | Save data and meta unlocks (`deeplure.run`, `deeplure.meta`) |
| `src/app.ts` | Screens, modals, game loop, input, debug API |
| `src/sim.ts` | Headless balance sim (not in the page bundle) |

## Balance

`src/sim.ts` plays full runs with the bots. Bundle a small runner that calls `playRun(seed, 'good' | 'weak')` with esbuild and run it with node. Results over 100 seeds:

| Bot | Wins | Debt paid (avg) |
|---|---|---|
| Weak (random spots, no upgrades, sloppy reeling) | 0% | 903 |
| Good (path finding, best spot value, upgrades, sharp reeling) | 50% | 8,897 |

## Debug

Open the game with `?debug` (add `&fast` to skip the bite wait and play bigger chunks, add `&seed=ABC` for a fixed map). The console then has `window.debug`:

- `debug.step()`: one bot action. At sea it plays 2 seconds of game time (10 with `fast`) with the good bot. It also stows fish, answers events and plays port turns.
- `debug.state()`: screen, modal, reel, day, clock, money, debt, hull, panic, shades, gear and more.
- `debug.money(n)`, `debug.night()`, `debug.panic(n)`, `debug.unlock()`.
