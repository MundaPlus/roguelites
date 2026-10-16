# Rogue Rally

Top-down racing roguelite roguelite (like Micro Machines with upgrades). Status: design only. The page is a placeholder.

## Play style

Arcade racing from above. Each race is 3 laps against 5 AI drivers on a track built from a seed. Drifting fills the nitro bar.

- Finish in the top 3 to earn parts and money.
- Collisions damage the car. Damage stays between races.
- Weapons and gadgets: mines, oil slicks, ramming plates, a shield.

## Run loop

1. A season is 10 races on a branching map: races, time trials, shops, pit stops.
2. Parts: tires (grip), engine (speed), nitro (boost), armor (HP), gadgets.
3. A boss rival waits at the end of each half of the season.
4. Finish last twice and the run ends.

## Core systems

- **Car physics**: top-down with grip, drift and nitro. Surfaces change the grip (asphalt, dirt, ice).
- **Tracks**: built from tile pieces (straights, curves, jumps, shortcuts) on a grid.
- **AI drivers**: follow a racing line with personality (aggressive, careful, blocker).
- **Parts**: stat changes and special effects with rarity.
- **Meta**: unlock cars with different base stats.

## Tech plan

- Canvas 2D with a camera that follows and turns with the car (optional).
- Fixed-step physics so the AI and the player use the same rules.
- Keyboard and gamepad (Gamepad API) input, touch steering buttons.
