# Dust Trail

Caravan journey survival roguelite (like Oregon Trail / Death Road to Canada). Status: design only. The page is a placeholder.

## Play style

Resource management and story choices on the road. You lead a wagon with 4 travelers across a long map. Each day costs food and water. The wagon breaks down. Travelers have traits that change events.

- Text events with choices: a stranger asks for help, a river is too high, a town is on fire.
- Traits and skills open extra choices ("Doctor: treat the wound", "Hunter: track the deer").
- Short real-time scenes: bandit ambushes, river crossings, hunting.

## Run loop

1. Choose the route at each fork: shorter but dangerous, or longer and safer.
2. Towns have shops, jobs and new travelers to recruit.
3. Travelers can get sick, leave, or die. Morale changes their choices.
4. Reach the end of the trail with at least one traveler to win.

## Core systems

- **Resources**: food, water, parts, medicine, money, morale.
- **Travelers**: HP, skills, traits, relations with each other.
- **Events**: data-driven with conditions, choices and weighted outcomes.
- **Map**: nodes with terrain and weather that change the daily cost.
- **Meta**: unlock starting groups and new event chains.

## Tech plan

- DOM for the map, the wagon and the events. Canvas only for the real-time scenes.
- Events as TypeScript data with a small condition language.
- Seeded event deck per run.
