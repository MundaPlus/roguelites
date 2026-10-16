# Trade Winds

Merchant trading roguelite (like Taipan / Merchant of the Seas). Status: design only. The page is a placeholder.

## Play style

Market reading and risk. Sail between ports. Each port has prices for 8 goods. Buy where a good is cheap and sell where it is dear.

- Prices react to supply: if you sell a lot of silk in one port, the price there falls.
- News events change prices: a famine raises the price of grain, a war raises the price of iron.
- Cargo space limits how much you can carry.
- Voyages cost days. Pirates and storms can take cargo.

## Run loop

1. Start with a small ship and a loan with interest.
2. Pay the loan back within 52 weeks, then earn as much as you can.
3. Buy bigger ships, guards and warehouses.
4. The score is your net worth at the end.

## Core systems

- **Market**: base price, supply, demand, recovery speed per good and port.
- **Events**: news cards with price effects for a few weeks.
- **Travel**: routes with days and risk, weather by season.
- **Finance**: loans, interest, warehouse fees.
- **Meta**: unlock starting ports and ships.

## Tech plan

- DOM tables and a simple SVG sea map.
- Pure market update function per day for tests.
- Price history charts per port.
