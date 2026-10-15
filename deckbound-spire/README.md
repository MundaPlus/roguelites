# Deckbound Spire

Turn-based deckbuilder roguelite (like Slay the Spire). Status: design only. The page is a placeholder.

## Play style

Slow and tactical. Each turn you draw 5 cards and get 3 energy. Cards attack, block or apply effects. Every enemy shows its next move (intent), so you can plan around it.

## Run loop

1. Climb a branching map of 3 acts. Each act has about 15 floors.
2. Node types: fight, elite, event (?), shop, rest site, treasure, boss.
3. After a fight, pick 1 of 3 cards or skip. Gain gold and sometimes a potion.
4. Shops sell cards, relics and card removal. Rest sites heal or upgrade a card.
5. Beat the act boss to reach the next act.

## Core systems

- **Cards**: cost, type (attack / skill / power), rarity, upgraded version.
- **Status effects**: block, strength, weak, vulnerable, poison, burn.
- **Relics**: passive effects with triggers (start of fight, on card played, on kill).
- **Meta**: unlock new card pools and a second character.

## Tech plan

- DOM + CSS for cards and animations. No canvas.
- Seeded RNG, so a run can be shared by seed.
- Data-driven cards: one effect list per card (`[{ type: 'damage', amount: 6 }]`).
