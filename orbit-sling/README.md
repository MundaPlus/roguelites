# Orbit Sling

Gravity slingshot roguelite (like Angry Birds in space / Gravitee). Status: design only. The page is a placeholder.

## Play style

Shots under gravity. Each planet pulls the projectile toward it. Aim and set the power, then watch the shot curve around planets to hit targets.

- The aim line shows a short part of the path.
- Black holes pull hard. Moons orbit and move between shots.
- Shields and asteroids block shots.

## Run loop

1. A sector map of systems. Each system has targets to hit with a limited number of shots.
2. Special shots: split, heavy (stronger pull), phase (passes through one planet).
3. Credits from clean shots buy shot types.
4. Clear 5 sectors to win.

## Core systems

- **Physics**: n-body gravity from fixed planets, integration with small steps.
- **Shots**: mass, speed, special effect.
- **Systems**: planets, moons with orbits, targets, hazards.
- **Scoring**: shots used, bank shots, trick shots.
- **Meta**: unlock launchers and shot types.

## Tech plan

- Canvas 2D with glow effects.
- Fixed-step integration so the aim line and the real path match.
- Drag to aim on touch and mouse.
