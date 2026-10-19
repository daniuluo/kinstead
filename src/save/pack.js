// Packing a save for browser storage: LZW over the save's text, written 15
// bits to a character (every one between U+0020 and U+801F, so never half a
// surrogate pair), with a "LZW1:" mark in front. Browser storage holds about
// five million characters for the whole site, and a town's save is mostly
// villagers' names and numbers, which pack to about a third, so a city of
// tens of thousands still fits (with the town kept before it beside it).
// Saves without the mark are read as they are, and files are still plain
// JSON: only what is kept in this browser is packed.
//
// The stream is phrase codes (2 and up), with two escapes: DEF c (the first
// time c is seen: it becomes a one-character phrase, used by the codes that
// follow) and RAW c (c itself, once the dictionary is full). After each
// phrase a new one is learnt: it and the first character of the next.

const MARK = 'LZW1:';
const DEF = 0, RAW = 1, FIRST = 2, LIMIT = 32768;

export function pack(text) {
  const out = [];
  const one = new Int32Array(65536).fill(-1);   // the code of each character's own phrase
  const pairs = new Map();                     // phrase code * 65536 + next character -> code
  let next = FIRST, w = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    let learn = -1;
    if (w >= 0) {
      const k = w * 65536 + c, nk = pairs.get(k);
      if (nk !== undefined) { w = nk; continue; }
      out.push(w);
      learn = k;
    }
    let sc = one[c];
    if (sc < 0) {
      if (next < LIMIT) { out.push(DEF, c >> 8, c & 255); sc = one[c] = next++; }
      else out.push(RAW, c >> 8, c & 255);
    }
    if (learn >= 0 && next < LIMIT) pairs.set(learn, next++);
    w = sc;
  }
  if (w >= 0) out.push(w);
  let s = MARK;
  for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode(...out.slice(i, i + 8192).map(v => v + 32));
  return s;
}

export const isPacked = (s) => typeof s === 'string' && s.startsWith(MARK);

export function unpack(s) {
  if (!isPacked(s)) return s;
  const dict = [null, null];
  const parts = [];
  let prev = null;
  for (let i = MARK.length; i < s.length; i++) {
    const code = s.charCodeAt(i) - 32;
    if (code === DEF || code === RAW) {
      const c = String.fromCharCode(((s.charCodeAt(i + 1) - 32) << 8) | (s.charCodeAt(i + 2) - 32));
      i += 2;
      if (code === DEF) { if (dict.length < LIMIT) dict.push(c); continue; }
      parts.push(c);
      prev = c;
      continue;
    }
    const entry = code < dict.length ? dict[code] : code === dict.length && prev !== null ? prev + prev[0] : null;
    if (entry == null) throw new Error('This save is damaged');
    if (prev !== null && dict.length < LIMIT) dict.push(prev + entry[0]);
    parts.push(entry);
    prev = entry;
  }
  return parts.join('');
}
