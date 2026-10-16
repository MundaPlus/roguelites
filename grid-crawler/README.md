# Grid Crawler

Classic turn-based roguelike roguelite (like Brogue / Dungeon Crawl Stone Soup). Status: design only. The page is a placeholder.

## Play style

Pure turn-based dungeon crawling. Nothing moves until you act. Each step, attack or item use is one turn for every creature on the floor.

- Walk into a monster to attack it.
- Potions and scrolls are not identified. You learn what they do by using them.
- Monsters have rules you learn: a jackal pack surrounds you, a goblin archer keeps its distance, an ogre hits hard but slowly.
- Doors, corridors and light let you fight one enemy at a time.

## Run loop

1. Go down 12 floors to find the amulet, then win.
2. Each floor has items, gold, traps and a staircase.
3. Level up from XP and choose where your points go (strength, agility, wits).
4. Death is final. The next run starts from floor 1.

## Core systems

- **Map**: rooms and corridors, doors, field of view with shadow casting, memory of seen tiles.
- **Turn system**: an energy queue, so fast monsters act twice for each of your turns.
- **Items**: weapons, armor, potions, scrolls, wands, with random unknown names per run.
- **Monsters**: HP, attack, speed, behavior (wander, hunt, flee, pack).
- **Meta**: unlock new starting classes.

## Tech plan

- Canvas 2D tile renderer with emoji or a small tile set.
- Pure turn function `(state, action) => state` and a message log.
- Keyboard (arrows, numpad, vi keys) and tap-to-move with path finding.
