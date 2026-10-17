# Clause Duel

New-concept roguelite: draft the rules before the fight. Status: playable.

Pick the clauses with your enemy. Both of you must obey them.

## How to play

1. Choose a fighter on the title screen and start a run.
2. On the map, choose one of two nodes in each row: ⚔️ fight, 💀 elite, 🪶 scribe (shop) or 🔥 rest. The last row is the boss.
3. **Draft.** Before each fight, an offer of 6 clauses appears. You and the foe pick in turns, 2 picks each. On your pick you **Take** a clause or **Burn** it, so no one gets it.
4. Each card shows a sim preview. 💔 is the HP you lose in this fight, from 40 sim fights. ▼ is good for you, ▲ is bad. A holder clause shows two numbers: "you take" and "foe takes". A law shows one number.
5. The **foe wants** panel lists the foe's top 2 wishes (take or burn) with a short reason. The foe always picks its ① wish. The list updates after your pick.
6. **Fight.** Each round, pick ⚔️ Attack, 🛡️ Guard or your Special. The foe's next intent is shown above it. Each button shows the exact result of the round ("deal 6 · take 5").
7. Win the fight to get gold and a reward. Your HP carries over. Lose all HP and the run ends.

Keys: `1`–`7` select a card, `T` take, `B` burn, `V` veto, `Enter` start the fight. In a fight: `A` attack, `G` guard, `S` special. Map: `1` or `2`. `H` help, `M` mute, `Esc` menu.

## Rules

- A **law** is the same rule for both sides. A **holder** clause helps only the side that takes it. Take a holder clause that the foe wants, and the foe can't have it.
- Picks: you pick first in a normal fight. In an elite or boss fight, the foe picks first. Clauses that no one picks are gone.
- A boss has one 🔒 sealed clause. It is active from the start and you can't remove it.
- Round order: start effects (Foul Air, poison, Second Wind), then all guards, then the two actions. You act first by default. First Move and Low Ground change the order.
- Block fades at round end. A Special has a recharge time (for example, every 3 rounds).
- Overtime: from round 6, hits deal +3 more each round. So every fight ends.

### Clauses

| Clause | Kind | Rule |
|---|---|---|
| 🚫 Bloodless | Law | No one can heal. |
| 🧱 Long Guard | Law | Block halves at round end instead of fading. |
| 🩸 Low Ground | Law | The side with less HP acts first. |
| ☠️ Foul Air | Law | Both sides lose 2 HP at each round start. |
| ⚡ Quickdraw | Law | The first hit each round deals double. |
| 🤐 Hush | Law | No one can use a Special in rounds 1–2. |
| ⚖️ Cap | Law | No hit deals more than 7. |
| 📌 Sharp Blades | Law | Hits ignore 3 block. |
| 🌵 Spikes | Law | Hit a side that guards, take 4 back. |
| ⏩ Haste | Law | Specials recharge 1 round faster. |
| 🔥 Bloodrush | Law | Hits deal +3 to a side below half HP. |
| ⏰ Short Fuse | Law | Overtime starts in round 4, not 6. |
| 🥇 First Move | Holder | Holder acts first each round. Low Ground beats it. |
| 🗡️ Edge | Holder | Holder's hits deal +3. |
| 🛡️ Bulwark | Holder | Holder's Guard gives +5 block. |
| 🧛 Leech | Holder | Holder heals 3 on each hit that deals damage. |
| 🏁 Head Start | Holder | Holder starts with 10 block. |
| 🎯 Opening Blow | Holder | Holder's first hit in the fight deals +8. |
| 📜 Guard Tax | Holder | The other side's Guard gives 4 less block. |
| 🙊 Gag | Holder | The other side can't use a Special in rounds 1–3. |
| 🤺 Riposte (unlock) | Holder | When the holder guards and is hit, it deals 5 back. |
| 💢 Fury (unlock) | Holder | Holder's hits deal +4 while it is below half HP. |
| 🩹 Second Wind (unlock) | Holder | Holder heals 8 at the start of round 3. |
| ⏱️ Focus (unlock) | Holder | Holder's Special recharges 1 round faster. |

### Fighters

| Fighter | HP | ATK | Guard | Special |
|---|---|---|---|---|
| 🧑‍🎤 Duelist | 40 | 6 | 6 | Lunge: hit for ATK+3, ignores block. Every 3 rounds. |
| 🧝 Cleric (unlock) | 38 | 6 | 6 | Mend: heal 10. Every 3 rounds. |
| 🧔 Warden (unlock) | 40 | 5 | 7 | Shield Bash: guard, then hit for 4. Every 2 rounds. |
| 🧙 Venomist (unlock) | 38 | 6 | 5 | Venom: hit for ATK, poison 3 for 3 rounds. Every 3 rounds. |

### Enemies

Each enemy brings its own clause card to the offer.

| Act | Foes | Elite | Boss (sealed clause) |
|---|---|---|---|
| 1 | 🐺 Dire Wolf, 🦀 Shellback, 🧟 Ghoul, 🐍 Adder, 👺 Imp | 🏴‍☠️ Bandit Captain | ⚖️ The Notary (Guard Tax) |
| 2 | 🦇 Vampire, 🗿 Golem, 🐗 Tusk Boar, 🧹 Hedge Witch, 🦂 Scorpion | 🤖 Iron Knight | 🏛️ The Magistrate (First Move) |
| 3 | 🐉 Drake, 💀 Lich, 🕷️ Spider Queen, 🪓 Berserker, 🗽 Sentinel | 👹 Ogre | 👑 Arch-Chancellor (Gag) |

Foe styles: aggressive foes attack most rounds, defensive foes guard often, drainers heal with their Special.

### Perks

| Perk | Effect |
|---|---|
| ✂️ Veto | Once per draft, burn a clause without spending your pick. |
| ➕ Fourth Clause | You get one extra pick at the end of each draft. |
| 🔮 Mind Reader | See the foe's whole wish list, not only its top 2. |
| 📜 Extra Offer | Each offer gets one more card from your pool. |

### Upgrades

❤️ Vitality (+6 max HP, heal 6), 💪 Strength (+1 ATK), 🛡️ Stance (+2 Guard), ✨ Mastery (Special power +2), ⏱️ Drill (Special recharge −1, at least 2).

## Run loop

1. 3 acts. Each act has 6 rows of two nodes and a boss row. The map comes from the run seed.
2. After a fight: gold and one choice of 2 clause cards or 1 upgrade. Elites and bosses also offer a perk. Skip gives 6 gold.
3. Your clause cards form your pool. Up to 2 of them join each offer (3 with Extra Offer). You start with 2 random cards.
4. Scribe: 3 clause cards (22 gold), 1 upgrade (40), 1 perk (35–80), a tonic that heals 10 (20).
5. Rest: heal 40% of max HP, or take one of 2 upgrades.
6. After a boss you heal 50% of max HP. Beat the third boss to win.
7. Score: 20 per fight won, +30 per elite, +100 per boss, half the gold earned, and 500 + 5 per HP for a win.

## Meta progress

Each run gives 🖋️ ink (score / 120, at least 1). Spend it in the Archive on the title screen: 3 fighters and 4 clause cards for the pool.

## Code

| File | Contents |
|---|---|
| `src/engine.ts` | Pure fight engine: `playRound(fight, myIntent, foeIntent)`, clause hooks, foe intent AI, your fight bot |
| `src/draft.ts` | Offers, sim previews (`evalDraft`), the foe's wishes and reasons, picks, draft bots |
| `src/data.ts` | Clauses, specials, fighters, enemies, perks, upgrades, unlocks |
| `src/run.ts` | Run state, map, rewards, scribe, rest, score, save data (`clause.run`, `clause.meta`) |
| `src/bot.ts` | Run bots for the debug API and the balance sim |
| `src/app.ts` | Screens, draft table, fight screen, input, animations |
| `src/sfx.ts` | WebAudio sounds |

## Balance

A headless sim plays full runs. Both bots play the fights the same way (they test each intent against the shown foe intent and keep the best). Only the draft differs. 100 runs per row:

| Fighter | Random drafter | Good drafter (reads the previews) |
|---|---|---|
| Duelist | 3% | 40% |
| Cleric | 0% | 31% |
| Warden | 9% | 56% |
| Venomist | 3% | 37% |

The random drafter loses about 15 HP per fight. The good drafter loses 10–13.

## Debug

Open the game with `?debug` (add `&fast` to skip animation waits, `&seed=X` for a fixed run). The console then has `window.debug`:

- `debug.step()`: one bot action. In a draft the bot uses the sim previews. Returns `'busy'` during an animation.
- `debug.state()`: screen, act, row, HP, gold, offer, active clauses, round, foe intent and the end result.
- `debug.eval()`: the sim previews and foe wishes for the current draft.
- `debug.hp(n)`, `debug.ink(n)`.
