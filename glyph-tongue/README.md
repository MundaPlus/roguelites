# Glyph Tongue

New-concept roguelite: learn new magic rules every run. Status: design only. The page is a placeholder.

The runes mean something new every run. Learn the language while you fight.

## Play style

Spell writing with hidden rules. You write spells from 8 runes. Each run gives the runes a new random meaning and a new grammar.

- In one run, "fire" before a noun deals damage. In the next run, the same rune heals.
- Word order, the runes that cancel each other and the runes that stack also change.
- You test spells, see the result and write notes in an in-game notebook.
- Knowledge from earlier runs does not help. The skill is to learn a new rule set fast.

## Run loop

1. Early fights are safe test rooms with dummies.
2. Later fights punish wrong guesses: a wrong spell can hit you.
3. Rewards give new runes, more spell length, or a hint scroll that shows one rule.
4. 3 acts with a boss each. Win the run by beating the third boss.
5. The meta perk "Linguist" shows one rule at the start of each run.

## Core systems

- **Runes**: 8 symbols with random meanings per run (element, target, power, verb).
- **Grammar**: random rules per run (word order, cancel pairs, stack pairs).
- **Spell parser**: turns a rune string into effects with the run's grammar.
- **Notebook**: player notes and an auto log of every cast and its result.
- **Meta**: unlock runes, hint scrolls and the Linguist perk.

## Tech plan

- DOM rune keyboard and spell line, canvas for the fight effects.
- The grammar is generated from the run seed, so a run can be replayed.
- A solver bot learns the rules from its casts to check that every run can be won.
