/** The bundled word list. `public/words.txt` is sorted and prefix-compressed:
 * each line starts with one digit (letters shared with the previous word), then the rest. */

let words: Set<string> = new Set();
/** Words as tile tokens ("qu" becomes "q"), for the bot search. */
let tokens: string[] = [];
let loaded = false;

export function decodeWords(text: string): string[] {
  const out: string[] = [];
  let prev = '';
  for (const line of text.split('\n')) {
    if (!line) continue;
    const p = line.charCodeAt(0) - 48;
    const w = prev.slice(0, p) + line.slice(1);
    out.push(w);
    prev = w;
  }
  return out;
}

export function setWords(list: string[]): void {
  words = new Set(list);
  tokens = list.map((w) => w.replace(/qu/g, 'q'));
  loaded = true;
}

export async function loadWords(): Promise<void> {
  if (loaded) return;
  const res = await fetch('./words.txt');
  setWords(decodeWords(await res.text()));
}

export const isLoaded = (): boolean => loaded;
export const wordCount = (): number => words.size;
export const isWord = (w: string): boolean => w.length >= 3 && words.has(w);

/** Spell tile letters as a word ("q" tiles spell "qu"). */
export const spell = (letters: string[]): string => letters.map((c) => (c === 'q' ? 'qu' : c)).join('');

/** All words that the given tile letters can spell. Each tile is used at most once. */
export function formable(letters: string[]): string[] {
  const have = new Array<number>(26).fill(0);
  for (const c of letters) have[c.charCodeAt(0) - 97]++;
  const need = new Array<number>(26);
  const out: string[] = [];
  for (const t of tokens) {
    if (t.length > letters.length) continue;
    need.fill(0);
    let ok = true;
    for (let i = 0; i < t.length; i++) {
      const k = t.charCodeAt(i) - 97;
      if (++need[k] > have[k]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(t);
  }
  return out;
}
