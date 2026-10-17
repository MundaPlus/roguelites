# Poker Face

New-concept roguelite: opponents learn how you bluff. Status: design only. The page is a placeholder.

Announce your move. Lie if you dare. The enemy remembers.

## Play style

Bluffing duels. Each round, both sides secretly pick an action (strike, guard, feint, charge) and announce an intent that can be true or false.

- Actions beat each other in a cycle, so the announced intent matters.
- The enemy AI keeps a record of how often your announcements were true.
- If you never bluff, it trusts you, and one bluff later lands hard. If you bluff too much, it stops believing you.
- Enemies have tells. Learn to read them.

## Run loop

1. A ladder of duels in 3 halls, with a champion at the end of each hall.
2. After a duel, choose a new move, a relic or healing.
3. Enemy types read you in different ways: paranoid, gullible, statistician, mirror.
4. Relics hide your record, show a tell or reset an enemy's memory.

## Core systems

- **Actions**: a small payoff table with damage and effects.
- **Announcements**: true or false intent per round.
- **Belief model**: the enemy's estimate of your honesty and of your favorite actions.
- **Enemy AI**: picks a best response to its beliefs, with its own bluff rate and tells.
- **Meta**: unlock moves and relics.

## Tech plan

- DOM duel screen with a visible "how the enemy sees you" meter.
- Pure round function `(state, myPick, myClaim) => state` for tests.
- Bots with fixed strategies to check that no single strategy always wins.
