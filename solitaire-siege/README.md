# Solitaire Siege

Solitaire card combat roguelite (like Solitairica). Status: playable.

## How to play

1. The enemy is a tableau of card columns. Clear every card to win the fight.
2. Your current card sits next to the stock. Tap a top card that is 1 higher or 1 lower than your card (a 7 takes a 6 or an 8). Playable cards glow gold.
3. The cleared card becomes your new card, so you can chain plays, like golf solitaire.
4. Tap the stock or **Draw** when you are stuck. Each draw is one enemy turn.
5. Keys: `1`–`7` play a column, `Space` draws, `Z` undoes, `Q` `W` `E` `R` `T` `Y` `U` cast spells, `8` `9` `0` use potions, `Esc` cancels a target.

## Rules

- **Mana**: each cleared card gives 2 mana of its suit: ♥ Ruby, ♦ Amber, ♣ Jade, ♠ Azure. Each color holds up to 12.
- **Spells** cost mana. Some spells ask for a target: a top card, or a direction (up or down).
- **Enemy turn**: each draw ticks the enemy timers (⏱). An ability fires when its timer reaches 0, then the timer restarts.
- **Stock is your fight HP**: strikes and bombs burn stock cards. 🛡️ Shield blocks burned cards and HP loss first. When the stock is empty, more damage hits your HP.
- **Losing a fight**: with an empty stock and no moves, the fight is lost. You take 3 HP, plus 2 per act, plus 1 per card left. You get no reward. A lost boss fight starts again with a new deal.
- **Hero HP** carries over between fights. At 0 HP the run ends.
- **Undo** takes back your last play, spell or potion. It is not possible after a draw, after a hidden card turns over, or after a spell that uses luck.
- Cards are random, not from one 52-card deck, so the same card can show up twice.

### Special cards

| Card | Effect |
|---|---|
| 🔒 Locked | Cannot be played. Each clear counts the lock down by 1 (starts at 3). |
| 🛡️ Armored | The first play breaks the armor and gives you a copy of the card. The second play clears it. |
| 💣 Bomb | Burns stock cards when its timer runs out. Clear it first to defuse it. |
| 💰 Gold | Gives gold when you clear it. |
| Face down | Turns face up when it becomes the top card. |

## Heroes

| Hero | HP | Stock | Start spells | Notes |
|---|---|---|---|---|
| 🛡️ Knight | 32 | 24 | Nudge, Cleave, Bulwark | Free |
| 🔮 Mage | 25 | 22 | Nudge, Fireball, Joker | Starts with Prism Stone. Unlock: 💎 25 |
| 🗡️ Rogue | 26 | 24 | Long Shot, Sleight, Fireball | Starts with Ouroboros. Unlock: 💎 40 |

Each hero has a spell book of 8 more spells to learn. A hero knows up to 6 spells (7 with the Grimoire).

## Spells

| Spell | Cost | Effect |
|---|---|---|
| ↕️ Nudge | ♠2 | Your card goes 1 up or 1 down |
| 🃏 Joker | ♠3 ♦1 | Your card becomes wild |
| 🔥 Fireball | ♥3 | Burn one top card, also a locked one |
| 🪓 Cleave | ♥4 | Remove the top 2 cards of a column |
| 🌋 Quake | ♣4 | Remove the top card of 3 random columns |
| ☄️ Meteor | ♥5 ♣1 | Remove 5 random cards anywhere |
| 👁️ Foresight | ♠1 | Turn all face-down cards face up |
| 🔨 Shatter | ♥2 | Break all locks, armor and bombs |
| 🛡️ Bulwark | ♦3 | Gain 4 shield |
| 🌿 Mend | ♣3 | Add 3 cards to the stock |
| 💚 Rejuvenate | ♣4 | Heal 5 HP |
| 💨 Haste | ♦2 | Draw a card with no enemy turn |
| 🌫️ Smoke | ♦3 ♣1 | The next 2 draws give no enemy turn |
| ❄️ Frost | ♠3 | All enemy timers and bombs wait 2 more turns |
| 🔀 Sleight | ♠2 ♦1 | Swap your card with a top card |
| 🔷 Prism | ♣2 | Gain 1 Ruby, 1 Amber and 1 Azure |
| 🏹 Long Shot | ♦2 | Play a top card that is 2 away from your card |

An upgraded spell (+) costs 1 less of its main color.

## Enemies

| Act | Fights | Elite | Boss |
|---|---|---|---|
| 🪦 Crypt Gate | 🐀 Rat Swarm, 👺 Goblin Thief (drain, gold cards), 💀 Skeleton (armor), 🟢 Green Slime (grow) | 👹 Ogre (strike, wound) | 🗿 Stone Warden (locks) |
| 🌫️ Sunken Mire | 🧙 Bog Witch (hex), 🥷 Bandit (drain), 😈 Bomb Imp (bombs), 🧟 Ghoul (grow, wound) | 🧌 Bog Troll (armor, grow) | 🐉 Mire Hydra (grow, strike, bombs) |
| 🏰 Gilded Spire | 👻 Wraith (all face down, hex), 🦾 Iron Golem (armor), 🐴 Black Knight (locks), 👿 Pit Demon (bombs, wound) | 🐲 Gilded Wyrm | 🎩 The Dealer (5 abilities, final boss) |

Each enemy has its own column layout, share of face-down cards, special cards and abilities. Strikes and bombs get +2 per act, wounds +1 per act.

| Ability | Effect |
|---|---|
| ⚔️ Strike | Burns N stock cards |
| 🩸 Wound | You lose N HP |
| 🔒 Lock | Locks N cards |
| 🛡️ Armor | Armors N top cards |
| 🌱 Grow | Adds N cards to the tableau |
| 💣 Bomb | Arms a 3-turn bomb on a top card |
| 🌀 Drain | Takes N of your biggest mana |
| 🪄 Hex | Changes your card to a random rank |

## Items

16 relics: Ouroboros (K and A connect), Iron Helm, Extra Deck, Prism Stone, Hot Streak, Skeleton Key, Pickaxe, Third Eye, Gold Tooth, Bloodstone, Cactus, Lucky Coin, Wellspring, Blast Shield, Hourglass, Grimoire.

4 potions (up to 3 carried): 🧪 Elixir (heal 10), 📦 Card Pack (+5 stock), ⚗️ Mana Flask (+2 of each mana), 🍹 Wild Brew (your card becomes wild).

## Run loop

1. 3 acts with 7 steps each. At each step choose a room: fight, elite, event, treasure, shop or campfire. The map shows which enemy waits in each fight.
2. After a win: gold, and one pick of 3 (learn a spell, upgrade a spell, a potion, +2 stock cards or +5 max HP). Elites drop a relic. Bosses give a choice of 3 relics and heal 40% of max HP.
3. Shop: spells, relics, potions, healing, stock cards and a spell upgrade.
4. Campfire: heal 30% of max HP, or upgrade a spell.
5. 5 events: Fortune Teller, Card Sharp, Blood Shrine, Dusty Library, Potion Peddler.
6. Beat The Dealer at the end of act 3 to win.

## Meta progress

Each run gives gems 💎 (score / 80). Spend them on the title screen to unlock the Mage and the Rogue. The title screen shows runs, wins, best act and best score.

The run saves to `localStorage` after each action (`solsiege.run`), also in the middle of a fight. Meta data is in `solsiege.meta`.

## Code

| File | Contents |
|---|---|
| `src/game.ts` | Fight rules as pure functions: deal, play, draw, enemy turn, cast, potions |
| `src/data.ts` | Suits, spells, relics, potions, enemies, acts, heroes |
| `src/run.ts` | Map plan, rewards, shop, events, score, save data |
| `src/bot.ts` | Fight bots (smart and weak) and run choices for tests and the sim |
| `src/app.ts` | Screens, DOM cards with CSS transitions, input, effects, debug API |
| `src/sfx.ts` | WebAudio synth sounds |

Each fight action returns a new fight object and a list of events. The UI keeps the previous object for undo and plays the events as sounds and floating numbers.

## Balance

A headless sim plays full runs (200 runs per hero and bot):

| Hero | Smart bot | Weak bot |
|---|---|---|
| Knight | 52% | 0% |
| Mage | 54% | 0% |
| Rogue | 59% | 0% |

The smart bot plays the longest visible chain and uses spells. The weak bot plays random legal cards.

## Debug

Open the game with `?debug` (add `&fast` to skip waits and animations). The console then has `window.debug`:

- `debug.step()`: one bot action for the current screen (async). It returns `'busy'` while an animation runs.
- `debug.state()`: screen, hero, act, HP, enemy, cards left, stock, mana and the end result.
- `debug.gold(n)`, `debug.gems(n)`, `debug.relic(id)`, `debug.win()`.
