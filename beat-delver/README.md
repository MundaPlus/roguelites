# Beat Delver

Rhythm dungeon crawler roguelite (like Crypt of the NecroDancer). Status: design only. The page is a placeholder.

## Play style

Grid dungeon crawling in time with music. Each beat you can make one move (up, down, left, right). Walking into an enemy attacks it. Enemies also move on the beat, each with a fixed pattern you can learn.

- A move on the beat keeps your gold multiplier. A missed beat resets it.
- The beat bar at the bottom shows the timing window.
- Enemies flash on the beat before they attack.

## Run loop

1. Four zones with 3 floors each. Each floor is a random dungeon with a shop and stairs.
2. Find weapons (dagger, spear, broadsword, whip) with different attack shapes.
3. Buy items with gold: armor, torches, bombs, spells.
4. Each zone ends with a mini-boss on the stairs and a boss at the end.

## Core systems

- **Clock**: a WebAudio beat clock with a generated drum loop. Input is checked against the beat time with a tolerance window.
- **Enemies**: movement pattern (bounce, chase, every second beat), HP, damage.
- **Weapons**: attack shape (1 tile, 2 tiles in line, 3 tiles wide), damage.
- **Dungeon**: rooms and corridors from a seeded generator, with walls you can dig.
- **Meta**: unlock characters and starting items with diamonds.

## Tech plan

- Canvas 2D tile renderer at a fixed grid size.
- Beat clock from `AudioContext.currentTime`, not from `setTimeout`, so timing stays accurate.
- Settings for the timing window and a calibration screen for input lag.
