# Forget-Me-Not

New-concept roguelite: forgotten skills become enemies. Status: design only. The page is a placeholder.

Learn a skill, forget a skill. What you forget comes back to hunt you.

## Play style

Turn-based fights with a skill bar of limited memory slots. To learn a new skill, you must forget one you have.

- Each forgotten skill becomes a monster that uses that skill. It appears on a later floor.
- Forget a weak skill and you meet a weak enemy later. Forget a strong skill to make room and you must fight it.
- Skills have levels. A skill you upgraded and then forgot comes back at that level.
- Some relics change the rule: "forgotten skills come back one floor later", "your echoes have half HP".

## Run loop

1. 3 acts of about 8 floors. Each floor is a fight, a shrine (learn a skill) or a rest.
2. After each fight, choose one of 3 new skills, or skip.
3. The memory slots start at 4. Some rewards add a slot, but each slot costs max HP.
4. The final boss calls back every echo that you did not defeat on the way.

## Core systems

- **Skills**: cost, effect, level, tags (attack, guard, heal, status).
- **Memory**: a list of slots. Forgetting moves a skill to the echo pool with the floor it was forgotten on.
- **Echoes**: enemies built from a forgotten skill: HP and intent come from its level and tags.
- **Floor generator**: mixes normal monsters and echoes that are due.
- **Meta**: unlock new skills and starting skill bars.

## Tech plan

- DOM fight screen with skill buttons and enemy intent icons.
- Pure fight function `(state, action) => state` for tests and a bot.
- Seeded skill offers and floors.
