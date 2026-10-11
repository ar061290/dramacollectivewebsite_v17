// The statue's scroll sequence: one number, `p` (0 at the top of the page, 1 where <main> ends and
// the footer begins), is turned into the tracks the stage needs. Retime the whole thing here.
//
//   hero   the v2 composition, at rest (seen from behind, mask raised)
//   pose   the statue turns 180 degrees to face the viewer; the masked arm lowers and brings the
//          mask beside the face; the head turns away from it. Each on its own curve.
//   morph  the statue's own surface flows into the 3D logo (src/scene/morph.js)
//   logo   the gold logo holds in the ring, swaying slowly

export const PHASES = {
  hero: [0, 0.08],
  pose: [0.08, 0.55],
  morph: [0.55, 0.85],
  logo: [0.85, 1],
};

const inOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const linear = (t) => t;

// each track runs over [from, to] of its phase (fractions of the phase), through its own ease
export const TRACKS = {
  turn: { phase: 'pose', from: 0, to: 1, ease: inOutSine }, // 0..1 of the 180 degree turn
  arm: { phase: 'pose', from: 0.05, to: 0.8, ease: inOutCubic }, // mask down beside the face
  head: { phase: 'pose', from: 0.35, to: 1, ease: inOutQuad }, // the face turns away from it
  morph: { phase: 'morph', from: 0, to: 1, ease: linear }, // per-triangle stagger is in the shader
  logo: { phase: 'logo', from: 0, to: 1, ease: inOutSine }, // the logo's slow sway
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Evaluate every track at page progress p. Returns { turn, arm, head, morph, logo, phase }. */
export function evaluate(p) {
  const out = { phase: 'hero' };
  for (const [name, [a, b]] of Object.entries(PHASES)) if (p >= a) out.phase = name;
  for (const [name, t] of Object.entries(TRACKS)) {
    const [a, b] = PHASES[t.phase];
    const local = clamp01((p - a) / (b - a));
    out[name] = t.ease(clamp01((local - t.from) / (t.to - t.from)));
  }
  return out;
}
