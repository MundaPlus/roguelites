# Time Bar Tales

Turn-based JRPG party roguelite (like Final Fantasy ATB roguelites). Status: design only. The page is a placeholder.

## Play style

Party battles with time bars. Each of your 4 heroes and each enemy has a bar that fills by speed. When a bar is full, that unit acts.

- Choose attack, a skill, an item or defend.
- Wait mode pauses the bars while you choose. Active mode does not.
- Weaknesses and elements matter: fire, ice, thunder, holy, dark.

## Run loop

1. A map of floors in a tower with battles, inns, shops and events.
2. Heroes gain levels and learn skills. Recruit new heroes at inns.
3. Gear and accessories change stats and resistances.
4. Defeat the tower boss to win.

## Core systems

- **Time bars**: speed-based fill, haste and slow effects.
- **Skills**: MP cost, targets (one, all, row), elements.
- **Classes**: knight, mage, thief, healer, with skill trees.
- **Enemies**: AI scripts with patterns and counters.
- **Meta**: unlock classes and starting gear.

## Tech plan

- DOM battle screen with bars and menus.
- Pure battle simulation with a time step for tests.
- Keyboard and touch menu navigation.
