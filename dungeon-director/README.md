# Dungeon Director

New-concept roguelite: keep the hero in the fun zone. Status: design only. The page is a placeholder.

Build the dungeon one room ahead of the hero. Keep it fun, not easy.

## Play style

Reverse dungeon design. A hero bot walks through a dungeon. You place the next rooms, monsters and loot just ahead of it.

- The game measures the hero's fun every turn from danger, reward and surprise.
- A bored hero leaves the dungeon. A frustrated hero quits. A dead hero also ends the run.
- The score comes from the shape of the fun curve: rising tension, a short release, and a peak at the boss give the best score.
- Each hero type likes different things: the cautious hero likes safe rest rooms, the greedy hero likes loot, the reckless hero likes big fights.

## Run loop

1. Each run has a new hero type with a short profile that you must read and use.
2. Each turn, choose 1 of 3 room cards and put it on the path.
3. Between dungeons, spend score on new room cards, monsters and traps.
4. Run 5 dungeons with a good enough score to win.

## Core systems

- **Hero bot**: HP, gear, a mood model (boredom, stress, delight) and simple fight logic.
- **Room cards**: room type, monsters, loot, traps, with their effect on the mood.
- **Fun curve**: a mood history and a scoring function against a target shape.
- **Hero types**: weights for each mood input.
- **Meta**: unlock room cards and hero types.

## Tech plan

- DOM board with a line of rooms and a live fun graph (SVG).
- Pure hero step `(hero, room, rng) => { hero, mood, log }` for tests.
- Seeded hero profiles and card offers.
