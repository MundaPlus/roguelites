# Cursed Fairway

Golf roguelite roguelite (like Cursed to Golf). Status: design only. The page is a placeholder.

## Play style

Side-view golf with a shot limit. Each hole is a 2D course. Pick a club, aim and set the power. The ball rolls, bounces and stops on the terrain.

- You have a shot counter for the hole. At 0 shots before the hole, the run ends.
- Hazards: sand (short shots), water (back to the last spot, -1 shot), spikes, wind, moving blocks.
- Idols on the course give +2 shots when you hit them.

## Run loop

1. 18 holes, split into 4 zones. Each zone ends with a boss hole.
2. Branching paths between holes: shops, shortcut holes, curse holes with better rewards.
3. Ace cards (one use each): curve the ball, stop it in the air, bounce on water, add a shot.
4. Gold buys ace cards and club upgrades.

## Core systems

- **Ball physics**: projectile with gravity, wind and bounce on a polyline terrain, roll friction per surface.
- **Clubs**: driver (far, low control), iron, wedge (high arc), putter (ground only).
- **Aim aid**: a dotted arc for the first part of the flight.
- **Courses**: hand-made pieces combined from a seed.
- **Meta**: unlock new aces and starting clubs.

## Tech plan

- Canvas 2D with a camera that follows the ball and shows the whole hole before a shot.
- Fixed-step physics so the aim arc and the real flight match.
- Drag to aim on touch (pull back like a slingshot).
