// How a building stands on its plot, beyond facing its street.
//
// The plot (b.x, b.z, its width and depth) is what the town works with:
// which tiles are taken, the way in from the street, what it reaches. The
// model stands on it facing the street (b.rot; or 45 degrees to a diagonal,
// b.diag), and may be turned and nudged on top of that:
//  - b.pose (saved, set by the player): { a, x, z }, a turn of up to TURN_MAX
//    either way (radians, anticlockwise seen from above, as the model's own
//    turn), and a nudge of up to NUDGE across (x) and forward (z) in its own
//    frame. It replaces the small random turn and offset buildings on plain
//    streets have.
//  - b.curve (worked out from the roads, never saved): a one-tile building
//    facing the outside of a bend in the street is turned to sit square to
//    the curve (World._curveOf).
// Either way the model is fitted to its plot (shrunk if need be, see the fit
// in render/buildings.js), so it never reaches into a neighbour or onto the
// road, and its real footprint (b.foot, a polygon in world space) is set by
// the view when it is built.

import { facingAngle } from './diagonal.js';

export const TURN_MAX = Math.PI / 4, NUDGE = 0.2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 1000) / 1000;

// A pose from a save, a guest or the player, made safe: null for none (or no
// turn and no nudge at all).
export function cleanPose(p) {
  const [a, x, z] = Array.isArray(p) ? p : p && typeof p === 'object' ? [p.a, p.x, p.z] : [];
  if (![a, x, z].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  const out = { a: round(clamp(a, -TURN_MAX, TURN_MAX)), x: round(clamp(x, -NUDGE, NUDGE)), z: round(clamp(z, -NUDGE, NUDGE)) };
  return out.a || out.x || out.z ? out : null;
}

// As saved or sent: [a, x, z], or null.
export const poseRec = (b) => (b.pose ? [b.pose.a, b.pose.x, b.pose.z] : null);

// The turn and offset a building's model stands at on its plot, from its
// pose or its bend, or null (the usual small random one): { yaw (radians
// from facing its street), ox, oz (the offset in world space), m (how far
// the offset reaches, in the model's own frame, for the fit) }.
export function poseJitter(b) {
  // (a building on only part of a grown plot keeps the turn it had on its own)
  if (b.spare) return null;
  const p = b.pose, yaw = p ? p.a : b.curve || 0;
  if (!p && !yaw) return null;
  const x = p ? p.x : 0, z = p ? p.z : 0, th = facingAngle(b), co = Math.cos(th), si = Math.sin(th);
  return { yaw, ox: x * co + z * si, oz: -x * si + z * co, m: Math.abs(x) + Math.abs(z) };
}

// The way a building's front faces, in world space (radians, as facingAngle),
// with its turn.
export function frontAngle(b) {
  const j = poseJitter(b);
  return facingAngle(b) + (j ? j.yaw : 0);
}
