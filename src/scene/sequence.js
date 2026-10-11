// The statue's scroll sequence: one number, `p` (0 at the top of the page, 1 where <main> ends and
// the footer begins), is turned into the tracks the stage needs. Retime the whole thing here.
//
//   hero     the v2 composition, at rest (seen from behind, mask raised)
//   revolve  she makes one full revolution, the mask still raised
//   pose     she turns on, one and a half revolutions more, to face the viewer; through them the
//            masked arm brings the mask beside the face and the head turns away from it
//            (the turn is one smooth motion across both phases; the pose starts the moment the
//            first revolution is complete)
//   zoom   the view closes in on her upper body: her head, the hand and the mask
//   morph  the statue's own surface flows into the 3D logo (src/scene/morph.js): the mask, hand and
//          face first, in the close-up; then, as the robes stream in and the logo grows to its
//          place, the view opens out again
//   logo   the gold logo holds in the ring, swaying slowly

const inOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

// the turn: from `from` to `to` (page progress), `revolutions` in all through one sine ease, so it
// starts and stops softly and never pauses between revolutions. It must end on a half revolution
// (she started from behind and ends facing the viewer). The first `first` revolutions are made
// with the mask raised; the pose phase begins where the ease reaches them.
export const TURN = { from: 0.05, to: 0.58, revolutions: 2.5, first: 1 };
const split = TURN.from + (Math.acos(1 - (2 * TURN.first) / TURN.revolutions) / Math.PI) * (TURN.to - TURN.from);

export const PHASES = {
  hero: [0, TURN.from],
  revolve: [TURN.from, split],
  pose: [split, TURN.to],
  zoom: [0.58, 0.65],
  morph: [0.65, 0.93],
  logo: [0.93, 1],
};
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const linear = (t) => t;

// each track runs over [from, to] of its phase (fractions of the phase), through its own ease
export const TRACKS = {
  turn: { range: [TURN.from, TURN.to], from: 0, to: 1, ease: inOutSine }, // 0..1 of all the revolutions
  arm: { phase: 'pose', from: 0.05, to: 0.8, ease: inOutCubic }, // mask down beside the face
  head: { phase: 'pose', from: 0.35, to: 1, ease: inOutQuad }, // the face turns away from it
  zoom: { phase: 'zoom', from: 0, to: 1, ease: inOutSine }, // into the close-up (it opens out as the logo grows)
  morph: { phase: 'morph', from: 0, to: 1, ease: linear }, // per-triangle stagger is in the shader
  logo: { phase: 'logo', from: 0, to: 1, ease: inOutSine }, // the logo's slow sway
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Evaluate every track at page progress p. Returns { turn, arm, head, zoom, morph, logo, phase }. */
export function evaluate(p) {
  const out = { phase: 'hero' };
  for (const [name, [a, b]] of Object.entries(PHASES)) if (p >= a) out.phase = name;
  for (const [name, t] of Object.entries(TRACKS)) {
    const [a, b] = t.range ?? PHASES[t.phase];
    const local = clamp01((p - a) / (b - a));
    out[name] = t.ease(clamp01((local - t.from) / (t.to - t.from)));
  }
  return out;
}
