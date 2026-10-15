# Deckbound Spire

Turn-based deckbuilder roguelite (like Slay the Spire). Climb three acts, build your deck and defeat the Ashen Lord.

## Run

```bash
npm run dev            # in this folder, or `npm run dev:deck` at the root
npm run build          # output in dist/
```

## Controls

- Click a card to play it. For an attack with more than one enemy, click the card, then the enemy.
- 1–0: play cards. E: end the turn. Esc or right-click: cancel.
- Hover over intents, statuses, relics and potions to see what they do.

## Run loop

1. The Sleeping Whale gives one opening gift: Max HP, a card removal, a relic or gold.
2. Each act has a map of 15 rows. Paths branch and never cross. You pick the next room.
3. Room types: fight, elite, event (?), merchant, rest site, treasure (row 9), rest (row 15), then the boss.
4. After a fight, take gold, maybe a potion, and pick 1 of 3 cards (or skip). Elites also drop a relic.
5. After a boss, pick 1 of 3 boss relics. The next act starts with full HP.
6. Win by beating the act 3 boss. The run saves after each room. "Continue" on the title screen resumes it.

## Combat

- 3 Energy and 5 cards per turn. Block expires at the start of your next turn.
- Each enemy shows its next move (intent) and its damage.
- Statuses: Strength, Dexterity, Weak, Vulnerable, Frail, Poison, Thorns, Metallicize, Ritual, Artifact and more.
- Status cards (Wound, Dazed, Burn, Slimed) and the curse Regret clog your deck.

## Content

| Kind | Count | File |
|---|---|---|
| Cards | 45 player cards + 5 status and curse cards | `src/cards.ts` |
| Relics | 26 (starter, common, uncommon, rare, boss) | `src/relics.ts` |
| Potions | 11 | `src/potions.ts` |
| Enemies | 23, including 6 elites and 3 bosses, over 3 acts | `src/enemies.ts` |
| Events | 9, plus the opening blessing | `src/events.ts` |

## Code map

| File | Job |
|---|---|
| `src/app.ts` | Screens, input, run flow, animations |
| `src/combat.ts` | Combat engine: turns, cards, damage, statuses, relic hooks |
| `src/render.ts` | HTML for cards, HP bars and statuses |
| `src/run.ts` | Run state, rewards, prices, saves |
| `src/map.ts` | Map generation |
| `src/rng.ts` | Seeded RNG. The same seed gives the same map, fights and rewards. |
| `src/types.ts` | Shared types, including the `Op` effect steps |

## Add content

- **A card**: add an entry to `list` in `src/cards.ts`. Effects are `Op` steps (`dmg`, `block`, `status`, `draw` …). `{D}` and `{B}` in the text show live damage and block.
- **An enemy**: add an `EnemyDef` to `src/enemies.ts` with moves and an `ai` function, then add it to an encounter in `ACTS`.
- **A relic**: add a `RelicDef` with hooks (`combatStart`, `turnStart`, `afterCard` …) in `src/relics.ts`.
- **An event**: add an `EventDef` to `EVENTS` in `src/events.ts`.
