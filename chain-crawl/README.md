# Chain Crawl

Swipe-chain puzzle combat roguelite (like Dungeon Raid). Status: design only. The page is a placeholder.

## Play style

Board-reading combat. A 6×6 grid holds tiles: swords, shields, coins, potions and enemies. Drag a path through 3 or more matching tiles (8 directions). The tiles clear and new ones fall in from the top.

- Swords hit every enemy tile that is in the chain. Enemy tiles join a sword chain.
- Shields repair your armor. Coins fill the shop bar. Potions heal.
- After each move, every enemy on the board attacks. Armor absorbs damage first.

## Run loop

1. The run is a descent of 20 floors. Each move is one turn, and the floor goes down every N kills.
2. Filling the XP bar gives a level up: choose one of 3 upgrades.
3. Filling the coin bar opens the shop: equipment for weapon, armor, shield and helmet slots.
4. Boss enemies appear every 5 floors.

## Core systems

- **Grid**: 6×6, gravity refill, chain path validation (adjacent, same type, no repeats).
- **Enemies**: HP, attack, special (armor, poison, explode, spawn).
- **Skills**: active skills with cooldowns (shuffle the board, turn all coins into swords, heal).
- **Equipment**: stats for damage per sword, armor, block, spike damage.
- **Meta**: unlock classes with different skills.

## Tech plan

- Canvas or DOM grid with pointer drag; touch first.
- Pure turn function `(state, path) => state` with a log of events for animation.
- Seeded RNG for tile drops.
