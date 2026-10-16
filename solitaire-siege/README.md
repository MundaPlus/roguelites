# Solitaire Siege

Solitaire card combat roguelite (like Solitairica). Status: design only. The page is a placeholder.

## Play style

Solitaire as a fight. The enemy is a tableau of cards. Clear a card when it is one higher or one lower than your current card, like golf solitaire.

- Each cleared card gives mana of its suit color.
- Spend mana on spells: deal damage, clear a column, change your card.
- Each card you draw from the stock is one enemy turn: the enemy attacks or casts.
- Clear the whole tableau to defeat the enemy.

## Run loop

1. A map of enemies, each with its own tableau layout and abilities.
2. After a fight, learn a spell or pick an item.
3. Your stock is your HP: an empty stock means you lose.
4. Beat the final boss to win.

## Core systems

- **Tableau**: columns of cards, face up or face down, special cards (locked, armored).
- **Stock**: draw pile, the current card, wild cards.
- **Spells**: mana cost by color, effects on the tableau or the enemy.
- **Enemies**: HP as tableau size, abilities on a timer.
- **Meta**: unlock heroes with different spell books.

## Tech plan

- DOM cards with CSS transitions.
- Pure state functions for clearing and casting, so the game can undo one move.
- Seeded deals per fight.
