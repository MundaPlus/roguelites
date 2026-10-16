# Pocket Wilds

Monster-taming roguelite roguelite (like Pokémon roguelites / Cassette Beasts). Status: design only. The page is a placeholder.

## Play style

Turn-based creature battles with a team of up to 6 creatures. Each creature has a type, stats and 4 moves.

- Type matchups: fire beats nature, water beats fire, and so on (8 types).
- Weaken a wild creature and throw a charm to tame it.
- Creatures gain XP, learn moves at level-ups and evolve.
- A fainted creature is gone for the rest of the run.

## Run loop

1. A region is a chain of routes, towns and a gym. Choose one of 2–3 paths at each fork.
2. Routes have wild battles, trainers, items and rest spots.
3. Towns have shops, move tutors and a fusion shrine (merge 2 creatures into 1 stronger one).
4. Beat 4 gym leaders and the champion to win.

## Core systems

- **Creatures**: species data (type, base stats, move list, evolution), level, XP, nature.
- **Battle**: speed order, accuracy, critical hits, status effects (burn, sleep, poison).
- **Taming**: catch chance from HP and status.
- **AI**: trainers pick the best move by expected damage and type.
- **Meta**: unlock starting creatures and new species in the pool.

## Tech plan

- DOM battle screen with sprites drawn as emoji or simple SVG.
- Pure battle function `(state, choices) => { state, log }` for tests.
- Seeded encounter tables per route.
