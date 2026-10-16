# Rogue Rally

Top-down racing roguelite (like Micro Machines with upgrades). Status: playable.

## How to play

1. Pick a car in the garage on the title screen and start a new season.
2. On the season map, choose the next stop: a race, a time trial, a shop, a pit stop or a side street.
3. Each race is 3 laps against 5 AI drivers. You start at the back of the grid.
4. Finish in the top 3 to win a part. Finish last and you get a 🏳️. Two 🏳️ end the season.
5. Finish ahead of Queen Vex in the last race to win the title.

### Controls

| Action | Keyboard | Gamepad | Touch / mouse |
|---|---|---|---|
| Steer | `←` `→` or `A` `D` | Left stick or d-pad | ◀ ▶ buttons |
| Gas | `↑` or `W` | RT or A | GAS (or auto gas) |
| Brake / reverse | `↓` or `S` | LT or B | BRAKE |
| Drift (handbrake) | `Space` | X | DRIFT |
| Nitro | `Shift` or `X` | RB | 🔥 |
| Gadget | `E` or `Z` | Y or LB | gadget button |
| Reset car | `R` | — | automatic after 4 s stuck |
| Pause | `Esc` or `P` | Start | ☰ |

After the first tap on a touch button, the car accelerates by itself. Hold BRAKE to slow down. Pressing `↑` or `↓` on the keyboard turns auto gas off.

## Rules

- **Physics**: fixed step (60 Hz). The car keeps its speed when it turns, so it slides. Grip pulls the slide back in line.
- **Drift**: a sideways slide fills the nitro bar. The handbrake makes the slide bigger.
- **Nitro**: more top speed and much more acceleration while the bar lasts.
- **Surfaces**: each tile has a surface.

| Surface | Grip | Speed | Acceleration |
|---|---|---|---|
| Asphalt | 100% | 100% | 100% |
| Dirt | 55% | 93% | 85% |
| Ice | 20% | 100% | 55% |
| Grass (off the road) | max 70% | 55% | 60% |

- **Track pieces**: straights, 90° curves, boost pads (a speed kick and some nitro) and jumps. A jump has a ramp and a mud pit after it. Hit the ramp fast to fly over the mud. Tire walls line both sides.
- **Damage**: walls, crashes and mines cost HP. The car that drives into the other one is the rammer and deals more damage. At 0 HP the car is wrecked and loses 32% of its top speed. Damage stays between races. The pit crew fixes up to 12 HP after each race.
- **Gadgets**: mines (spin the car out, 16 damage), oil (almost no grip for a moment), shield (3 s without damage), nitro cans (+50 nitro). Charges refill each race.
- **AI drivers** follow a racing line: outside before a curve, inside in the curve. They slow down for curves ahead and drift through tight ones.

| Personality | Behavior |
|---|---|
| Aggressive | Steers into cars just ahead. |
| Careful | Brakes earlier, rarely drifts. |
| Blocker | Moves in front of a chaser and drops oil or mines. |
| Balanced | Passes slower cars cleanly. |

## Content

### Cars (meta unlocks)

| Car | Cost | Notes |
|---|---|---|
| 🚗 Hot Hatch | free | Base stats |
| 🏎️ Muscle Car | 🏆 15 | +5% speed, −10% grip, +15 HP |
| 🛻 Dune Buggy | 🏆 25 | +10% acceleration, +35% dirt grip, −15 HP |
| 🚐 Armored Van | 🏆 35 | +60 HP, rams +50%, −20% damage taken, heavy |
| 🛺 Turbo Kart | 🏆 50 | +8% grip, +6% acceleration, +20% nitro fill, −30 HP |

### Parts (27, three rarities)

| Slot | Common | Rare | Epic |
|---|---|---|---|
| 🛞 Tires | Street Tires, Knobby Tires, Ice Studs | Racing Slicks, Drift Compound | All-Terrain Pro |
| ⚙️ Engine | Tuned Intake, Turbocharger | Big V8, E-Motor | Screaming Rotary, Jet Turbine |
| 🔥 Nitro | Spare Bottle, Fast Injector | Hot Mix, Twin Tanks | Plasma Burner |
| 🛡️ Armor | Rubber Bumpers, Steel Plates | Ram Plate, Roll Cage | Titan Shell |
| 🎒 Gadget | Mine Layer, Oil Can | Shield Generator, Nitro Cans | Mine Swarm |

The car has one part per slot. A new part replaces the old one, and the old one sells for 25% of its price.

### Drivers

8 rivals (Rex Ramsey, Polly Pace, Bram Block, Zoe Zoom, Duke Drift, Ivy Frost, Max Crash, Nina Nitro). Each season uses 5 of them. 2 bosses: 🎩 Baron Skidmark (blocker with oil, stage 6) and 👑 Queen Vex (aggressive with mines, final stage). Bosses have more HP and take less damage.

### Themes

| Theme | Surfaces |
|---|---|
| 🏙️ City Circuit | Mostly asphalt |
| 🏜️ Dust Canyon | Mostly dirt |
| ❄️ Frost Ring | Ice and asphalt |
| 🌲 Pine Rally | Asphalt and dirt, a little ice |

## Run loop

1. A season has 14 stages. 10 of them are races (race, time trial or boss race). The other stages offer a shop, a pit stop or a side street.
2. Race prize money goes to the top 5 (100/70/50/30/15%). Championship points: 10/6/4/3/2/1.
3. Top 3 picks 1 of 3 parts. A beaten boss always gives a part choice with better odds for epics.
4. Time trial: you drive alone. The medal times come from a reference AI lap on the same track. No medal counts as last place.
5. Shop: 4 parts, a 30 HP patch and a full repair.
6. Pit stop: one job. Full repair, a tune-up (+3% speed and acceleration, up to 4), or remove one 🏳️.
7. Side streets: 5 events (Sponsor Deal, Back-Alley Mechanic, Street Bet, Scrapyard, Fan Club).
8. The AI gets faster and grips better with every race.
9. Score: points × 10 + races × 40 + race wins × 60 + bosses × 250 + money / 2, + 1500 for the title. Trophies = score / 120.

## Tracks

A track is the outline of a random polyomino (a blob of grid cells with no holes and no pinch points). The outline is one closed loop. The loop is scaled by 2, so every side has straight pieces between the corners. Each point of the loop becomes a tile: a straight or a 90° curve. Surfaces come in runs of 3 to 7 tiles, weighted by the theme. Jumps and boost pads go on straights. The same seed always gives the same track.

## Code

| File | Contents |
|---|---|
| `src/track.ts` | Track generation, tile geometry (local position, racing line, points along the track) |
| `src/race.ts` | Fixed-step car physics, AI drivers, collisions, gadgets, laps and positions |
| `src/data.ts` | Surfaces, themes, cars, parts, drivers, bosses |
| `src/run.ts` | Season plan, entrants, results, rewards, shop, pit stop, events, score, save data |
| `src/bot.ts` | Bot choices for the debug API and the balance sim |
| `src/render.ts` | Canvas renderer: tiles, cars, skid marks, particles, HUD, mini map, track preview SVG |
| `src/app.ts` | Screens, game loop, keyboard / gamepad / touch input, debug API |
| `src/sfx.ts` | WebAudio synth with an engine hum |

The race code has no DOM. The player and the AI use the same physics. The AI can drive the player car too.

Save data: `roguerally.run` (the season) and `roguerally.meta` (trophies, unlocked cars, stats). A reload during a race goes back to the map, and the race starts again.

## Debug

Open the game with `?debug`. Add `&fast` so a race step simulates 20 s instead of 5 s. The console then has `window.debug`:

- `debug.step(smart = true)`: one bot action. In a race it simulates a chunk of race time, with the AI driving your car.
- `debug.state()`: screen, stage, money, HP, strikes, parts, lap, race clock, last place, end data.
- `debug.money(n)`, `debug.trophies(n)`.

## Balance

A headless sim plays full seasons with the race AI driving the player car (150 runs each, Hot Hatch):

| Bot | Title won | Avg. stage reached | 1st place in races | Last place in races |
|---|---|---|---|---|
| Weak (random choices, sloppy steering, 93% pace) | 5% | 8.9 / 14 | 19% | 25% |
| Good (smart parts, repairs, tune-ups) | 42% | 13.3 / 14 | 49% | 7% |
