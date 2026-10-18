// Text that comes from outside this browser (a loaded or merged save, another
// player in a shared town) is cleaned before the game keeps it: no markup
// characters, no control characters, a sensible length. The UI escapes what
// it shows as well; this is a second line of defence.

export function cleanText(s, max = 40) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>"`]/g, '').trim().slice(0, max);
}

// A colour that is safe to put in a style: #rgb … #rrggbbaa, or the fallback.
export function cleanColor(s, fallback = '#888888') {
  return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

// Own keys only, so '__proto__' or 'constructor' never look like a building,
// a research project or a command.
export const hasKey = (obj, k) => typeof k === 'string' && Object.hasOwn(obj, k);

// A random id for one town (saves of it share it; a new village gets a new one).
export const newTownId = () => (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 12).padEnd(12, '0');
export const isTownId = (s) => typeof s === 'string' && /^[a-z0-9]{6,24}$/.test(s);
