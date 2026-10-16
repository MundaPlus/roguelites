# Roguelites

Fifty small web roguelite games. Each game has a different play style. All games use Vite and TypeScript in one npm workspace.

| Folder | Game | Play style | Status |
|---|---|---|---|
| `ember-swarm/` | Ember Swarm | Auto-shooter survival (like Vampire Survivors) | Playable |
| `deckbound-spire/` | Deckbound Spire | Turn-based deckbuilder (like Slay the Spire) | Playable |
| `neon-depths/` | Neon Depths | Twin-stick room clearing (like Isaac / Hades) | Playable |
| `dice-and-dungeons/` | Dice & Dungeons | Dice-placement puzzle combat (like Dicey Dungeons) | Playable |
| `hexfall-tactics/` | Hexfall Tactics | Grid-tactics squad game (like Into the Breach) | Playable |
| `peg-bounce/` | Peg Bounce | Physics pachinko combat (like Peglin) | Playable |
| `high-card/` | High Card | Poker-hand scoring (like Balatro) | Playable |
| `last-bastion/` | Last Bastion | Run-based tower defense (like Rogue Tower) | Playable |
| `cave-diver/` | Cave Diver | Side-view platformer (like Spelunky) | Playable |
| `loop-warden/` | Loop Warden | Loop auto-battler (like Loop Hero) | Playable |
| `word-smith/` | Word Smith | Word-spelling combat (like Bookworm Adventures / Letter Quest) | Playable |
| `chain-crawl/` | Chain Crawl | Swipe-chain puzzle combat (like Dungeon Raid) | Playable |
| `beat-delver/` | Beat Delver | Rhythm dungeon crawler (like Crypt of the NecroDancer) | Playable |
| `pack-rat/` | Pack Rat | Backpack-builder auto-battler (like Backpack Hero / Backpack Battles) | Playable |
| `starward-drift/` | Starward Drift | Ship crew management with pause (like FTL) | Playable |
| `spin-lord/` | Spin Lord | Slot-machine deck builder (like Luck be a Landlord) | Playable |
| `conga-quest/` | Conga Quest | Snake-style party crawler (like Nimble Quest) | Playable |
| `cursed-fairway/` | Cursed Fairway | Golf roguelite (like Cursed to Golf) | Playable |
| `dome-digger/` | Dome Digger | Mining plus wave defense (like Dome Keeper) | Playable |
| `silent-contract/` | Silent Contract | Turn-based stealth heist (like Invisible Inc.) | Playable |
| `block-siege/` | Block Siege | Falling-block combat (like Tetris with enemies) | Playable |
| `deep-lure/` | Deep Lure | Fishing roguelite (like Dredge) | Playable |
| `rogue-rally/` | Rogue Rally | Top-down racing roguelite (like Micro Machines with upgrades) | Playable |
| `dust-trail/` | Dust Trail | Caravan journey survival (like Oregon Trail / Death Road to Canada) | Playable |
| `brew-rogue/` | Brew Rogue | Potion-brewing roguelite (like Potion Craft) | Playable |
| `sweep-saga/` | Sweep Saga | Minesweeper roguelite (like Dragonsweeper / DemonCrawl) | Playable |
| `pocket-wilds/` | Pocket Wilds | Monster-taming roguelite (like Pokémon roguelites / Cassette Beasts) | Playable |
| `critter-clash/` | Critter Clash | Team auto-battler (like Super Auto Pets) | Playable |
| `storm-haven/` | Storm Haven | Settlement builder roguelite (like Against the Storm) | Playable |
| `key-mage/` | Key Mage | Typing roguelite (like Nanotale / Epistory) | Playable |
| `grid-crawler/` | Grid Crawler | Classic turn-based roguelike (like Brogue / Dungeon Crawl Stone Soup) | Design only |
| `bullet-bloom/` | Bullet Bloom | Vertical bullet-hell shooter (like Touhou-style roguelites / Steredenn) | Playable |
| `tower-topple/` | Tower Topple | Physics stacking (like Tricky Towers) | Design only |
| `lane-push/` | Lane Push | Real-time lane attack (like Clash Royale / reverse Plants vs. Zombies) | Playable |
| `trade-winds/` | Trade Winds | Merchant trading (like Taipan / Merchant of the Seas) | Playable |
| `brick-rogue/` | Brick Rogue | Brick breaker (like Breakout / Arkanoid roguelites) | Design only |
| `solitaire-siege/` | Solitaire Siege | Solitaire card combat (like Solitairica) | Design only |
| `wild-camp/` | Wild Camp | Survival crafting (like Don't Starve) | Design only |
| `street-brawl/` | Street Brawl | Side-scrolling beat em up (like Streets of Rage / River City roguelites) | Design only |
| `duel-dojo/` | Duel Dojo | 1v1 fighting (like Street Fighter-style roguelites) | Design only |
| `drift-rocks/` | Drift Rocks | Inertia space shooter (like Asteroids roguelites) | Design only |
| `herd-path/` | Herd Path | Unit guiding puzzle (like Lemmings) | Design only |
| `idle-empire/` | Idle Empire | Incremental idle (like Cookie Clicker / Antimatter Dimensions with prestige) | Design only |
| `crate-crypt/` | Crate Crypt | Push-block puzzle (like Sokoban roguelites) | Design only |
| `pixel-oracle/` | Pixel Oracle | Nonogram logic (like Picross roguelites) | Design only |
| `dash-lanes/` | Dash Lanes | Endless lane runner (like Subway Surfers with roguelite upgrades) | Design only |
| `ink-bridge/` | Ink Bridge | Line-drawing physics puzzle (like Brain It On / Crayon Physics) | Design only |
| `orbit-sling/` | Orbit Sling | Gravity slingshot (like Angry Birds in space / Gravitee) | Design only |
| `time-bar-tales/` | Time Bar Tales | Turn-based JRPG party (like Final Fantasy ATB roguelites) | Design only |
| `code-breaker/` | Code Breaker | Deduction puzzle (like Mastermind / Wordle roguelites) | Design only |

## Run

```bash
npm install          # once, at the root
npm run dev:ember    # Ember Swarm on http://localhost:5173
npm run dev:deck     # Deckbound Spire
npm run dev:neon     # Neon Depths
npm run dev:dice     # Dice & Dungeons
npm run dev:hex      # Hexfall Tactics
npm run dev:peg      # Peg Bounce
npm run dev:card     # High Card
npm run dev:td       # Last Bastion
npm run dev:cave     # Cave Diver
npm run dev:loop     # Loop Warden
npm run dev:word     # Word Smith
npm run dev:chain    # Chain Crawl
npm run dev:beat     # Beat Delver
npm run dev:pack     # Pack Rat
npm run dev:star     # Starward Drift
npm run dev:spin     # Spin Lord
npm run dev:conga    # Conga Quest
npm run dev:golf     # Cursed Fairway
npm run dev:dome     # Dome Digger
npm run dev:heist    # Silent Contract
npm run dev:block    # Block Siege
npm run dev:fish     # Deep Lure
npm run dev:rally    # Rogue Rally
npm run dev:trail    # Dust Trail
npm run dev:brew     # Brew Rogue
npm run dev:sweep    # Sweep Saga
npm run dev:tame     # Pocket Wilds
npm run dev:critter  # Critter Clash
npm run dev:haven    # Storm Haven
npm run dev:type     # Key Mage
npm run dev:crawl    # Grid Crawler
npm run dev:bullet   # Bullet Bloom
npm run dev:topple   # Tower Topple
npm run dev:lane     # Lane Push
npm run dev:trade    # Trade Winds
npm run dev:brick    # Brick Rogue
npm run dev:soli     # Solitaire Siege
npm run dev:craft    # Wild Camp
npm run dev:brawl    # Street Brawl
npm run dev:duel     # Duel Dojo
npm run dev:rocks    # Drift Rocks
npm run dev:herd     # Herd Path
npm run dev:idle     # Idle Empire
npm run dev:crate    # Crate Crypt
npm run dev:pixel    # Pixel Oracle
npm run dev:dash     # Dash Lanes
npm run dev:ink      # Ink Bridge
npm run dev:orbit    # Orbit Sling
npm run dev:atb      # Time Bar Tales
npm run dev:code     # Code Breaker
npm run typecheck    # all games
npm run build        # all games, output in <game>/dist
```

## Play on the LAN

```bash
npm run serve        # builds all games, then serves them on port 8090
npm start            # serve only, without a new build
```

Open `http://<this-machine-ip>:8090/` on any device on the LAN. The server prints its addresses at start. The launcher page links to all games.

- The launcher shows 3 rows of cards per page. Use the page buttons, the `←` `→` keys or a swipe to change pages.
- Click the ☆ on a card to mark a favorite. Sort by **★ Favorites** (favorites, then playable games, then the newest), **🕒 Newest** or **A–Z**.
- Favorites and the sort choice are saved in the browser of each device.

- `server.mjs` is a small Node static server with no dependencies. It serves each `<game>/dist` folder at `/<game>/`.
- Set `PORT` or `HOST` to change the defaults (`8090`, `0.0.0.0`).
- On this machine the server runs as the systemd user service `roguelites.service` (file in the repo root). It starts at boot. After a new build, run `systemctl --user restart roguelites` only if `server.mjs` changed. The server reads `dist` on each request.
- Install it on another machine: `systemctl --user link "$PWD/roguelites.service" && systemctl --user enable --now roguelites`. Run `loginctl enable-linger $USER` once, so it starts without a login.
- Save data (gold, unlocks) lives in each browser's `localStorage`, so every device has its own progress.

Each game folder has a `README.md` with its design.

## Branches

- `master`: production. Gets changes from `develop` after they are verified.
- `develop`: day-to-day work.
