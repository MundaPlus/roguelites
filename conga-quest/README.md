# Conga Quest

Snake-style party crawler roguelite (like Nimble Quest). Status: design only. The page is a placeholder.

## Play style

Arcade snake with a party. Your heroes walk in a line, and you only steer the leader with the arrow keys or swipes. The line moves on a grid at a steady speed.

- Each hero attacks enemies in range on its own: archers shoot, mages hit an area, knights hit next to them.
- Hitting a wall or your own line costs the leader. The next hero becomes the leader.
- Enemies that touch a hero deal damage. A hero at 0 HP leaves the line.

## Run loop

1. Each stage is an arena with waves of enemies and a boss every 5 waves.
2. Enemies drop gems and coins. Gems level up the whole party.
3. Shrines between stages recruit new heroes or upgrade a hero.
4. The run ends when the last hero falls.

## Core systems

- **Line**: grid positions, speed, turn buffer (one queued turn), self-collision.
- **Heroes**: class, attack range and pattern, cooldown, HP, level.
- **Enemies**: chase, ranged, charger, splitter; bosses with patterns.
- **Synergies**: 2 or 3 heroes of the same class give a party bonus.
- **Meta**: unlock hero classes and starting leaders.

## Tech plan

- Canvas 2D with a fixed tick for the line (for example 8 moves per second) and smooth drawing between ticks.
- Touch: swipe to turn. Keyboard: arrows or WASD.
- Seeded wave tables per stage.
