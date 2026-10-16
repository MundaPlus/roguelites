# Changelog

## 2026-10-16
- Built Conga Quest as playable game number 16 and marked it ready in the launcher (`conga-quest/`, `server.mjs`, `README.md`) — see `conga-quest/CHANGELOG.md`.
- Built Starward Drift as playable game number 15 and marked it ready in the launcher (`starward-drift/`, `server.mjs`, `README.md`) — see `starward-drift/CHANGELOG.md`.
- Built Spin Lord as playable game number 14 and marked it ready in the launcher (`spin-lord/`, `server.mjs`, `README.md`) — see `spin-lord/CHANGELOG.md`.
- Built Beat Delver as playable game number 13 and marked it ready in the launcher (`beat-delver/`, `server.mjs`, `README.md`) — see `beat-delver/CHANGELOG.md`.
- Built Cave Diver as playable game number 12 and marked it ready in the launcher (`cave-diver/`, `server.mjs`, `README.md`) — see `cave-diver/CHANGELOG.md`.
- Built Word Smith as playable game number 11 and marked it ready in the launcher (`word-smith/`, `server.mjs`, `README.md`) — see `word-smith/CHANGELOG.md`.
- Built Chain Crawl as playable game number 10 and marked it ready in the launcher (`chain-crawl/`, `server.mjs`, `README.md`) — see `chain-crawl/CHANGELOG.md`.
- Built Last Bastion as playable game number 9 and marked it ready in the launcher (`last-bastion/`, `server.mjs`, `README.md`) — see `last-bastion/CHANGELOG.md`.
- Built High Card as playable game number 8 and marked it ready in the launcher (`high-card/`, `server.mjs`, `README.md`) — see `high-card/CHANGELOG.md`.
- Built Loop Warden as playable game number 7 and marked it ready in the launcher (`loop-warden/`, `server.mjs`, `README.md`) — see `loop-warden/CHANGELOG.md`.
- Added twenty new games as placeholders with design READMEs: Grid Crawler, Bullet Bloom, Tower Topple, Lane Push, Trade Winds, Brick Rogue, Solitaire Siege, Wild Camp, Street Brawl, Duel Dojo, Drift Rocks, Herd Path, Idle Empire, Crate Crypt, Pixel Oracle, Dash Lanes, Ink Bridge, Orbit Sling, Time Bar Tales, Code Breaker (`<game>/`, `package.json`, `server.mjs`, `README.md`) — more play styles to build later.
- Reworked the launcher page: 3 rows per page with pagination, a favorite star on each card, and sorting by favorites, newest or A–Z (`server.mjs`, `README.md`) — 30 games no longer fit on one screen.
- Added five new games as placeholders with design READMEs: Sweep Saga, Pocket Wilds, Critter Clash, Storm Haven, Key Mage (`<game>/`, `package.json`, `server.mjs`, `README.md`) — more play styles to build later.
- Added five new games as placeholders with design READMEs: Block Siege, Deep Lure, Rogue Rally, Dust Trail, Brew Rogue (`<game>/`, `package.json`, `server.mjs`, `README.md`) — more play styles to build later.
- Added five new games as placeholders with design READMEs: Spin Lord, Conga Quest, Cursed Fairway, Dome Digger, Silent Contract (`<game>/`, `package.json`, `server.mjs`, `README.md`) — more play styles to build later.
- Added five new games as placeholders with design READMEs: Word Smith, Chain Crawl, Beat Delver, Pack Rat, Starward Drift (`<game>/`, `package.json`, `server.mjs`, `README.md`) — more play styles to build later.
- Built Peg Bounce as the sixth playable game and marked it ready in the launcher (`peg-bounce/`, `server.mjs`, `README.md`) — see `peg-bounce/CHANGELOG.md`.
- Added an emoji favicon to Peg Bounce and Hexfall Tactics (`*/index.html`) — browsers logged a 404 for the missing favicon.
- Built Hexfall Tactics as the fifth playable game and marked it ready in the launcher (`hexfall-tactics/`, `server.mjs`, `README.md`) — see `hexfall-tactics/CHANGELOG.md`.
- Added a systemd user service for the LAN server and enabled it (`roguelites.service`, `README.md`) — the server was down and did not start again after a reboot.
- Built Dice & Dungeons as the fourth playable game and marked it ready in the launcher (`dice-and-dungeons/`, `server.mjs`, `README.md`) — see `dice-and-dungeons/CHANGELOG.md`.
- Added five new games as placeholders with design READMEs: Peg Bounce, High Card, Last Bastion, Cave Diver, Loop Warden (`<game>/`, `package.json`, `server.mjs`, `README.md`) — more play styles to build later.
- Merged `develop` into `master` and pushed both — three games are playable.
- Added a handover note for the next session (`handover.md`) — the old session reached its context limit.

## 2026-10-15
- Built Neon Depths as the third playable game and marked it ready in the launcher (`neon-depths/`, `server.mjs`, `README.md`) — see `neon-depths/CHANGELOG.md`.
- Built Deckbound Spire as the second playable game and marked it ready in the launcher (`deckbound-spire/`, `server.mjs`, `README.md`) — see `deckbound-spire/CHANGELOG.md`.
- Initialized git with `master` and `develop` branches and the origin `http://192.168.31.225:3333/admin/roguelites.git` (`README.md` branch notes) — version control for the games.
- Added a LAN game server with a launcher page (`server.mjs`) and `npm run serve` / `npm start` (`package.json`) — to play all games from other devices on the LAN.
- Created the `roguelites` npm workspace with five Vite + TypeScript games (`package.json`, `tsconfig.base.json`) — one place for five roguelite ideas with different play styles.
- Added placeholder pages and design READMEs for Deckbound Spire, Neon Depths, Dice & Dungeons and Hexfall Tactics — they are ready to build next.
- Built Ember Swarm as the first playable game (`ember-swarm/`) — see `ember-swarm/CHANGELOG.md`.
