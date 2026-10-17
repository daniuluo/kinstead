// GeoBuilder: accumulate low-poly primitives (with per-vertex colour and an
// "emit" attribute for night glow) and merge them into one BufferGeometry.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

const PRIM = {
  box: prep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  boxC: prep(new THREE.BoxGeometry(1, 1, 1)),
  ico0: prep(new THREE.IcosahedronGeometry(1, 0)),
  ico1: prep(new THREE.IcosahedronGeometry(1, 1)),
  dodec: prep(new THREE.DodecahedronGeometry(1, 0)),
};
const cylCache = new Map();
function cylGeo(rt, rb, seg) {
  const key = `${rt.toFixed(3)}|${rb.toFixed(3)}|${seg}`;
  let g = cylCache.get(key);
  if (!g) { g = prep(new THREE.CylinderGeometry(rt, rb, 1, seg, 1).translate(0, 0.5, 0)); cylCache.set(key, g); }
  return g;
}

// Roof prism: base w×d at y=0, ridge of length `ridge` along x at height h.
// ridge = w → gable, ridge = 0 → pyramid, in between → hip.
function roofGeo(w, d, h, ridge) {
  const hw = w / 2, hd = d / 2, hr = ridge / 2;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
  const R1 = [-hr, h, 0], R2 = [hr, h, 0];
  const tris = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// Single sloped slab (lean-to): high edge at z=-d/2, low edge at z=+d/2.
function wedgeGeo(w, d, h) {
  const hw = w / 2, hd = d / 2;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
  const E = [-hw, h, -hd], F = [hw, h, -hd];
  const tris = [D, C, F, D, F, E, B, A, E, B, E, F, A, D, E, C, B, F];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// Box with chamfered vertical edges and a softened top rim — reads far less
// "blocky" than a plain box while staying low-poly.
const bevelCache = new Map();
function bevelBoxGeo(w, h, d, b) {
  b = Math.min(b, w * 0.3, d * 0.3);
  const tb = Math.min(b * 0.8, h * 0.25);
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${b.toFixed(3)}`;
  const hit = bevelCache.get(key);
  if (hit) return hit;
  const hw = w / 2, hd = d / 2;
  const ring = (inset, y) => [
    [-hw + b, y, -hd + inset], [hw - b, y, -hd + inset], [hw - inset, y, -hd + b], [hw - inset, y, hd - b],
    [hw - b, y, hd - inset], [-hw + b, y, hd - inset], [-hw + inset, y, hd - b], [-hw + inset, y, -hd + b],
  ];
  const r0 = ring(0, 0), r1 = ring(0, h - tb), r2 = ring(tb, h);
  const pos = [];
  const tri = (a, bb, c, out) => {
    const ab = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) pos.push(...a, ...c, ...bb); else pos.push(...a, ...bb, ...c);
  };
  for (let i = 0; i < 8; i++) {
    const k = (i + 1) % 8;
    const out = [(r0[i][0] + r0[k][0]) / 2, 0, (r0[i][2] + r0[k][2]) / 2];
    tri(r0[i], r0[k], r1[k], out); tri(r0[i], r1[k], r1[i], out);
    const out2 = [out[0], tb, out[2]];
    tri(r1[i], r1[k], r2[k], out2); tri(r1[i], r2[k], r2[i], out2);
    tri([0, h, 0], r2[i], r2[k], [0, 1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  bevelCache.set(key, g);
  return g;
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

export class GeoBuilder {
  constructor() {
    this.parts = [];
    this.stack = [new THREE.Matrix4()];
    this.emitVal = [0, 0, 0, 0];
    this.vary = 0;      // per-primitive colour variation (weathering)
    this._k = 0;
  }

  get M() { return this.stack[this.stack.length - 1]; }

  push(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    _p.set(x, y, z); _q.setFromEuler(_e.set(0, ry, 0)); _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    this.stack.push(this.M.clone().multiply(_m));
    return this;
  }
  pushEuler(x, y, z, rx, ry, rz = 0) {
    _p.set(x, y, z); _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')); _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    this.stack.push(this.M.clone().multiply(_m));
    return this;
  }
  pop() { this.stack.pop(); return this; }

  glow(r, g, b, mode) { this.emitVal = [r, g, b, mode]; return this; }
  noGlow() { this.emitVal = [0, 0, 0, 0]; return this; }

  add(geo, color, local) {
    const g = geo.clone();
    _m2.multiplyMatrices(this.M, local);
    g.applyMatrix4(_m2);
    const n = g.attributes.position.count;
    _c.set(color);
    if (this.vary) {
      const h = Math.sin(++this._k * 12.9898 + n * 78.233) * 43758.5453;
      const f = 1 + ((h - Math.floor(h)) - 0.5) * this.vary;
      _c.r *= f; _c.g *= f; _c.b *= f * 0.985;
    }
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    const em = new Float32Array(n * 4);
    const [er, eg, eb, ew] = this.emitVal;
    if (ew) for (let i = 0; i < n; i++) { em[i * 4] = er; em[i * 4 + 1] = eg; em[i * 4 + 2] = eb; em[i * 4 + 3] = ew; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('emit', new THREE.BufferAttribute(em, 4));
    this.parts.push(g);
    return this;
  }

  _local(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    _p.set(x, y, z); _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')); _s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(_p, _q, _s);
  }

  // Box sitting on y (bottom face at y).
  box(x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0) {
    return this.add(PRIM.box, color, this._local(x, y, z, sx, sy, sz, rx, ry, rz));
  }
  // Bevelled box sitting on y.
  cbox(x, y, z, sx, sy, sz, color, ry = 0, bevel = 0.022) {
    return this.add(bevelBoxGeo(sx, sy, sz, bevel), color, this._local(x, y, z, 1, 1, 1, 0, ry, 0));
  }
  // Box centred on (x,y,z).
  boxC(x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
    return this.add(PRIM.boxC, color, this._local(x, y, z, sx, sy, sz, rx, ry, rz));
  }
  cyl(x, y, z, rTop, rBot, h, seg, color, ry = 0, rx = 0, rz = 0) {
    const r = Math.max(rTop, rBot) || 1;
    return this.add(cylGeo(rTop / r, rBot / r, seg), color, this._local(x, y, z, r, h, r, rx, ry, rz));
  }
  cone(x, y, z, r, h, seg, color, ry = 0) { return this.cyl(x, y, z, 0, r, h, seg, color, ry); }
  sphere(x, y, z, r, color, detail = 0, sy = 1) {
    return this.add(detail ? PRIM.ico1 : PRIM.ico0, color, this._local(x, y, z, r, r * sy, r));
  }
  blob(x, y, z, sx, sy, sz, color, ry = 0) { return this.add(PRIM.dodec, color, this._local(x, y, z, sx, sy, sz, 0, ry, 0)); }

  roof(x, y, z, w, d, h, ridge, color, ry = 0) {
    return this.add(roofGeo(w, d, h, ridge), color, this._local(x, y, z, 1, 1, 1, 0, ry, 0));
  }
  wedge(x, y, z, w, d, h, color, ry = 0) {
    return this.add(wedgeGeo(w, d, h), color, this._local(x, y, z, 1, 1, 1, 0, ry, 0));
  }

  // Gable roof with overhanging slabs. Ridge runs along local x (or z if alongZ).
  gable(x, y, z, w, d, h, wallColor, roofColor, oh = 0.04, alongZ = false, t = 0.03) {
    this.push(x, y, z, alongZ ? Math.PI / 2 : 0);
    if (alongZ) [w, d] = [d, w];
    this.roof(0, 0, 0, w, d, h, w, wallColor);
    const hd = d / 2;
    const a = Math.atan2(h, hd);
    const L = Math.hypot(hd, h) + oh;
    const cz = (hd + oh * Math.cos(a)) / 2 + (t / 2) * Math.sin(a);
    const cy = (h - oh * Math.sin(a)) / 2 + (t / 2) * Math.cos(a);
    this.boxC(0, cy, cz, w + oh * 2, t, L, roofColor, a);
    this.boxC(0, cy, -cz, w + oh * 2, t, L, roofColor, -a);
    this.boxC(0, h + t * 0.4, 0, w + oh * 2 + 0.005, t * 1.1, t * 1.6, shade(roofColor, 0.85));
    this.pop();
    return this;
  }

  // Hip roof (solid), slightly overhanging.
  hip(x, y, z, w, d, h, roofColor, oh = 0.04, alongZ = false) {
    this.push(x, y, z, alongZ ? Math.PI / 2 : 0);
    if (alongZ) [w, d] = [d, w];
    const W = w + oh * 2, D = d + oh * 2;
    this.box(0, -0.012, 0, W, 0.025, D, shade(roofColor, 0.8));
    this.roof(0, 0, 0, W, D, h, Math.max(0, W - D), roofColor);
    this.pop();
    return this;
  }

  build() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}

export function shade(color, k) {
  const c = new THREE.Color(color);
  c.r *= k; c.g *= k; c.b *= k;
  return c;
}

export function mix(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
