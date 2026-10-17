# Clause Duel

New-concept roguelite: draft the rules before the fight. Status: design only. The page is a placeholder.

Pick the clauses with your enemy. Both of you must obey them.

## Play style

Rule drafting, then a short fight. Before each fight, you and the enemy take turns picking clauses from a shared offer. Both sides must obey every clause in the fight.

- Examples: "No one may heal", "The first hit each turn deals double", "Whoever has less HP acts first", "Guard lasts one extra turn".
- The enemy shows which clauses it wants. You can take a clause only to deny it.
- The fight then runs on simple intents (attack, guard, special) under the drafted clauses.
- A good draft wins most fights before the first blow.

## Run loop

1. 3 acts with a boss each. Each node on the map is a fight, an elite, a scribe (shop) or a rest.
2. After a fight, add a clause card to your own pool, or upgrade your fighter.
3. Perks change the draft: "veto one clause", "add a 4th clause", "see the enemy's second choice".
4. Bosses start with one fixed clause that you cannot remove.

## Core systems

- **Clauses**: rule modifiers with hooks into the fight engine (on hit, on turn start, on heal, order).
- **Draft**: an offer of 5–7 clauses, alternating picks, enemy preferences shown.
- **Fight engine**: turn order, intents, damage, guard, status. Clauses change each step.
- **Enemy AI**: scores clauses for itself and against you.
- **Meta**: unlock clause cards and fighters.

## Tech plan

- DOM draft table and fight screen.
- Pure fight function `(state, clauses, action) => state`, so the AI can score a clause by simulating fights.
- Seeded offers and enemies.
