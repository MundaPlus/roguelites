# Herd Path

Unit guiding puzzle roguelite (like Lemmings). Status: design only. The page is a placeholder.

## Play style

Indirect control. Your critters walk forward on their own and turn at walls. Give single critters a job to change the path of all the others.

- Jobs: blocker (turns others around), digger, builder (stairs), climber, floater.
- Each level gives a limited number of each job.
- Save a minimum number of critters to clear the level.

## Run loop

1. A map of levels with branching paths.
2. Each level cleared gives a new job type or extra jobs.
3. Curses on some levels: faster walking, less time, fragile ground.
4. Clear the final level to win.

## Core systems

- **Terrain**: a destructible pixel or tile map.
- **Critters**: walker state machine with fall height, job state.
- **Jobs**: limited counts, each changes terrain or behavior.
- **Levels**: entry, exit, hazards (water, fire, traps).
- **Meta**: unlock new jobs and level packs.

## Tech plan

- Canvas 2D with a bitmap mask for the terrain.
- Fixed tick with a speed-up and pause button.
- Click or tap a critter to give it the selected job.
