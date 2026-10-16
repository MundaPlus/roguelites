# Roguelites

Ten small web roguelite games. Each game has a different play style. All games use Vite and TypeScript in one npm workspace.

| Folder | Game | Play style | Status |
|---|---|---|---|
| `ember-swarm/` | Ember Swarm | Auto-shooter survival (like Vampire Survivors) | Playable |
| `deckbound-spire/` | Deckbound Spire | Turn-based deckbuilder (like Slay the Spire) | Playable |
| `neon-depths/` | Neon Depths | Twin-stick room clearing (like Isaac / Hades) | Playable |
| `dice-and-dungeons/` | Dice & Dungeons | Dice-placement puzzle combat (like Dicey Dungeons) | Playable |
| `hexfall-tactics/` | Hexfall Tactics | Grid-tactics squad game (like Into the Breach) | Playable |
| `peg-bounce/` | Peg Bounce | Physics pachinko combat (like Peglin) | Playable |
| `high-card/` | High Card | Poker-hand scoring (like Balatro) | Design only |
| `last-bastion/` | Last Bastion | Run-based tower defense (like Rogue Tower) | Design only |
| `cave-diver/` | Cave Diver | Side-view platformer (like Spelunky) | Design only |
| `loop-warden/` | Loop Warden | Loop auto-battler (like Loop Hero) | Design only |

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
npm run typecheck    # all games
npm run build        # all games, output in <game>/dist
```

## Play on the LAN

```bash
npm run serve        # builds all games, then serves them on port 8090
npm start            # serve only, without a new build
```

Open `http://<this-machine-ip>:8090/` on any device on the LAN. The server prints its addresses at start. The launcher page links to all games.

- `server.mjs` is a small Node static server with no dependencies. It serves each `<game>/dist` folder at `/<game>/`.
- Set `PORT` or `HOST` to change the defaults (`8090`, `0.0.0.0`).
- On this machine the server runs as the systemd user service `roguelites.service` (file in the repo root). It starts at boot. After a new build, run `systemctl --user restart roguelites` only if `server.mjs` changed. The server reads `dist` on each request.
- Install it on another machine: `systemctl --user link "$PWD/roguelites.service" && systemctl --user enable --now roguelites`. Run `loginctl enable-linger $USER` once, so it starts without a login.
- Save data (gold, unlocks) lives in each browser's `localStorage`, so every device has its own progress.

Each game folder has a `README.md` with its design.

## Branches

- `master`: production. Gets changes from `develop` after they are verified.
- `develop`: day-to-day work.
