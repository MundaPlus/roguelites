# Code Breaker

Deduction puzzle roguelite (like Mastermind / Wordle roguelites). Status: design only. The page is a placeholder.

## Play style

Logic deduction. Each lock hides a code of colored pegs. Make a guess. The lock shows how many pegs are in the right place and how many have the right color in the wrong place.

- Each lock has a guess limit.
- Fewer guesses give more energy.
- Tools give extra information: reveal one peg, remove a color, a free guess.

## Run loop

1. A vault with floors of locks. Each lock opens a room: loot, a shop, or a trap.
2. Locks grow: longer codes, more colors, repeated colors.
3. Special locks: the hints are wrong once, the code changes after 3 guesses.
4. Open the final vault to win.

## Core systems

- **Code**: length, color count, repeats allowed or not.
- **Feedback**: exact and color matches.
- **Tools**: one-use helpers bought with energy.
- **Locks**: rule modifiers.
- **Meta**: unlock tools and lock types.

## Tech plan

- DOM board with pegs and a guess history.
- A solver that counts the remaining possible codes, for hints and difficulty checks.
- Keyboard input for colors.
