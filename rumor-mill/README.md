# Rumor Mill

New-concept roguelite: rumors that change as they spread. Status: design only. The page is a placeholder.

Plant a rumor. Watch it change from mouth to mouth. Topple the mayor.

## Play style

Strategy on a social graph. The town is a network of 30–60 people with links between them. You build a rumor from word tiles, for example "the mayor / stole / the grain", and plant it on one person.

- Each turn, every rumor moves along the links to the neighbors.
- Each person can change the rumor by trait: the gossip makes a word bigger, the skeptic removes a word, the loyalist turns the claim around.
- A person who hears the same claim from 2 sources believes it.
- Guards trace rumors back along the path. If they reach you, the run ends.

## Run loop

1. Each town has a goal: make a target share of the town believe a claim within a turn limit.
2. Between towns, get new word tiles and agents (people that you control and can plant rumors through).
3. Later towns have more skeptics, more guards and a rival who spreads a counter-rumor.
4. Win 5 towns to topple the duke.

## Core systems

- **Graph**: people as nodes with traits and belief, links with strength.
- **Rumor**: a short sequence of word tiles (subject, verb, object, modifier).
- **Mutation rules**: a trait maps one rumor to the next rumor (add, remove, swap, invert).
- **Belief**: count of sources per claim per person.
- **Trace**: guards walk back along the path each turn.
- **Meta**: unlock word tiles and agent types.

## Tech plan

- SVG graph with a force layout that is fixed at the start of each town.
- A preview shows how the rumor will change at the next person.
- Pure spread step `(town, rumors) => town` for tests and a solver bot.
- Seeded town generator.
