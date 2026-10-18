# Handover — roguelites — 2026-10-18 08:05

> **Status 2026-10-18: DONE.** All next steps are complete (on debian-celje). GitHub repo: https://github.com/MundaPlus/roguelites. Pages: https://mundaplus.github.io/roguelites/. munda.si card is live. Nothing is open.

## Goal

The user said: "could you make a public repo on github in mundaplu and add it as a product in munda.si add mit licence like the other free open source repos." Then: "and host them with pages on github". And: "it is on .3 machine" (the munda.si site source is on the main machine, 192.168.31.3).

1. Make a **public** GitHub repo `MundaPlus/roguelites` and push the code.
2. Host the launcher and all 60 games on **GitHub Pages**: https://mundaplus.github.io/roguelites/
3. Add the project to the **projects list on https://munda.si**.

## Done so far (on debian-llm)

- `LICENSE`: MIT, "Copyright (c) 2026 Munda Plus" (the same text as Underneath and Ash & Gears). `package.json` has `"license": "MIT"`.
- `scripts/build-site.mjs` and `npm run build:site`: copy the launcher page and each `<game>/dist` into `site/` (5.5 MB). `site/` is in `.gitignore`.
- `server.mjs`: exports `GAMES` and `launcher()`, and starts the server only when run as a script. The launcher card links are now relative (`<dir>/`), so the site works under `/roguelites/`.
- `.github/workflows/pages.yml`: on each push to `main` (and by hand), it runs `npm ci`, `npm run build` and `npm run build:site`, then deploys `site/` to Pages.
- `package-lock.json` is synced with the 10 new-concept workspaces. Before this fix, `npm ci` failed.
- Tests done:
  - A clean clone passes `npm ci`, `npm run build` and `npm run build:site`.
  - `site/` served under `/roguelites/`: the launcher opens a game with no page errors.
  - The LAN server on port 8090 still works.
- Commits `d1fa206` and `86803d1` on `develop` and `master`, pushed to Gitea `origin`.

## Current state

- Nothing is on GitHub yet.
- munda.si is not changed yet.
- The fine-grained token in `~/.git-credentials` on debian-llm can push, but it cannot create repos ("Resource not accessible by personal access token") and cannot turn on Pages.
- debian-llm cannot ssh to 192.168.31.3 (no key access) and has no `gh`.

## Decisions

- Repo name `roguelites`, the same as the Gitea repo. The owner is the GitHub user `MundaPlus`.
- GitHub `main` gets our `master`, as for Ash & Gears: `git push github master:main`.
- Pages source is "GitHub Actions", not a `gh-pages` branch.
- MIT license, like the other free Munda Plus repos.

## Next steps (on 192.168.31.3, which has `gh`)

1. Clone or pull: `git clone http://192.168.31.225:3333/admin/roguelites.git` (or `git pull` in an existing clone). Check out `master`.
2. Create the public repo:
   ```bash
   gh repo create MundaPlus/roguelites --public \
     --description "60 small web roguelite games: 50 classic play styles and 10 new concepts. Play in the browser on PC and phone." \
     --homepage "https://mundaplus.github.io/roguelites/"
   git remote add github https://github.com/MundaPlus/roguelites.git
   git push github master:main
   git push github develop
   ```
3. Turn on Pages with GitHub Actions as the source, then run the workflow:
   ```bash
   gh api -X POST repos/MundaPlus/roguelites/pages -f build_type=workflow
   gh workflow run "Deploy to GitHub Pages" -R MundaPlus/roguelites --ref main
   gh run watch -R MundaPlus/roguelites
   ```
4. Check that https://mundaplus.github.io/roguelites/ loads, that both tabs work, and that a few games open (for example `code-breaker/`, `lamplight/`). Check the browser console for errors.
5. munda.si: find the site source on .3. Add a card to the projects list, next to Underneath and Ash & Gears (category `creative`). Use the same HTML pattern as the live site:
   ```html
   <li data-cat="creative"><div class="pf-top"><h3>Roguelites</h3><span class="badge live">Free · Open source</span></div><p>60 small roguelite games in one launcher: 50 classic play styles, from deckbuilders to tower defense, and 10 new concepts with new mechanics. Free to play in the browser on PC and phone. Free to use and change (MIT license).</p><a href="https://mundaplus.github.io/roguelites/" target="_blank" rel="noopener noreferrer">Play in the browser ↗</a><a href="https://github.com/MundaPlus/roguelites" target="_blank" rel="noopener noreferrer">Get it on GitHub →</a></li>
   ```
6. Show the user the change and ask before you deploy the site. The deploy steps are in the munda.si project memory (`deploy-target`): Hostinger VPS, back up first, check the live md5.
7. Add a `CHANGELOG.md` entry in this repo for the GitHub, Pages and munda.si work. Push `develop` and `master` to Gitea, and `master:main` to GitHub.

## Key files

- `scripts/build-site.mjs`: static Pages build into `site/`.
- `.github/workflows/pages.yml`: Pages deploy on push to `main`.
- `server.mjs`: LAN server, `GAMES` list and launcher page.
- `LICENSE`: MIT.
- `README.md`: "GitHub Pages" and "License" sections.

## Gotchas

- Run `npm run build` before `npm run build:site`. The site build stops when a `<game>/dist` folder is missing.
- On debian-llm, `cp` is an alias for `cp -i`. Use `\cp -f` in scripts.
- Game saves live in each browser's `localStorage`. GitHub Pages is a different origin, so LAN saves do not carry over.
- The repo is public. The secret scan found no secrets. The only LAN address is the Gitea URL in `CHANGELOG.md`.
