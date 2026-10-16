# Trade Winds

Merchant trading roguelite (like Taipan / Merchant of the Seas). Status: playable.

## How to play

1. Each port sells and buys 8 goods. Buy where a good is made (`M`) and sell where it is wanted (`W`).
2. Tap **Buy** or **Sell** on a row. The trade window shows the total price, your profit and the price after the trade.
3. Tap a port on the map to plan a voyage. The panel below the map shows the days, the pirate and storm risk, and the best known margins. Tap **Set sail**.
4. At sea, react to pirates (fight, flee or pay) and read the other events.
5. Repay the loan by week 52. Reach a net worth of 55,000 gold by week 78, or retire early once you have it.

Keys: `1`–`8` pick a good, `B` buy, `S` sell, `T` next tab, `←` `→` pick a port, `Enter` set sail. At sea: `F` fight, `R` run, `P` pay, `Space` continue. `H` help, `Esc` menu.

## Rules

- **Prices.** Mid price = base × demand × (reference stock / stock)^0.8. You buy at +5% and sell at −5% of the mid price.
- **Your trades move prices.** Each unit you buy lowers the stock and raises the price. Each unit you sell does the opposite.
- **Recovery.** Each day the stock moves 7–11% of the way back to normal (per port). Demand drifts back to 1 with small noise.
- **Known prices.** You see the prices of other ports only from your last visit. A passing trader at sea can share fresh prices. The start gives you an almanac of all ports.
- **Travel.** Days = distance / (55 × ship speed), +10% in autumn and +25% in winter.
- **Pirates.** The chance per day depends on the danger of both ports and the season. Win chance = your power / (your power + pirate strength) + 8%. Power = ship guns + 1.5 per guard. Pirates grow stronger over time.
- **Storms.** They damage the hull, can wash cargo overboard and add a day. A hull at 0 sinks the ship and ends the run.
- **Loan.** You start with 500 gold and a loan of 3,000 at 1.5% interest per week. If you still owe money at week 52, the bank seizes the ship. You can borrow more until week 40.
- **Net worth** = gold − debt + cargo and warehouse goods at local prices + half the ship price + half the warehouse rent.

## Content

| Good | Base price | Made in | Wanted in |
|---|---|---|---|
| 🌾 Grain | 16 | Haven, Corsa, Tidewick | Brightwater, Saltcrag, Kestrel |
| 🪵 Timber | 30 | Haven, Northreach, Saltcrag | Valdora, Mistral |
| 🍷 Wine | 55 | Brightwater, Valdora, Tidewick | Northreach, Amberly |
| 🧵 Cloth | 80 | Brightwater, Saltcrag, Amberly | Corsa, Kestrel |
| ⚙️ Iron | 110 | Northreach, Corsa | Haven, Valdora, Mistral |
| 🌶️ Spice | 200 | Kestrel, Mistral | Northreach, Tidewick, Amberly |
| 🎐 Silk | 340 | Valdora, Mistral | Haven, Saltcrag, Corsa |
| 💎 Gems | 640 | Amberly, Kestrel | Brightwater, Tidewick |

| Ship | Cargo | Hull | Speed | Guns | Guards | Price |
|---|---|---|---|---|---|---|
| Sloop | 40 | 40 | 1.0 | 2 | 2 | 1,500 |
| Cutter | 32 | 36 | 1.4 | 1 | 2 | 2,200 |
| Brig | 80 | 70 | 1.0 | 5 | 4 | 6,500 |
| Clipper | 110 | 70 | 1.35 | 3 | 4 | 16,000 |
| Galleon | 180 | 130 | 0.85 | 8 | 6 | 24,000 |
| Frigate | 140 | 170 | 1.1 | 14 | 10 | 38,000 |

Shipyards are in Haven, Saltcrag, Valdora and Amberly. The old ship trades in for half its price.

- **Ports:** 10. Corsa, Kestrel, Tidewick and Mistral sit in pirate waters (red halos on the map).
- **Seasons:** spring (calm), summer (more pirates, wine dear), autumn (harvest makes grain and wine cheap), winter (storms, slow winds, grain and timber dear).
- **News:** 16 cards, for example famine (grain ×2.4), war (iron ×2), bumper harvest, silk fleet, royal wedding, plague, pirate fleet, navy patrol, spice blight. Each lasts 2–7 weeks.
- **Harbor:** bank (repay, borrow), repairs (9 gold per point), guards (150 each, 15 per week), warehouses (1,500 rent, 20 per week, 100 slots).
- **Sea events:** pirates, storms, floating crates, trader tips, fair wind, calm.

## Run loop

1. Pick a home port and a ship on the title screen.
2. Trade between ports. Repay the loan by week 52.
3. Buy a bigger ship, hire guards, rent warehouses.
4. Retire once the loan is paid. The run also ends at week 78.
5. You win with a net worth of 55,000 or more. The score is your net worth.

## Meta progress

Each run gives renown ⭐ (net worth / 2,500, +2 for a repaid loan, +10 for a win). Spend it on the title screen to unlock the home ports Valdora, Amberly and Kestrel, and the start ships Cutter and Brig.

## Price charts

The **Prices** tab shows a line chart of the selected good in the current port for the last 12 weeks. A dashed line marks your average cost when you hold the good. Hover or touch the chart to read a day. Below the chart, a table lists the known prices of that good in every other port, with their age and the sailing days. The map also shows the known price of the selected good at each port.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Goods, ports, ships, seasons, news cards, unlocks, constants |
| `src/market.ts` | Prices, trade quotes and the pure daily update `marketDay` |
| `src/run.ts` | Run state, trades, harbor actions, voyages, encounters, weekly costs, end checks, save data |
| `src/bot.ts` | Smart and weak bots (the smart bot plans trades from the known prices) |
| `src/chart.ts` | SVG line chart and sparkline |
| `src/app.ts` | Screens, sea map, modals, input, debug API |
| `src/sfx.ts` | WebAudio sounds |

`marketDay(market, day, news, rng)` returns a new market and does not change its input. The same seed gives the same run.

## Balance

A headless sim plays the core loop. Results for 300 runs each:

| Bot | Win rate | Median net worth |
|---|---|---|
| Weak (random trades) | 0% | −5,300 (loan unpaid) |
| Smart (plans from known prices) | 43% | 52,500 |

## Debug

Open the game with `?debug` (add `&fast` to skip the day animation at sea). The console then has `window.debug`:

- `debug.step()`: one bot action (start a run, trade, sail, react to an encounter). It returns `'busy'` while the ship sails without `&fast`.
- `debug.state()`: screen, day, port, gold, debt, ship, cargo, net worth, voyage, encounter and the end result.
- `debug.run()`, `debug.gold(n)`, `debug.renown(n)`.
