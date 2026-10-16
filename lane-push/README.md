# Lane Push

Real-time lane attack roguelite (like Clash Royale / reverse Plants vs. Zombies). Status: design only. The page is a placeholder.

## Play style

You attack, the enemy defends. Energy fills over time. Spend it to play unit cards from your hand of 4 into one of 3 lanes. Units walk forward and fight what they meet.

- Break the enemy towers at the end of the lanes to win the battle.
- The enemy AI plays counters: archers against slow tanks, splash against swarms.
- Spells (fireball, freeze, heal) can be dropped anywhere.

## Run loop

1. A map of battles with different enemy decks and tower layouts.
2. After each battle, draft one of 3 new unit cards or upgrade a card.
3. Elites have special towers (a cannon tower, a healing tower).
4. Beat 3 bosses to win.

## Core systems

- **Units**: HP, damage, speed, range, target type (ground, air, buildings).
- **Lanes**: 3 paths. Units fight the nearest enemy in their lane.
- **Energy**: fill rate, max energy, card costs.
- **Deck**: 8 cards, a hand of 4, the next card shown.
- **Meta**: unlock new unit cards for the draft pool.

## Tech plan

- Canvas 2D with a fixed tick simulation that is fair for both sides.
- Drag a card onto a lane to play it, or tap the card and then the lane.
- The AI uses the same rules and energy as the player.
