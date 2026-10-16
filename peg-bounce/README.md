# Peg Bounce

Physics pachinko roguelite (like Peglin). Status: design only. The page is a placeholder.

## Play style

Aim and bank shots. Each turn you drop one orb from the top of a peg board. Every peg the orb hits adds damage. When the orb falls out of the board, your hero attacks with the total.

- Normal pegs add 1 damage.
- Crit pegs (2 per board) double the damage of this shot.
- Refresh pegs bring back all pegs that you broke.
- Bomb pegs explode after two hits and break pegs near them.

## Run loop

1. Walk a branching map: fights, elites, shops, treasure, events.
2. Enemies walk toward you. Each turn you shoot one orb, then the enemies move or attack.
3. After a fight, choose one new orb or upgrade an orb you have.
4. Relics change the physics or the scoring (for example, "orbs bounce 20% more" or "every 10th peg heals 1").
5. Beat the boss at the end of each act. Three acts in total.

## Core systems

- **Orbs**: damage per peg, crit damage, special effect (split, pierce, poison, heavy). Your orb bag cycles like a deck.
- **Pegs**: type, hit count, board layout per fight.
- **Enemies**: HP, speed, attack, special (flying, shielded, summons).
- **Meta**: unlock new orbs and relics with gold that you keep after a run.

## Tech plan

- Canvas 2D with a small custom physics step (circle vs. circle, fixed time step).
- Aim line shows the first bounce only.
- Touch: drag to aim, release to shoot.
