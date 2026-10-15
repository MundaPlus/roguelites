# Dice & Dungeons

Dice-placement puzzle-combat roguelite (like Dicey Dungeons, with Balatro-style combos). Status: design only. The page is a placeholder.

## Play style

Puzzle and combo math. Each turn you roll your dice and drop them into equipment slots. Each slot has a rule:
- Sword: any die, deals its value in damage.
- Shield: even numbers only, blocks double.
- Lockpick: splits one die into two smaller dice.
- Fireball: needs a 6, burns for 3 turns.

## Run loop

1. Climb a tower floor by floor. Each floor has a few fights and a shop.
2. After a fight, choose new equipment, a dice upgrade or a modifier.
3. Equipment takes space on a small grid, so you choose what to carry.
4. Combos: some equipment pairs trigger bonus effects (for example, two weapons used on matching numbers).
5. Beat the floor boss to go up.

## Core systems

- **Dice**: count, faces (custom faces such as "always 6" or "wild").
- **Equipment**: slot rule, effect, cooldown, upgrade path.
- **Enemies**: they also use dice and equipment, shown face up.
- **Meta**: classes with their own rules (for example, the Thief rerolls, the Inventor builds new dice).

## Tech plan

- DOM with drag and drop (pointer events, works on touch).
- Small art needs: icons and one style for all equipment cards.
- Data-driven slot rules: `accepts(die)` and `resolve(die, ctx)`.
