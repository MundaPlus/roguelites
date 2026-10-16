# Ink Bridge

Line-drawing physics puzzle roguelite (like Brain It On / Crayon Physics). Status: design only. The page is a placeholder.

## Play style

Drawing as a tool. Draw a line or a closed shape on the screen. When you let go, it becomes a solid object with physics. Use it as a bridge, a ramp, a lever or a weight.

- Ink is limited per level.
- Some areas do not allow drawing.
- A level is solved when the ball reaches the goal.

## Run loop

1. A map of levels with stars for using little ink.
2. Ink upgrades and special pens (rubber, glue, heavy) from chests.
3. Boss levels have moving parts and timers.
4. Clear 3 worlds to win.

## Core systems

- **Physics**: rigid bodies from drawn polylines (thick line segments and polygons).
- **Ink**: length budget, pen types with material properties.
- **Levels**: static shapes, no-draw zones, goals, hazards.
- **Stars**: ink used and time.
- **Meta**: unlock pens.

## Tech plan

- A 2D physics library (such as planck.js) with a fixed step.
- Canvas 2D drawing with line smoothing.
- Mouse and touch drawing with undo.
