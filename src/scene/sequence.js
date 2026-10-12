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
//   logo   the logo holds in the ring and sways once, slowly; then, in the last act, it hands over
//          to its flat vector (src/scene/vectorLogo.js), crisp as the footer slides under it

const inOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

// The sequence is laid out in scroll lengths (screens: one viewport height of scrolling), then
// turned into fractions of the page by retime(), which the stage calls with the page's own scroll
// length. In v3 the turn, the pose and the close-up ran over 5.2 screens; v4 plays them twice as
// fast (2.6 screens) and keeps the morph and the logo's hold at exactly v3's pace (2.24 and 0.56
// screens), so the page needs three acts fewer.
//   lead   the hero at rest before she starts to turn
//   turn   all the revolutions (the pose is the last part of them)
//   zoom   into the close-up
//   morph  the statue into the logo (as v3)
//   logo   the hold and the hand-over to the vector (as v3)
export const LENGTHS = { lead: 0.2, turn: 2.12, zoom: 0.28, morph: 2.24, logo: 0.56 };
const FIXED = ['morph', 'logo']; // never sped up or slowed down to fit the page

// the turn: from `from` to `to` (page progress), `revolutions` in all through one sine ease, so it
// starts and stops softly and never pauses between revolutions. It must end on a half revolution
// (she started from behind and ends facing the viewer). The first `first` revolutions are made
// with the mask raised; the pose phase begins where the ease reaches them.
export const TURN = { from: 0, to: 0, revolutions: 2.5, first: 1 };
export const PHASES = { hero: [0, 0], revolve: [0, 0], pose: [0, 0], zoom: [0, 0], morph: [0, 0], logo: [0, 1] };

/**
 * Lay the sequence over a page whose scroll runs `screens` viewport heights. The morph and the logo
 * keep their lengths; the hero, turn and close-up share what is left (in their own proportions),
 * so on a page of exactly the designed length every phase runs at its designed pace.
 */
export function retime(screens = Object.values(LENGTHS).reduce((a, b) => a + b, 0)) {
  const fixed = FIXED.reduce((sum, k) => sum + LENGTHS[k], 0);
  const free = LENGTHS.lead + LENGTHS.turn + LENGTHS.zoom;
  const total = Math.max(screens, fixed + free * 0.3);
  const k = (total - fixed) / free;
  const len = { lead: LENGTHS.lead * k, turn: LENGTHS.turn * k, zoom: LENGTHS.zoom * k, morph: LENGTHS.morph, logo: LENGTHS.logo };
  let at = 0;
  const span = (n) => { const r = [at / total, (at + n) / total]; at += n; return r; };
  const lead = span(len.lead), turn = span(len.turn), zoom = span(len.zoom), morph = span(len.morph);
  TURN.from = lead[1];
  TURN.to = turn[1];
  const split = TURN.from + (Math.acos(1 - (2 * TURN.first) / TURN.revolutions) / Math.PI) * (TURN.to - TURN.from);
  Object.assign(PHASES, { hero: lead, revolve: [TURN.from, split], pose: [split, TURN.to], zoom, morph, logo: [morph[1], 1] });
  TRACKS.turn.range = [TURN.from, TURN.to];
}
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const linear = (t) => t;

// each track runs over [from, to] of its phase (fractions of the phase), through its own ease
export const TRACKS = {
  turn: { range: [0, 1], from: 0, to: 1, ease: inOutSine }, // 0..1 of all the revolutions (range set by retime)
  arm: { phase: 'pose', from: 0.05, to: 0.8, ease: inOutCubic }, // mask down beside the face
  head: { phase: 'pose', from: 0.35, to: 1, ease: inOutQuad }, // the face turns away from it
  zoom: { phase: 'zoom', from: 0, to: 1, ease: inOutSine }, // into the close-up (it opens out as the logo grows)
  morph: { phase: 'morph', from: 0, to: 1, ease: linear }, // per-triangle stagger is in the shader
  logo: { phase: 'logo', from: 0, to: 0.45, ease: inOutSine }, // the logo's slow sway, done before the hand-over
  vector: { phase: 'logo', from: 0.5, to: 0.85, ease: inOutSine }, // the 3D logo hands over to its vector
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
retime();

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
