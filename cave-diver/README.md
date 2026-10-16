# Cave Diver

Side-view platformer roguelite (like Spelunky). Status: design only. The page is a placeholder.

## Play style

Movement skill. You run, jump, climb and fall through generated cave levels. Every level has an exit at the bottom. Build stats matter less than how well you move.

- Jump, hang on ledges, climb ropes and ladders.
- Whip attack at short range.
- Bombs break the terrain. Ropes let you climb back up.
- Traps: spikes, arrow traps, falling blocks, lava.

## Run loop

1. Start with 4 HP, 4 bombs and 4 ropes.
2. Each level has gold, crates and a shopkeeper sometimes. Rescue a pet at each level for 1 HP.
3. Four zones with four levels each: mines, jungle, ice caves, temple.
4. The temple has a final boss. Beat it to win.
5. Shortcuts to later zones open after you reach them a few times.

## Core systems

- **Level generator**: a 4×4 grid of room templates with a sure path from the top to the bottom.
- **Items**: spring shoes, climbing gloves, shotgun, jetpack, compass, and others.
- **Enemies**: snake, bat, spider, caveman, yeti, mummy. Each has one simple behavior.
- **Physics**: tile collision, gravity, knockback. Thrown items and bodies hit enemies.

## Tech plan

- Canvas 2D, 16 px tiles, fixed time step at 60 Hz.
- Destructible tilemap with a quick neighbor update after a bomb.
- Input: keyboard and gamepad. Touch: on-screen buttons for move, jump, attack, bomb and rope.
