# Word Smith

Word-spelling combat roguelite (like Bookworm Adventures / Letter Quest). Status: design only. The page is a placeholder.

## Play style

Word puzzles as combat. You get a grid of 16 letter tiles. Click tiles to spell a word, then attack. Damage grows with word length and rare letters.

- Each letter has a value (common letters 1, rare letters like Q, X, Z up to 4).
- Used tiles are replaced from a weighted letter bag.
- Enemies attack on a timer of turns, shown above each enemy.
- Special tiles: gem tiles (bonus effect), cracked tiles (break when used), locked tiles (enemy effect, cannot be used).

## Run loop

1. Walk a short map per chapter: fights, elites, shops, events, rest.
2. Each fight is one enemy or a small group. One word = one attack.
3. After a fight, pick a reward: a gem (adds special tiles), a book (passive bonus), or a potion.
4. Beat the chapter boss. Three chapters in total.

## Core systems

- **Dictionary**: a bundled word list (about 30k common English words) in a `Set` for fast lookup.
- **Letter bag**: weighted letters, so the grid always has enough vowels.
- **Books (relics)**: "words with Z deal double", "5+ letter words heal 2", "the first word each fight is free".
- **Enemies**: HP, attack timer, tile effects (lock, poison, scramble).
- **Meta**: unlock new books and starting gems.

## Tech plan

- DOM grid with tiles, CSS animations for attacks.
- Dictionary as a compressed text file loaded once.
- Keyboard input: type letters to select tiles, `Enter` attacks, `Backspace` removes the last tile.
