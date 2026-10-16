# Critter Clash

Team auto-battler roguelite (like Super Auto Pets). Status: design only. The page is a placeholder.

## Play style

Team building with triggers. Each round you buy critters from a shop and place them in a line of 5. Then the battle runs on its own: the front critters hit each other until one side is out.

- Each critter has attack, HP and an ability with a trigger: on buy, on sell, on faint, start of battle, on hurt.
- Buy a copy of a critter you own to merge it. 3 copies make level 2.
- Food items buff one critter or the whole team.

## Run loop

1. Each round: 10 gold, a shop of 3–5 critters and 2 foods. Reroll costs 1 gold.
2. Battle against a generated team of the same round.
3. Win: +1 trophy. Loss: -1 life (more lives lost in later rounds).
4. 10 trophies win the run. 0 lives end it.

## Core systems

- **Critters**: tiers 1–6 that unlock as the rounds go up, stats, ability, trigger.
- **Battle sim**: a pure event queue that resolves triggers in a fixed order.
- **Shop**: tier odds per round, freeze to keep a slot.
- **Opponents**: generated teams with the same gold budget.
- **Meta**: unlock critter packs.

## Tech plan

- DOM shop and team line with drag and drop to reorder.
- Battle replay from the event log with simple animations.
- Seeded shops and opponents.
