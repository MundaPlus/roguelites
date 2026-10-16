# Duel Dojo

1v1 fighting roguelite (like Street Fighter-style roguelites). Status: playable.

## How to play

1. Pick a fighter and climb a ladder of 8 opponents. The 8th is the boss, the Oni Shogun.
2. Each fight is one round of 60 seconds. When the time runs out, the fighter with more HP (in %) wins.
3. After each win, pick a technique: a new special, a stat upgrade or a passive. You heal 35% of your max HP. Your HP carries over to the next fight.
4. Lose one fight and the run ends.

### Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Walk, jump, crouch | `←→↑↓` or `WASD` | Stick or d-pad | Pad on the left |
| Block | Hold back (away from the opponent). Hold down-back for low. | Same | Same |
| Light attack | `J` or `Z` | A | `L` |
| Heavy attack | `K` or `X` | B | `H` |
| Special | `L` or `C`, alone or with `→`, `←`, `↓` | X | `S` |
| Throw | `I` or `V`, or Light + Heavy together | Y | `T` |
| Super (full meter) | Special + Heavy together (or `O`) | RB | `S+H` |
| Pause | `Esc` or `P` | Start | `☰` |

Motion inputs are optional. Turn them on with the button on the title screen or in the pause menu. Then `↓↘→`, `↓↙←`, `→↓↘` and `↓↓` + an attack also start the specials in the forward, back, down and neutral slots, with +10% damage.

## Rules

- Every move has frame data: startup, active and recovery frames, damage, hitstun and blockstun. The move list (📜) shows it.
- Each move has a hitbox on its active frames. Each fighter has hurtboxes that change per frame: crouching, jumping, extended limbs, and moves such as the slide (low) or the spin kick (raised).
- Hit levels: **mid** (block high or low), **low** (block crouching), **high** (block standing: jump attacks and overheads), **throw** (cannot be blocked).
- Throws beat blocks and lose to attacks. A normal throw can be broken: press throw within 10 frames after you are grabbed. Command grabs and grab supers cannot be broken.
- Cancels: when a hit or block connects, Light cancels into Light (up to 3) or Heavy, and Heavy cancels into a special. Any move cancels into the super.
- Combo damage drops 12% per hit (down to 35%). A counter hit (you hit an opponent who is starting an attack) deals +20% and adds 4 frames of hitstun.
- Button presses are buffered for 8 frames.
- The super meter fills when you deal damage, take damage or block. Supers are invincible at the start and freeze the screen for a moment.
- Hits cause hit-stop, flashes, sparks and screen shake. Knockdowns give a short invincible wake-up.

## Fighters

| Fighter | Style | HP | Specials | Super | Unlock |
|---|---|---|---|---|---|
| 🥋 Kai | Balanced | 105 | Ki Blast, Rising Dragon, Whirlwind Kick | Shinku Blast (5-hit projectile) | Free |
| 🐯 Mei | Rushdown, fast walk | 106 | Tiger Rush, Falling Crescent, Serpent Slide | Thousand Blossoms (6-hit rush) | 40 honor |
| 🐻 Rook | Grappler, slow, strong throws | 118 | Bear Hug, Iron Lariat, Earth Wave | Mountain Drop (grab) | 70 honor |
| 🌀 Zed | Zoner | 106 | Wind Blade, Earth Wave, Mirror Stance | Storm Beam (4-hit beam) | 110 honor |
| 👹 Oni | Boss | 104 | Ki Blast, Tiger Rush, Rising Dragon, Whirlwind Kick | Raging Demon (dash grab) | Win a run |

## Specials

Each special sits in one slot: `S` (neutral), `→ S`, `← S` or `↓ S`. A new special replaces the one in its slot.

| Special | Slot | Effect |
|---|---|---|
| 🔵 Ki Blast | S | Slow projectile, chip damage |
| 🌀 Wind Blade | S | Fast, weak projectile |
| 🌪️ Iron Lariat | S | 2 hits on both sides, passes through projectiles |
| 🌙 Falling Crescent | S | Hop into an overhead kick |
| 🐯 Tiger Rush | → S | Dash punch, unsafe on block |
| 🐻 Bear Hug | → S | Command grab, cannot be broken |
| ⚡ Thunder Palm | → S | Heavy palm, big push and chip |
| 🌀 Whirlwind Kick | ← S | 3 travelling kicks, goes over lows |
| 🪞 Mirror Stance | ← S | Counter stance: an attack that touches you is countered |
| 🐉 Rising Dragon | ↓ S | Invincible anti-air uppercut, very unsafe |
| 🐍 Serpent Slide | ↓ S | Low slide under projectiles, knocks down |
| 🌋 Earth Wave | ↓ S | Low ground wave, knocks down |

## Techniques

| Kind | Techniques |
|---|---|
| Stats (up to 3 each) | Iron Body (+15 max HP), Power (+12% damage), Swift Feet (+12% speed), Focus (+35% meter), Hard Skin (-10% damage taken) |
| Passives | Leech Fist, Iron Guard, Second Wind, Counter Sense, Battle Ready, Iron Grip, Spiked Guard, Momentum, Meditation, Overdrive, Kip-up, Slippery, First Strike |

Each offer has one new special, one stat and one passive.

## Opponents

The ladder takes 7 of these 10 opponents in a seeded random order, then the boss. Each one has a style that drives the AI.

| Style | Opponents | Behaviour |
|---|---|---|
| 🔥 Rushdown | Tora, Blaze, Viper | Walks in, attack strings, lows, throws, jump-ins |
| 🎯 Zoner | Kaze, Hoshi | Keeps distance, projectiles, pokes, jumps back |
| 🤼 Grappler | Gorr, Big Bo | Walks in to throw and command grab |
| 🛡️ Counter | Sensei Ren, Mirror Monk | Blocks, waits, punishes, counter stance |
| ⚖️ Balanced | Jin | A bit of everything |
| 👑 Boss | Oni Shogun | Switches between all styles |

The AI sees the other fighter with a delay. The reaction time goes from 34 frames (fight 1) to 16 frames (boss). Block chance, aggression, combo chance, HP and damage also grow with each fight.

## Meta progress

Each run gives honor (6 per won fight, +30 for a full win, +1 per 400 score). Spend it on the title screen to unlock 3 fighters and 3 stages. A full win unlocks Oni and the Oni Gate stage. Stages: Old Dojo, Bamboo Grove, Neon Rooftop, Red Temple, Oni Gate (boss stage).

## Code

| File | Contents |
|---|---|
| `src/game.ts` | Pure 60 Hz fight simulation: input buffer, motion detection, frame data, hitboxes and hurtboxes, throws, projectiles, pushboxes |
| `src/ai.ts` | AI with reaction delay and 6 styles. Also the bot for tests |
| `src/data.ts` | Moves with frame data, fighters, specials, supers, opponents, stages, techniques, ladder difficulty |
| `src/run.ts` | Ladder, rewards, healing, score, honor, save data |
| `src/draw.ts` | Vector fighters (poses with 2-bone IK), projectiles, stages |
| `src/app.ts` | Screens, fixed-step loop, camera, effects, HUD, keyboard, gamepad and touch input |
| `src/sfx.ts` | WebAudio synth sounds |

Saves: `dueldojo.run` and `dueldojo.meta` in `localStorage`. A reload during a fight restarts that fight.

## Debug

Open the game with `?debug` (add `&fast` to skip intros and the KO pause, `&boxes` to draw hitboxes and hurtboxes). The console then has `window.debug`:

- `debug.step(frames?)`: one bot action. In a fight it simulates `frames` frames (default 600) with the AI playing for you.
- `debug.state()`: screen, rung, HP, fight state, techniques, end result.
- `debug.auto(on)`: the bot plays for you in real time.
- `debug.win()`: win the current fight. `debug.honor(n)`: add honor.
