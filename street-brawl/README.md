# Street Brawl

Side-scrolling beat em up roguelite (like Streets of Rage / River City roguelites). Status: design only. The page is a placeholder.

## Play style

Close combat on a 2.5D street. Walk right, fight groups of enemies, then move on.

- Light and heavy attacks chain into combos.
- Grab enemies and throw them into other enemies.
- Pick up weapons: pipes, bottles, chairs.
- Enemies attack from both sides, so position matters.

## Run loop

1. 5 districts with branching streets and a boss at the end of each.
2. Earn cash from fights. Shops sell moves, health and weapons.
3. Learn new moves: a dash punch, a spin kick, a ground slam.
4. Lose all HP and the run ends.

## Core systems

- **Movement**: x and depth, jump, hitboxes and hurtboxes per frame.
- **Combat**: combo strings, hitstun, knockdown, juggles.
- **Enemies**: archetypes (grunt, knife, fat, ranged), group AI that takes turns.
- **Moves**: unlockable special moves with cooldowns.
- **Meta**: unlock fighters with different move sets.

## Tech plan

- Canvas 2D with sprite or vector characters and depth sorting.
- Fixed 60 Hz update with input buffers.
- Keyboard, gamepad, and touch buttons.
