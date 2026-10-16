# Duel Dojo

1v1 fighting roguelite (like Street Fighter-style roguelites). Status: design only. The page is a placeholder.

## Play style

One-on-one fighting. Two fighters on a small stage. Attacks have startup, active and recovery frames.

- Block high or low. Throws beat blocks.
- Special moves use motion inputs or simple button combos (option for simple mode).
- A super meter fills when you attack or block.

## Run loop

1. A ladder of 8 opponents, each with its own style and a boss at the end.
2. After each win, pick a technique: a new special, a stat upgrade, or a passive.
3. HP carries over between fights, with a small heal.
4. Lose a fight and the run ends.

## Core systems

- **Frame data**: startup, active, recovery, hitstun, blockstun per move.
- **Collision**: hitboxes and hurtboxes per frame.
- **AI**: reacts to the player state with difficulty-based reaction times.
- **Input**: buffers and motion detection.
- **Meta**: unlock fighters and stages.

## Tech plan

- Canvas 2D at a locked 60 Hz with frame-perfect logic.
- Data-driven move lists.
- Keyboard and gamepad support.
