# Brick Rogue

Brick breaker roguelite (like Breakout / Arkanoid roguelites). Status: design only. The page is a placeholder.

## Play style

Paddle control in real time. Move the paddle to bounce the ball into a wall of bricks. The angle of the bounce depends on where the ball hits the paddle.

- Bricks have HP. Some explode, some move, some shoot at the paddle.
- Missing the ball costs a life.
- Power-ups fall from bricks: multi-ball, wide paddle, laser, slow ball.

## Run loop

1. A run is a series of walls on a branching map, with a boss wall at the end of each act.
2. After each wall, pick an upgrade: a ball type (fire, pierce, split) or a paddle part (magnet, shield).
3. Gold buys upgrades in shops.
4. Clear 3 acts to win.

## Core systems

- **Physics**: ball vs. axis-aligned bricks and the paddle, with fixed-step sweeps so fast balls do not tunnel.
- **Bricks**: HP, type, behavior, drop table.
- **Balls**: speed, damage, special effect.
- **Paddle**: width, speed, parts.
- **Meta**: unlock ball types and paddles.

## Tech plan

- Canvas 2D at a fixed board size, scaled to the screen.
- Mouse or touch drag moves the paddle 1:1, keyboard as an option.
- Seeded wall layouts from templates.
