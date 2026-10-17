# Tip the Scales

New-concept roguelite: tactics on a balance beam. Status: design only. The page is a placeholder.

Everyone stands on one beam. Tip it, and the low end slides off.

## Play style

Turn-based tactics on a balance beam over a pit. Your party and the enemies stand on the same beam. Each unit has a weight.

- The beam tilts toward the heavier side. When it tilts too far, units at the low end slide and can fall.
- Moving, hitting and knock-back all change the balance.
- You can defeat a heavy enemy by tipping it off instead of hitting it.
- A preview shows the tilt and every slide before you confirm a move.

## Run loop

1. 3 acts of fights on different beams. A boss at the end of each act.
2. After a fight, choose a new unit, a skill or an item.
3. Beams: plain, two pivots, hanging from a rope (swings), ice (units slide further).
4. Units with odd weights: balloon (negative weight), anvil, a unit that grows heavier when hit.

## Core systems

- **Beam**: positions, pivot, tilt angle from the weight moment, tilt limit.
- **Units**: weight, HP, moves, knock-back, grip.
- **Slide rule**: units slide toward the low end by the tilt, stop at other units or the edge.
- **Enemy AI**: scores moves by damage and by tipping chances.
- **Meta**: unlock units and beams.

## Tech plan

- SVG or Canvas 2D side view with an animated beam.
- Pure turn function `(state, action) => state` with a full preview of the tilt and slides.
- Seeded fights.
