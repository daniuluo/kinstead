// Villagers in the panels: a little minion drawn from their look (r.lk, see
// render/villagers.js) in their own yellow and blue dungarees, with one
// goggle or two, their bit of hair or their hat and the touch of their trade;
// and a pair of plain ones standing for the townsfolk as a whole.

const hex = (c, d) => (c && c.getHexString ? '#' + c.getHexString() : d);
const n1 = (v) => Math.round(v * 10) / 10;
const cache = new Map();

// A villager's own minion, as inline SVG (sized by CSS: .mn).
export function minionIcon(r) {
  const lk = (r && r.lk) || {};
  const o = {
    skin: hex(lk.skin, '#f4cf42'), blue: hex(lk.blue, '#3f6db3'), iris: hex(lk.iris, '#6a4022'), glove: hex(lk.glove, '#2a2a30'),
    eyes: lk.eyes || 'two', tall: lk.tall || 1, hair: lk.hat ? null : lk.hair || null, hairC: hex(lk.hairC, '#222028'),
    hat: lk.hat ? lk.hat.kind : null, hatA: hex(lk.hat && lk.hat.a, '#444'), hatB: hex(lk.hat && lk.hat.b, '#222'),
    kit: lk.kit ? lk.kit.kind : null, kitA: hex(lk.kit && lk.kit.a, '#fff'), kitB: hex(lk.kit && lk.kit.b, '#fff'),
  };
  const key = Object.values(o).join();
  let s = cache.get(key);
  if (!s) { s = draw(o); cache.set(key, s); }
  return s;
}

function draw(o) {
  // the body: a capsule 12 wide standing on y = 22, its top at y0
  const B = 22, H = n1(17 + Math.min(1.14, Math.max(0.8, o.tall)) * 9 - 7.2), y0 = n1(B - H);
  const w = n1(B - 0.36 * H), ey = n1(y0 + 4.6), er = o.eyes === 'one' ? 2.8 : 2.4;
  const bib = n1(w - 1.6), mouth = n1((ey + er + bib - (o.kit && NECK.has(o.kit) ? 0.9 : 0)) / 2);
  // the dungarees: below the waist, round at the bottom
  const c = B - 6, dy = Math.max(0, w - c), hw = n1(Math.sqrt(Math.max(0, 36 - dy * dy)));
  const legs = dy > 0 ? `M${n1(10 - hw)} ${w}H${n1(10 + hw)}A6 6 0 0 1 ${n1(10 - hw)} ${w}Z` : `M4 ${w}H16V${c}A6 6 0 0 1 4 ${c}Z`;
  let s = `<svg class="mn" viewBox="0 -5 20 31" aria-hidden="true">`;
  // arms and gloves, legs and shoes
  s += `<path d="M4.4 ${n1(w - 1.6)}L2.9 ${n1(w + 1.3)}M15.6 ${n1(w - 1.6)}L17.1 ${n1(w + 1.3)}" stroke="${o.skin}" stroke-width="1.4" stroke-linecap="round"/>`;
  s += `<circle cx="2.8" cy="${n1(w + 1.8)}" r="1.2" fill="${o.glove}"/><circle cx="17.2" cy="${n1(w + 1.8)}" r="1.2" fill="${o.glove}"/>`;
  s += `<path d="M6.3 21h2.4v2.6h-2.4zM11.3 21h2.4v2.6h-2.4z" fill="${o.blue}"/><path d="M5.7 23.2h3.4v1.6h-3.4zM10.9 23.2h3.4v1.6h-3.4z" fill="#26262c"/>`;
  // body, dungarees and bib, straps, and a smile
  s += `<rect x="4" y="${y0}" width="12" height="${H}" rx="6" fill="${o.skin}"/>`;
  s += `<path d="${legs}M7 ${bib}h6v${n1(w - bib + 0.2)}h-6z" fill="${o.blue}"/>`;
  s += `<path d="M7.5 ${bib}L6 ${n1(bib - 1.5)}M12.5 ${bib}L14 ${n1(bib - 1.5)}" stroke="${o.blue}" stroke-width="0.9"/>`;
  s += `<path d="M8.8 ${n1(mouth - 0.3)}Q10 ${n1(mouth + 0.7)} 11.2 ${n1(mouth - 0.3)}" stroke="#5a2418" stroke-width="0.55" fill="none" stroke-linecap="round"/>`;
  if (o.kit) s += KIT[o.kit](o, w, bib);
  // the goggles on their strap
  s += `<rect x="3.6" y="${n1(ey - 0.8)}" width="12.8" height="1.6" fill="#2a2a30"/>`;
  for (const cx of o.eyes === 'one' ? [10] : [7.6, 12.4]) {
    s += `<circle cx="${cx}" cy="${ey}" r="${er}" fill="#b9bec6" stroke="#6e727a" stroke-width="0.45"/>`;
    s += `<circle cx="${cx}" cy="${ey}" r="${n1(er * 0.7)}" fill="#f6f6f2"/><circle cx="${cx}" cy="${ey}" r="${n1(er * 0.38)}" fill="${o.iris}"/><circle cx="${cx}" cy="${ey}" r="${n1(er * 0.17)}" fill="#18181c"/>`;
  }
  if (o.hat && HAT[o.hat]) s += HAT[o.hat](o, n1(y0 + 1.4));
  else if (o.hair && HAIR[o.hair]) s += HAIR[o.hair](o, y0);
  return s + '</svg>';
}

const NECK = new Set(['tie', 'bowtie', 'kerchief', 'collar']);
const KIT = {
  apron: (o, w, bib) => `<path d="M6.4 ${n1(bib - 0.2)}h7.2v${n1(w - bib + 0.6)}h1.2v2.8h-9.6v-2.8h1.2z" fill="${o.kitA}"/><path d="M4.6 ${n1(w + 0.2)}h10.8" stroke="${o.kitB}" stroke-width="0.8"/>`,
  tie: (o, w, bib) => `<path d="M5.4 ${n1(bib - 0.9)}h9.2v0.9h-9.2z" fill="${o.kitB}"/><path d="M9.4 ${n1(bib - 0.6)}h1.2v3.4l-0.6 0.8l-0.6-0.8z" fill="${o.kitA}"/>`,
  bowtie: (o, w, bib) => `<path d="M5.4 ${n1(bib - 0.9)}h9.2v0.9h-9.2z" fill="${o.kitB}"/><path d="M10 ${n1(bib - 0.45)}l-2.2-1.1v2.2zM10 ${n1(bib - 0.45)}l2.2-1.1v2.2z" fill="${o.kitA}"/>`,
  kerchief: (o, w, bib) => `<path d="M5 ${n1(bib - 0.9)}h10v0.9l-5 3l-5-3z" fill="${o.kitA}"/>`,
  collar: (o, w, bib) => `<path d="M5.2 ${n1(bib - 0.9)}h9.6v1h-9.6z" fill="${o.kitA}"/><path d="M9.4 ${n1(bib - 0.9)}h1.2v1h-1.2z" fill="${o.kitB}"/>`,
  belt: (o, w) => `<path d="M4.1 ${n1(w + 1.2)}h11.8v1.1h-11.8z" fill="${o.kitA}"/><path d="M9.4 ${n1(w + 1.2)}h1.2v1.1h-1.2z" fill="${o.kitB}"/>`,
  sash: (o, w, bib) => `<path d="M4.6 ${n1(w + 2.4)}L15.4 ${n1(bib - 2.2)}" stroke="${o.kitA}" stroke-width="1.3"/><circle cx="7.4" cy="${n1(bib + 0.6)}" r="0.8" fill="${o.kitB}"/>`,
};
// hats sit just above the goggles (b: the hat's bottom edge)
const HAT = {
  straw: (o, b) => `<rect x="6.2" y="${n1(b - 4.4)}" width="7.6" height="4.4" rx="1" fill="${o.hatA}"/><rect x="6.2" y="${n1(b - 1.8)}" width="7.6" height="1.2" fill="${o.hatB}"/><ellipse cx="10" cy="${n1(b - 0.8)}" rx="8.6" ry="1.3" fill="${o.hatA}"/>`,
  cap: (o, b) => `<path d="M4.4 ${b}Q4.6 ${n1(b - 5.4)} 10 ${n1(b - 5.4)}Q15.4 ${n1(b - 5.4)} 15.6 ${b}Z" fill="${o.hatA}"/><ellipse cx="10" cy="${b}" rx="6.4" ry="1" fill="${o.hatA}" stroke="${o.hatB}" stroke-width="0.4"/><circle cx="10" cy="${n1(b - 5.1)}" r="0.7" fill="${o.hatB}"/>`,
  bowler: (o, b) => `<path d="M5.4 ${b}Q5.6 ${n1(b - 6)} 10 ${n1(b - 6)}Q14.4 ${n1(b - 6)} 14.6 ${b}Z" fill="${o.hatA}"/><rect x="5.4" y="${n1(b - 1.6)}" width="9.2" height="1.3" fill="${o.hatB}"/><ellipse cx="10" cy="${b}" rx="7.2" ry="1" fill="${o.hatA}"/>`,
  top: (o, b) => `<rect x="6" y="${n1(b - 8)}" width="8" height="8" fill="${o.hatA}"/><rect x="6" y="${n1(b - 2.2)}" width="8" height="1.6" fill="${o.hatB}"/><ellipse cx="10" cy="${b}" rx="7.2" ry="1" fill="${o.hatA}"/>`,
  hardhat: (o, b) => `<path d="M4 ${b}Q4.2 ${n1(b - 6)} 10 ${n1(b - 6)}Q15.8 ${n1(b - 6)} 16 ${b}Z" fill="${o.hatA}"/><path d="M10 ${n1(b - 5.8)}V${n1(b - 0.6)}" stroke="${o.hatB}" stroke-width="1.1" opacity="0.5"/><ellipse cx="10" cy="${b}" rx="7.6" ry="1" fill="${o.hatA}"/>`,
};
// a little hair on top (y: the top of the head)
const HAIR = {
  sprouts: (o, y) => `<path d="M10 ${n1(y + 0.4)}l-2.4-3.2M10 ${n1(y + 0.4)}l-1.1-3.6M10 ${n1(y + 0.4)}l0.2-3.8M10 ${n1(y + 0.4)}l1.3-3.5M10 ${n1(y + 0.4)}l2.4-3" stroke="${o.hairC}" stroke-width="0.7" stroke-linecap="round"/>`,
  tuft: (o, y) => `<path d="M7.8 ${n1(y + 0.9)}L8.6 ${n1(y - 2.2)}L9.8 ${n1(y + 0.2)}L11 ${n1(y - 2.9)}L12.2 ${n1(y + 0.9)}Z" fill="${o.hairC}"/>`,
  combed: (o, y) => `<path d="M4.6 ${n1(y + 2.6)}Q4.8 ${n1(y - 0.6)} 10 ${n1(y - 0.6)}Q15.2 ${n1(y - 0.6)} 15.4 ${n1(y + 2.6)}Q13 ${n1(y + 0.6)} 8.4 ${n1(y + 1.2)}Q6 ${n1(y + 1.6)} 4.6 ${n1(y + 2.6)}Z" fill="${o.hairC}"/>`,
  mop: (o, y) => `<path d="M4.3 ${n1(y + 2.8)}Q4 ${n1(y - 1.6)} 10 ${n1(y - 1.4)}Q16 ${n1(y - 1.6)} 15.7 ${n1(y + 2.8)}Q14 ${n1(y + 1)} 12.2 ${n1(y + 1.4)}Q10 ${n1(y + 0.4)} 7.8 ${n1(y + 1.4)}Q6 ${n1(y + 1)} 4.3 ${n1(y + 2.8)}Z" fill="${o.hairC}"/>`,
  sprig: (o, y) => `<path d="M10 ${n1(y + 0.4)}C10 ${n1(y - 3)} 12.6 ${n1(y - 4)} 12.2 ${n1(y - 2)}" stroke="${o.hairC}" stroke-width="0.8" fill="none" stroke-linecap="round"/>`,
};

// Plain minions in the colour of the text: one for anybody, two for the
// townsfolk (the population, the villagers' directory).
const capsule = (x, y, w, h) => { const r = w / 2; return `M${x} ${y + r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x} ${y + h - r}Z`; };
// a round goggle: a hole in the body (fill-rule evenodd), or the dot inside it
const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
export const MINION = `<svg class="mn1" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${capsule(7, 2, 10, 19)}${circ(12, 8, 3)}M7 14.6h10v1H7z"/><path fill="currentColor" d="${circ(12, 8, 1.3)}M8.6 20.5h2.4v3h-2.4zM13 20.5h2.4v3H13z"/></svg>`;
export const MINIONS = `<svg class="mn1" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${capsule(1.5, 7, 9.5, 14.5)}${circ(6.25, 11.6, 2.6)}M1.5 16.6h9.5v0.9H1.5z${capsule(13, 2.5, 9.5, 19)}${circ(15.9, 7.8, 1.75)}${circ(19.6, 7.8, 1.75)}M13 15.2h9.5v0.9H13z"/><path fill="currentColor" d="${circ(6.25, 11.6, 1.1)}${circ(15.9, 7.8, 0.7)}${circ(19.6, 7.8, 0.7)}M3.6 21h2v2.5h-2zM7 21h2v2.5H7zM15.2 21h2v2.5h-2zM18.4 21h2v2.5h-2z"/></svg>`;
