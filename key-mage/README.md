# Key Mage

Typing roguelite roguelite (like Nanotale / Epistory). Status: design only. The page is a placeholder.

## Play style

Spell casting by typing. Enemies walk toward you, each with a word above it. Type the word to hit that enemy. Prefix words choose the element and the shape of the spell.

- "fire" + a target word burns, "frost" slows, "volt" chains to the next enemy.
- Shapes: "wall" blocks a lane, "nova" hits all enemies near you.
- Each correct word raises your combo. A typo breaks the combo.
- Mana limits the strong spells. It refills over time.

## Run loop

1. Waves of enemies on a short map of fights, shrines and shops.
2. After a fight, learn a new spell word or a rune that changes a spell ("fire also spreads").
3. Elites have long words or words that change while you type.
4. Three acts with a boss each. Bosses have phrases instead of words.

## Core systems

- **Typing**: input buffer, target lock on the first letter, accuracy and words per minute.
- **Spells**: element, shape, mana cost, cooldown.
- **Enemies**: speed, HP, word length, special (shield word, decoy word).
- **Word lists**: by length and difficulty, with no repeats on screen at once.
- **Meta**: unlock elements and starting runes.

## Tech plan

- Canvas 2D for the field, DOM overlay for the typed text.
- Keyboard events with a layout-safe check (`KeyboardEvent.key`). A virtual keyboard on touch screens.
- Seeded wave tables and word picks.
