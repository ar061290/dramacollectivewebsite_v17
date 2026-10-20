// The publication page's statue: after Rodin's The Thinker, studying a tragedy mask he holds in his
// hand (a Meshy model, assets/models/thinker.glb: its shape only, slimmed to about 246k triangles,
// with a patina guide baked into it, and Draco-compressed with glTF-Transform; see the README).
// The page shows him in more than one place (the opening, the upcoming pieces, the writers' box):
// each place is a Thinker, its own small canvas inside its box (so he scrolls with the page exactly),
// and the model is fetched and decoded once for all of them (loadModel).
// Its finish is made here, not in the file: a cast metal darkened to a slate charcoal, satin, that
// takes the light much as the home page's stone does; the high points, rubbed back to a paler grey,
// are more metallic and glint under the warm key. A patina darkens it the further the surface sinks,
// to a plum-charcoal in the folds and near black in the deepest: the plum is in the value of the
// shadows, never a stain on the lit surface. The slate's green is taken out by a touch of plum, so
// the warm key turns it a warm grey. Where the patina gathers comes from the guide baked into each
// vertex (how open the surface is, and how it curves); the casting's fine grain and a slightly
// uneven sheen keep it from reading as plastic.
// It stands on the same stage as the home page's statue (src/scene/Stage.js): one warm spotlight
// from above, a cool rim behind, a soft shadow and a faint pool of light under it, and in the light
// theme the house lights come up. Lights and colours come from the design tokens. The one light
// that moves is the cursor's: the page's gold glow follows the pointer (src/animations/cursor.js),
// and the metal reflects it, as a small warm lamp held just in front of whatever part of him is
// under the pointer: a soft pool of gold there and nowhere else, gone when the pointer is away
// from him. Nothing else sweeps over him.
// It does not spin: the figure is nude and the mask's back is solid, so it turns only a little
// either side of the view it was made for (his face and the mask's in profile, facing each other).
// It leans after the pointer anywhere on the page; dragging it (or swiping it) turns it a little
// further, and let go, it settles back. Reduced motion: it stands still. Transparent, so the page
// shows around it.
// The page is never held up for it: the model is fetched first, and the shaders compiled off the
// main thread where the browser can (the first frame waits for them). It draws only while in view,
// only when something has moved, and at about 30 frames a second unless it is being turned. If the
// browser drops its WebGL context, the still picture comes back until the context is restored.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { readToken, antialias } from '../util/env.js';
import { stopLoop } from './loop.js';
import { mark } from '../util/perf.js';

// the Draco decoder served with the site (as for the home page's statue, src/scene/statue.js)
const DRACO_PATH = import.meta.env ? new URL('draco/', document.baseURI).href : new URL('../../public/draco/', import.meta.url).href;

const DEG = Math.PI / 180;
// The view the model was made for, as a turn of the model about its upright: his face and the
// mask's in profile, facing each other. Within REACH either side the mask's solid back and the
// front of the figure stay out of sight.
const REST = 55 * DEG;
const REACH = 25 * DEG;
const FOLLOW = 12 * DEG; // how far the pointer alone turns it, at the page's edge
const HEIGHT = 2; // the model is scaled to this height, its base on y = 0
const IDLE_FRAME = 1000 / 30; // ms between frames unless it is being turned

// The stage in each theme, as the home page's (src/scene/Stage.js, at its opening view): the
// spotlight's and the rim's strength, the house lights (an even light from above, and the room the
// surface reflects), the exposure, the warm pool on the floor and the shadow's depth. In the dark
// theme the key and the house lights are a little up on the home page's, so the dark figure's form
// still reads; the exposure and the light theme are the home page's.
const STAGE = {
  dark: { key: 1.1, rim: 0.75, hemi: 0.16, env: 0.38, exposure: 1, pool: 0.16, shadow: 0.5 },
  light: { key: 0.75, rim: 0.6, hemi: 1.1, env: 0.55, exposure: 0.88, pool: 0, shadow: 0.3 },
};

// The finish (the same in both themes: the light changes, not the metal). Colours are design
// tokens, some mixed toward each other: [a, b, t] is a carried t of the way toward b. The plum is
// kept low in chroma on purpose: the warm key turns any strong plum on a lit surface red.
const FINISH = {
  metal: ['--slate-700', '--plum-700', 0.2], // the cast's skin: slate, its green taken out by a little plum
  metalDeep: ['--slate-800', '--black', 0.45], // and where it is darker (uneven, as patinas are)
  rubbed: ['--slate-500', '--plum-700', 0.3], // the high points, rubbed back to the metal
  patina: ['--slate-800', '--plum-900', 0.45], // the patina: a plum-charcoal wash, darker than the skin
  deep: ['--black', '--slate-800', 0.3], // and in the deepest folds, near black
  shade: ['--plum-700', '--slate-800', 0.25], // the hue the deepest shade takes (AO_GLSL): plum, dulled
  metalness: 0.45, rubMetal: 0.85, // a cast metal, satin; brighter metal where it is rubbed
  metalRough: 0.58, rubRough: 0.44, patRough: 0.85, // satin at most (and never below 0.4)
  cav: 1.2, hollow: 1, recMax: 0.95, // how sunk the surface is: closed in, in a hollow (capped)
  mottle: 0.25, feather: 0.1, bias: 0, lo: 0, hi: 0.8, // the patina: a broad wash, no specks
  deepLo: 0.4, deepHi: 0.9, deepAmt: 0.9,
  // the plum in the shade: in the deepest recesses (deepLo..deepHi), below shadeY (the face, the neck
  // and the mask stay clear), by shadeAmt, and only where the light reaching them is under shadeTop
  shadeAmt: 0.5, shadeTop: 0.04, shadeY: 1,
  tone: 0.7, cloud: 0.3, rVar: 0.35, // how unevenly the skin darkens, broadly or in smaller clouds, and its sheen
  wear: 1, wLo: 0.25, wHi: 1, // the rubbed high points (fewer low down: the rock's ridges stay dark)
  grain: 0.09, crust: 0.16, model: 0.05, lump: 0.04, // the relief: casting grain, the patina's tooth, the modelling
  ao: 0.85, // the baked occlusion, on the light
  scale: 1.6, grainScale: 90, // noise sizes, per unit of height (the figure is 2 high)
};

const NOISE = /* glsl */ `
float tkHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
// value noise and its gradient (after Inigo Quilez): the relief is bent from the gradient, exact at
// every pixel, rather than from screen-space differences (which come in 2x2 blocks)
vec4 tkNoiseD(vec3 x) {
  vec3 i = floor(x), w = fract(x);
  vec3 u = w * w * (3.0 - 2.0 * w), du = 6.0 * w * (1.0 - w);
  float a = tkHash(i), b = tkHash(i + vec3(1, 0, 0)), c = tkHash(i + vec3(0, 1, 0)), d = tkHash(i + vec3(1, 1, 0));
  float e = tkHash(i + vec3(0, 0, 1)), f = tkHash(i + vec3(1, 0, 1)), g = tkHash(i + vec3(0, 1, 1)), h = tkHash(i + vec3(1, 1, 1));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f;
  float k7 = -a + b + c - d + e - f - g + h;
  return vec4(a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
    du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y));
}
// three octaves, each turned off the grid (so no square cells show), with their gradient
const mat3 TK_ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
vec4 tkFbmD(vec3 x) {
  vec4 s = vec4(0.0);
  mat3 m = mat3(1.0);
  float a = 0.5;
  for (int k = 0; k < 3; k++) {
    vec4 n = tkNoiseD(x);
    s += a * vec4(n.x, m * n.yzw);
    x = TK_ROT * x * 2.03 + 1.7;
    m = m * (2.03 * transpose(TK_ROT));
    a *= 0.5;
  }
  return s / 0.875;
}`;

// the finish, after three's own normal is in place and before any light is reckoned
const FINISH_GLSL = /* glsl */ `#include <normal_fragment_maps>
{
  // the baked guide: openness (1 = open to the room), fine and broad curvature (0.5 = flat)
  float open = vTkPat.r, fineC = vTkPat.g * 2.0 - 1.0, broadC = vTkPat.b * 2.0 - 1.0;
  vec4 n1 = tkFbmD(vTkPos * uTkScale);              // broad: the skin's uneven tone, the patina thinning or thickening
  vec4 n2 = tkFbmD(vTkPos * uTkScale * 3.1 + 7.0);  // mid: the modelled surface's lows and highs
  // the fine relief fades as it shrinks toward a pixel (no shimmer as the figure turns)
  float fw = length(fwidth(vTkPos)) * uTkGrainScale;
  vec4 grain = tkNoiseD(vTkPos * uTkGrainScale);
  float gFade = 1.0 - smoothstep(0.3, 0.7, fw);
  // how sunk the surface is: closed in, in a hollow of the broad form, in a fine crease
  float rec = min((1.0 - open) * uTkCav + max(-broadC, 0.0) * uTkHollow * 0.7 + max(-fineC, 0.0) * uTkHollow * 0.35, uTkRecMax);
  // the patina: a wash that darkens the skin the further it sinks, thinned and thickened broadly
  float m = smoothstep(uTkLo, uTkHi, rec + (n1.x - 0.5) * uTkMottle + (n2.x - 0.5) * uTkFeather + uTkBias);
  float deep = smoothstep(uTkDeepLo, uTkDeepHi, rec + (n1.x - 0.5) * uTkMottle * 0.5) * uTkDeepAmt;
  // rubbed: the sharp ridges and the crowns of the forms, where hands and cloths reach
  float w = (max(fineC, 0.0) * 0.6 + max(broadC, 0.0) * 0.4) * uTkWear * open + (n2.x - 0.5) * 0.05;
  float wear = smoothstep(uTkWLo, uTkWHi, w) * mix(0.35, 1.0, smoothstep(0.15, 0.6, vTkPos.y));
  m *= 1.0 - wear;
  deep *= 1.0 - wear;
  tkShadeMask = smoothstep(uTkDeepLo, uTkDeepHi, rec + (n2.x - 0.5) * 0.25) * (1.0 - smoothstep(uTkShadeY, uTkShadeY + 0.3, vTkPos.y)) * (1.0 - wear);
  // the colour: the skin, unevenly dark; paler where rubbed; darker as the patina sinks, and darkest
  // in the deepest folds (the plum there is in the value, not a stain on the lit surface)
  vec3 metal = mix(uTkMetal, mix(uTkMetalDeep, uTkMetal, smoothstep(0.3, 0.7, mix(n1.x, n2.x, uTkCloud))), uTkTone);
  metal = mix(metal, uTkRubbed, wear);
  vec3 col = mix(metal, uTkPatina, m);
  diffuseColor.rgb = mix(col, uTkDeep, deep);
  // its sheen broken up a little (never wet: satin at most), and metal only where it is rubbed
  roughnessFactor = max(mix(mix(uTkMetalRough, uTkRubRough, wear) + (n1.x - 0.5) * 0.08 + (n2.x - 0.5) * uTkRVar, uTkPatRough, m), 0.4);
  metalnessFactor = mix(mix(uTkMetalness, uTkRubMetal, wear), 0.0, m);
  // the relief, as a slope in the model's space, turned into the view's and laid along the surface:
  // the casting's grain (a little coarser where the patina lies), the modelling
  vec3 slope = grain.yzw * mix(uTkGrain * (1.0 - wear * 0.6), uTkCrust, m) * gFade
    + n2.yzw * uTkModel + n1.yzw * uTkLump;
  vec3 sv = uTkView * slope;
  normal = normalize(normal - (sv - dot(sv, normal) * normal));
}`;

const AO_GLSL = /* glsl */ `#include <aomap_fragment>
{
  // the baked occlusion: deep folds take less of the room's light, and a little less of the lamps'
  float aoV = mix(1.0, vTkPat.r, uTkAo);
  reflectedLight.indirectDiffuse *= aoV;
  reflectedLight.indirectSpecular *= aoV * aoV;
  reflectedLight.directDiffuse *= mix(1.0, aoV, 0.5);
  reflectedLight.directSpecular *= mix(1.0, aoV, 0.5);
  // the plum in the shade: deep in the recesses, where little light reaches, the shadow takes the
  // patina's plum (brightness kept); where the light does fall it fades out, so no plum edge follows
  // a shadow's, and no lit surface is ever stained
  const vec3 tkLuma = vec3(0.2126, 0.7152, 0.0722);
  float tkLit = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, tkLuma);
  float tkS = tkShadeMask * uTkShadeAmt * (1.0 - smoothstep(0.0, uTkShadeTop, tkLit));
  vec3 tkTint = mix(vec3(1.0), uTkShade / dot(uTkShade, tkLuma), tkS);
  reflectedLight.directDiffuse *= tkTint;
  reflectedLight.indirectDiffuse *= tkTint;
}`;

const COLORS = ['metal', 'metalDeep', 'rubbed', 'patina', 'deep', 'shade'];
const uniformName = (k) => `uTk${k[0].toUpperCase()}${k.slice(1)}`;

/** A colour from the tokens: a name, or [a, b, t] (a carried t of the way toward b). */
function tokenColor(spec) {
  const read = (n) => new THREE.Color(readToken(n) || (n === '--black' ? '#150408' : '#808080'));
  if (!Array.isArray(spec)) return spec.startsWith?.('--') ? read(spec) : new THREE.Color(spec);
  const [a, b, t] = spec;
  return read(a).lerp(read(b), t);
}

const frames = (n) => new Promise((resolve) => { const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step)); step(); });

// The cursor's lamp: the glow's gold (the site's --spot-rgb: gold-300, gold-600 with the house
// lights up), held a little in front of whatever part of him is under the pointer, so the metal
// shows a small, soft reflection of the glow there and nowhere else. Its strength at its brightest
// in each theme (the house lights wash out a faint one), how far in front of the surface it is
// held (the nearer, the smaller the pool it lights), how far its light reaches (nothing beyond:
// a pointer away from him lights nothing), and how quickly it eases after the pointer.
const GLOW = { intensity: 0.28, dayIntensity: 0.5, ahead: 0.26, distance: 1.05, ease: 10 };
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// ---- the model, fetched and decoded once for every Thinker on the page ----

const models = new Map(); // url -> { promise, users }

/**
 * The model, ready to draw: its geometry (its own transform baked in, scaled to HEIGHT, its base on
 * y = 0, centred on the upright it turns about), the centre of the rock's footprint (for the floor)
 * and the mask's centre (for the page: words can come out of it). Shared: every Thinker draws the
 * same geometry (each renderer keeps its own copy on the GPU); it is let go with its last user.
 */
export function loadModel(url) {
  let entry = models.get(url);
  if (!entry) {
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH).setDecoderConfig({ type: 'wasm' });
    draco.preload();
    const promise = new GLTFLoader().setDRACOLoader(draco).loadAsync(url).finally(() => draco.dispose()).then((gltf) => {
      const object = gltf.scene;
      object.updateMatrixWorld(true);
      let mesh = null;
      object.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) throw new Error('The model has no mesh.');
      // the loader's own geometry, transformed in place (it was cloned, and the original thrown away),
      // with its bounds computed once from the final positions rather than again after every step:
      // the loader presets them, and three recomputes bounds that are set on every transform
      const debugFrom = /[?&]debug\b/.test(location.search) ? mesh.geometry.clone() : null;
      const geometry = mesh.geometry;
      geometry.boundingBox = null;
      geometry.boundingSphere = null;
      geometry.applyMatrix4(mesh.matrixWorld);
      object.traverse((o) => { if (o.isMesh && o.geometry !== geometry) o.geometry.dispose(); });
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      geometry.boundingBox = null;
      const s = HEIGHT / (bb.max.y - bb.min.y);
      geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      geometry.scale(s, s, s);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if (debugFrom) checkPrep(debugFrom, mesh.matrixWorld, geometry);
      // the rock's footprint: the lowest few percent of the model
      const pos = geometry.attributes.position;
      const foot = new THREE.Vector3();
      let n = 0;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0.04 * HEIGHT) continue;
        foot.x += pos.getX(i); foot.z += pos.getZ(i); n++;
      }
      if (n) foot.divideScalar(n);
      // the mask: the part furthest to the right in the view he was made for, above his knees
      const c = Math.cos(REST), sn = Math.sin(REST);
      let right = -Infinity;
      for (let i = 0; i < pos.count; i++) right = Math.max(right, pos.getX(i) * c + pos.getZ(i) * sn);
      const mask = new THREE.Vector3();
      n = 0;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < 0.55 * HEIGHT || pos.getX(i) * c + pos.getZ(i) * sn < right - 0.1 * HEIGHT) continue;
        mask.x += pos.getX(i); mask.y += pos.getY(i); mask.z += pos.getZ(i); n++;
      }
      if (n) mask.divideScalar(n);
      return { geometry, foot, mask, front: frontOf(pos) };
    });
    entry = { promise, users: 0 };
    models.set(url, entry);
    promise.catch(() => models.delete(url)); // a failed fetch may be tried again
  }
  entry.users++;
  return entry.promise;
}

/** ?debug: the way the model used to be prepared (a clone, bounds recomputed at every step), beside the
 *  way it is now, compared number for number. */
function checkPrep(from, matrix, now) {
  const g = from.applyMatrix4(matrix);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const s = HEIGHT / (bb.max.y - bb.min.y);
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.scale(s, s, s);
  g.computeBoundingSphere();
  const same = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const attrs = Object.keys(g.attributes).filter((k) => !same(g.attributes[k].array, now.attributes[k].array));
  const bounds = same(g.boundingBox.min.toArray().concat(g.boundingBox.max.toArray(), g.boundingSphere.center.toArray(), [g.boundingSphere.radius]),
    now.boundingBox.min.toArray().concat(now.boundingBox.max.toArray(), now.boundingSphere.center.toArray(), [now.boundingSphere.radius]));
  console[attrs.length || !bounds ? 'warn' : 'info'](`thinker model prep: ${attrs.length || !bounds ? 'DIFFERS (' + attrs.join(', ') + (bounds ? '' : ' bounds') + ')' : 'identical to the old way, every attribute and bound'}`);
  g.dispose();
}

let statueMarked = false; // the steps are marked for the first statue on a page only

/**
 * The figure's front as the camera sees it in his view (the turn at REST): over a grid across the
 * view (x across, y up), how near the camera the nearest surface comes, as z toward it. Past the
 * silhouette it is carried out from the edges, and then softened, so that a pointer beside him
 * finds the nearest edge's depth and the lamp glides rather than jumps where one form stands in
 * front of another (an arm before the chest). It lets the cursor's lamp be held just in front of
 * whatever is under the pointer (Thinker._placeGlow). Made once per model, in a few milliseconds.
 */
function frontOf(pos) {
  const c = Math.cos(REST), s = Math.sin(REST);
  const CELL = 0.025, PAD = 0.5;
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const X = pos.getX(i) * c + pos.getZ(i) * s;
    if (X < x0) x0 = X;
    if (X > x1) x1 = X;
    if (pos.getY(i) > y1) y1 = pos.getY(i);
  }
  x0 -= PAD; x1 += PAD; y1 += PAD;
  const y0 = -PAD;
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL);
  const EMPTY = -Infinity;
  let z = new Float32Array(nx * ny).fill(EMPTY);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), w = pos.getZ(i);
    const Z = -x * s + w * c;
    const k = Math.floor((pos.getY(i) - y0) / CELL) * nx + Math.floor((x * c + w * s - x0) / CELL);
    if (Z > z[k]) z[k] = Z;
  }
  // carried out from the silhouette, a cell a pass (and any gap in the surface filled on the way)
  for (let pass = 0; pass < 24; pass++) {
    const next = z.slice();
    let grew = false;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (z[k] !== EMPTY) continue;
        let sum = 0, n = 0;
        if (i > 0 && z[k - 1] !== EMPTY) { sum += z[k - 1]; n++; }
        if (i < nx - 1 && z[k + 1] !== EMPTY) { sum += z[k + 1]; n++; }
        if (j > 0 && z[k - nx] !== EMPTY) { sum += z[k - nx]; n++; }
        if (j < ny - 1 && z[k + nx] !== EMPTY) { sum += z[k + nx]; n++; }
        if (n) { next[k] = sum / n; grew = true; }
      }
    }
    z = next;
    if (!grew) break;
  }
  for (let k = 0; k < z.length; k++) if (z[k] === EMPTY) z[k] = 0; // far out: the upright
  // softened twice (3x3)
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(z.length);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let sum = 0, n = 0;
        for (let b = Math.max(0, j - 1); b <= Math.min(ny - 1, j + 1); b++) {
          for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) { sum += z[b * nx + a]; n++; }
        }
        next[j * nx + i] = sum / n;
      }
    }
    z = next;
  }
  return { x0, y0, cell: CELL, nx, ny, z };
}

function releaseModel(url) {
  const entry = models.get(url);
  if (!entry || --entry.users > 0) return;
  models.delete(url);
  entry.promise.then(({ geometry }) => geometry.dispose()).catch(() => {});
}

export class Thinker {
  /**
   * @param {HTMLElement} container  the statue's box; the canvas fills it
   * @param {object} o
   * @param {boolean} o.reduced      reduced motion: still, drawn only when something changes
   * @param {'dark'|'light'} o.theme
   * @param {(turning: boolean) => void} [o.onTurn]  told when a drag starts and stops turning it
   * @param {number} [o.fit]           how much of the box he fills (1: the whole figure with a little room)
   * @param {boolean} [o.turnable]     whether a drag turns him (he always leans after the pointer)
   */
  constructor(container, { reduced = false, theme = 'dark', onTurn = () => {}, fit = 1, turnable = true } = {}) {
    this.container = container;
    this.reduced = reduced;
    this.theme = theme in STAGE ? theme : 'dark';
    this.onTurn = onTurn;
    this.fit = fit;
    this.turnable = turnable;
    this.visible = true;
    this.dirty = true;
    this.ready = false; // compiled and drawn once: only then does the loop run
    this.lost = false; // the browser has dropped the WebGL context
    // high-DPI screens are drawn at 1.5x at most, without multisampling (the extra pixels smooth the
    // edges well enough): a weak GPU cannot afford both
    const dpr = Math.min(devicePixelRatio, 1.5);
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: antialias(dpr < 1.25), alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false; // the lights never move: drawn again only when the figure turns
    const canvas = r.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity .9s cubic-bezier(.22,.61,.36,1)';
    container.append(canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(18, 1, 0.1, 60);

    // the home page's lights (src/scene/Stage.js): the spotlight is the gold token carried toward
    // white, so the metal is lit warm without turning brassy; the rim and the house light are slate
    const white = new THREE.Color(1, 1, 1);
    this.warm = tokenColor('--gold-300').lerp(white, 0.35);
    const H = HEIGHT;
    const key = new THREE.SpotLight(this.warm, 0, 0, 0.36, 0.85, 2);
    key.position.set(1.35 * H, 2.9 * H, 1.6 * H);
    key.target.position.set(0, H * 0.45, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 6 * H;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    // (the rim a touch warm, like the stage's spill, never a cool grade)
    const rim = new THREE.SpotLight(tokenColor(['--slate-300', '--gold-300', 0.15]), 0, 0, 0.5, 1, 2);
    rim.position.set(-1.4 * H, 2.1 * H, -1.8 * H);
    rim.target.position.set(0, H * 0.5, 0);
    const hemi = new THREE.HemisphereLight(tokenColor('--slate-300'), 0x000000, 0);
    hemi.position.set(0, 4 * H, 0);
    // the cursor's lamp: the page's gold glow, held where the pointer is, just in front of him
    // (off until a pointer has been seen; it eases after the pointer, and fades when it leaves)
    // Its gold is the glow's in each theme (--spot-rgb: gold-300 in the dark, gold-600 with the
    // house lights up), changing with the stage (_applyStage)
    const glow = new THREE.PointLight(tokenColor('--gold-300'), 0, GLOW.distance, 2);
    this.scene.add(key, key.target, rim, rim.target, hemi, glow);
    this.lights = { key, rim, hemi, glow, keyPower: 26 * H * H, rimPower: 9 * H * H };
    this.glowGold = { dark: tokenColor('--gold-300'), light: tokenColor('--gold-600') };
    this.pointer = { x: 0, y: 0, seen: false, on: 0, to: 0 };
    this.glowAt = new THREE.Vector3(0, H * 0.7, 1);
    this.glowTo = new THREE.Vector3(0, H * 0.7, 1);

    this.turn = new THREE.Group(); // turned by the pointer and by drags, about the upright
    this.scene.add(this.turn);

    // the finish's uniforms (the colours from the tokens), and the view's turn for the relief
    this.uniforms = { uTkView: { value: new THREE.Matrix3() } };
    this.canvasSize = { value: new THREE.Vector2(1, 1) }; // in device pixels, for the floor's fade
    for (const [k, v] of Object.entries(FINISH)) {
      this.uniforms[uniformName(k)] = { value: COLORS.includes(k) ? tokenColor(v) : v };
    }
    this.finish = { ...FINISH };

    // the stage's level between the themes: 0 the dark theatre, 1 the house lights up
    this.day = { value: this.theme === 'light' ? 1 : 0 };

    // the turn: from the pointer (follow), from a drag (drag), eased toward their sum
    this.yaw = { now: 0, follow: 0, drag: 0 };
    this.elev = { now: 0, to: 0 };
    this.press = null;
    this.lastFrame = 0;
    this.shadowYaw = NaN;
    this._tick = this._tick.bind(this);
    this._onPointer = this._onPointer.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onWindowLeave = this._onWindowLeave.bind(this);
    this._onScroll = this._onScroll.bind(this);
    this._onLost = this._onLost.bind(this);
    this._onRestored = this._onRestored.bind(this);
    canvas.addEventListener('webglcontextlost', this._onLost);
    canvas.addEventListener('webglcontextrestored', this._onRestored);
    this.ro = new ResizeObserver(() => this._resize());
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this._sync(); });
  }

  /** The room the metal reflects (three's RoomEnvironment, as on the home page), pre-filtered. */
  _makeEnv() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment?.dispose();
    this.envTarget?.dispose();
    this.envTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envTarget.texture;
    room.dispose();
    pmrem.dispose();
  }

  /**
   * The floor, seen only where the light and the shadow fall on it (as on the home page): a soft
   * shadow and a faint warm pool under the rock, both fading out with distance from it, and again
   * toward the canvas's edges (so neither is ever cut off by them, at any size).
   */
  _buildFloor(foot) {
    const H = HEIGHT;
    const fade = (m, r0, r1) => {
      m.onBeforeCompile = (s) => {
        s.uniforms.uTkCanvas = this.canvasSize;
        s.vertexShader = s.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vTkFloor;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTkFloor = position.xy;');
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vTkFloor;\nuniform vec2 uTkCanvas;')
          .replace('#include <tonemapping_fragment>', `{
  vec2 uv = gl_FragCoord.xy / uTkCanvas;
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  gl_FragColor.a *= (1.0 - smoothstep(${r0.toFixed(3)}, ${r1.toFixed(3)}, length(vTkFloor))) * smoothstep(0.0, 0.14, edge);
}
#include <tonemapping_fragment>`);
      };
      return m;
    };
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62 * H, 48),
      fade(new THREE.ShadowMaterial({ color: tokenColor('--plum-900'), opacity: 0.5, depthWrite: false }), 0.3 * H, 0.6 * H),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(foot.x, 0.002, foot.z);
    shadow.receiveShadow = true;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    this.poolTex = new THREE.CanvasTexture(c);
    this.poolTex.colorSpace = THREE.SRGBColorSpace;
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(H * 1.1, H * 1.1),
      // (its own texture fades it; the radial fade lies beyond its corners, and is kept a width
      // wide: a smoothstep with equal edges is undefined)
      fade(new THREE.MeshBasicMaterial({ map: this.poolTex, color: this.warm, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0.95 * H, H),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(foot.x, 0.001, foot.z);
    this.floor = { shadow, pool };
    this.turn.add(shadow, pool);
  }

  async load(url) {
    this.url = url;
    const step = statueMarked ? () => {} : mark; // dc:statue-env, -model, -compiled, -drawn, for the lab
    statueMarked = true;
    const loading = loadModel(url);
    loading.catch(() => {}); // reported below
    await frames(2);
    if (this.disposed) return;
    this._makeEnv();
    step('statue env');
    const { geometry, foot, mask, front } = await loading;
    if (this.disposed) return;
    step('statue model');
    this.maskAt = mask;
    this.front = front;

    const m = (this.material = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.6 }));
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      const decl = Object.entries(this.uniforms)
        .map(([k, u]) => `uniform ${u.value.isColor ? 'vec3' : u.value.isMatrix3 ? 'mat3' : 'float'} ${k};`).join('\n');
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 _patina;\nvarying vec3 vTkPat;\nvarying vec3 vTkPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTkPat = _patina;\nvTkPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vTkPat;\nvarying vec3 vTkPos;\n${decl}\n${NOISE}\nfloat tkShadeMask = 0.0; // how deep the recess is, for the plum in the shade`)
        .replace('#include <normal_fragment_maps>', FINISH_GLSL)
        .replace('#include <aomap_fragment>', AO_GLSL);
    };

    // the shared geometry (the patina's noise is in its units: the figure is HEIGHT high)
    this.mesh = new THREE.Mesh(geometry, m);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.turn.add(this.mesh);
    // the floor's light and shadow are centred under the rock
    this._buildFloor(foot);

    this._resize();
    this.ro.observe(this.container);
    this.io.observe(this.container);
    this._listen();
    this._applyStage();
    // compiled off the main thread where the browser can (KHR_parallel_shader_compile); the loop
    // waits for it, so no frame forces the compile on the page. The shadow pass's depth material
    // is not in the scene: a stand-in with the same material on the same kind of mesh, compiled
    // against the scene's lights into a render target (linear colour, no tone mapping) builds
    // the program the pass will ask for, which the first draw used to compile on the spot
    const shadowed = new THREE.Scene();
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.side = m.shadowSide ?? (m.side === THREE.FrontSide ? THREE.BackSide : m.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
    const standIn = new THREE.Mesh(geometry, depth);
    standIn.castShadow = true;
    shadowed.add(standIn);
    const target = new THREE.WebGLRenderTarget(1, 1);
    const onStage = this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
    this.renderer.setRenderTarget(target);
    const offStage = this.renderer.compileAsync(shadowed, this.camera, this.scene).catch(() => {});
    this.renderer.setRenderTarget(null);
    await Promise.all([onStage, offStage]);
    target.dispose();
    standIn.removeFromParent();
    if (this.disposed) { depth.dispose(); return; }
    step('statue compiled');
    this.ready = true;
    const debug = /[?&]debug\b/.test(location.search) && { programs: this.renderer.info.programs?.length ?? 0, t: performance.now() };
    this._draw(true);
    // the stand-in's material is let go only after the first draw: disposing a material releases its
    // program when nothing else holds it yet, and the draw's shadow pass would compile it again on the spot
    depth.dispose();
    step('statue drawn');
    if (debug) window.__dcThinker ??= this;
    if (debug) console.info(`thinker first draw: ${Math.round(performance.now() - debug.t)} ms; programs ${debug.programs} compiled before it, ${this.renderer.info.programs?.length ?? 0} after`);
    requestAnimationFrame(() => { this.renderer.domElement.style.opacity = '1'; });
    this._sync();
  }

  /** The stage for the page's theme; `instant` (inside a theme switch) sets it at once. */
  setTheme(theme, { instant = false } = {}) {
    if (this.disposed) return;
    this.theme = theme in STAGE ? theme : 'dark';
    const to = this.theme === 'light' ? 1 : 0;
    gsap.killTweensOf(this.day);
    if (instant || this.reduced || !this.ready) {
      this.day.value = to;
      this._applyStage();
      if (instant && this.ready && !this.lost) this._draw(true);
      return;
    }
    gsap.to(this.day, { value: to, duration: 0.7, ease: 'sine.inOut', onUpdate: () => { this._applyStage(); this._wake(); } });
  }

  /** The lights, the room and the floor for the stage's level between the themes. */
  _applyStage() {
    const d = this.day.value;
    const lerp = (k) => STAGE.dark[k] + (STAGE.light[k] - STAGE.dark[k]) * d;
    const { key, rim, hemi, glow, keyPower, rimPower } = this.lights;
    glow.color.lerpColors(this.glowGold.dark, this.glowGold.light, d);
    key.intensity = keyPower * lerp('key');
    rim.intensity = rimPower * lerp('rim');
    hemi.intensity = lerp('hemi');
    this.scene.environmentIntensity = lerp('env');
    this.renderer.toneMappingExposure = lerp('exposure');
    if (this.floor) {
      this.floor.pool.material.opacity = lerp('pool');
      this.floor.shadow.material.opacity = lerp('shadow');
    }
  }

  /** ?debug: change the finish (a FINISH key: a number, a token name or [a, b, t]; `dark` or
   * `light`: the stage; `glow`: the cursor's lamp, for every statue on the page). */
  setFinish(o = {}) {
    for (const [k, v] of Object.entries(o)) {
      if (k in STAGE.dark || k in STAGE.light) continue;
      const u = this.uniforms[uniformName(k)];
      if (!u) continue;
      this.finish[k] = v;
      if (COLORS.includes(k)) u.value.copy(tokenColor(v)); else u.value = v;
    }
    for (const t of ['dark', 'light']) if (o[t]) Object.assign(STAGE[t], o[t]);
    if (o.glow) Object.assign(GLOW, o.glow);
    this._applyStage();
    this._draw(true);
    return { ...this.finish, stage: STAGE, glow: GLOW };
  }

  // ---- the hand ----

  _listen() {
    window.addEventListener('pointermove', this._onPointer, { passive: true });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    document.documentElement.addEventListener('pointerleave', this._onWindowLeave);
    this.container.addEventListener('pointerdown', this._onDown);
    window.addEventListener('scroll', this._onScroll, { passive: true });
  }

  _onPointer(e) {
    // the cursor's lamp goes where the pointer is (a finger's only while it is down)
    if (e.pointerType !== 'touch' || this.press) this._glowTo(e.clientX, e.clientY);
    // the lean: toward the pointer, wherever it is on the page (a mouse or pen, not a finger)
    // (with reduced motion it stands still, so the pointer changes nothing to draw)
    if (!this.reduced && (e.pointerType === 'mouse' || e.pointerType === 'pen')) {
      const nx = (e.clientX / innerWidth) * 2 - 1;
      const ny = (e.clientY / innerHeight) * 2 - 1;
      this.yaw.follow = THREE.MathUtils.clamp(nx, -1, 1) * FOLLOW;
      this.elev.to = THREE.MathUtils.clamp(ny, -1, 1) * 2.5 * DEG;
      this._wake();
    }
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x;
    if (!p.mode) {
      if (Math.hypot(dx, e.clientY - p.y) < 6) return;
      // sideways turns it; up and down is the page's scroll
      p.mode = Math.abs(dx) > Math.abs(e.clientY - p.y) ? 'turn' : 'scroll';
      if (p.mode === 'turn') {
        // the star cursor's grabbing form for the whole drag, even off the statue (layout.css)
        document.documentElement.classList.add('is-grabbing');
        this.onTurn(true);
      }
    }
    if (p.mode !== 'turn') return;
    const raw = p.from + (dx / Math.max(1, this.container.clientWidth)) * 70 * DEG;
    // a firm stop at the reach, approached softly
    this.yaw.drag = Math.sign(raw) * REACH * Math.tanh(Math.abs(raw) / REACH);
    this._wake();
  }

  /** The pointer is here (in the page's viewport): the cursor's lamp follows it. */
  _glowTo(x, y) {
    const p = this.pointer;
    p.x = x;
    p.y = y;
    p.to = 1;
    if (!p.seen) { p.seen = true; this._placeGlow(true); }
    this._wake();
  }

  /**
   * Where the cursor's lamp should be: on the line from the camera through the pointer (as the
   * pointer sits over this canvas, or beyond its edges), held GLOW.ahead in front of the surface
   * that line meets (the figure's front, frontOf), so it lights a small pool of him right under
   * the pointer and the metal there reflects it. Beside him it is held by his nearest edge, and
   * far from him its light does not reach him at all. `snap` puts it there at once.
   */
  _placeGlow(snap = false) {
    if (!this.ready) return;
    const r = this.container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cam = this.camera;
    const dir = this._ndc ??= new THREE.Vector3();
    dir.set(((this.pointer.x - r.left) / r.width) * 2 - 1, -(((this.pointer.y - r.top) / r.height) * 2 - 1), 0.5)
      .unproject(cam).sub(cam.position).normalize();
    // into his own frame at rest (the turn undone), where his front is mapped
    const yaw = this.turn.rotation.y - REST;
    const o = (this._o ??= new THREE.Vector3()).copy(cam.position).applyAxisAngle(Y_AXIS, -yaw);
    const d = (this._d ??= new THREE.Vector3()).copy(dir).applyAxisAngle(Y_AXIS, -yaw);
    if (d.z > -1e-3) return; // (the camera always looks toward him)
    // along the line of sight to his surface: the plane through the depth found so far, three times
    let zf = 0;
    for (let k = 0; k < 3; k++) {
      const t = (zf - o.z) / d.z;
      zf = this._frontAt(o.x + d.x * t, o.y + d.y * t);
    }
    // then back toward the camera, along the same line (so the pool is centred on the pointer)
    const t = (zf - o.z) / d.z - GLOW.ahead;
    this.glowTo.copy(o).addScaledVector(d, t).applyAxisAngle(Y_AXIS, yaw);
    if (snap) this.glowAt.copy(this.glowTo);
  }

  /** How near the camera his front comes at (x, y) in his frame at rest (bilinear in frontOf's grid). */
  _frontAt(x, y) {
    const f = this.front;
    if (!f) return 0;
    const u = Math.min(Math.max((x - f.x0) / f.cell - 0.5, 0), f.nx - 1.001);
    const v = Math.min(Math.max((y - f.y0) / f.cell - 0.5, 0), f.ny - 1.001);
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * f.nx + i;
    const z = f.z;
    return (z[k] * (1 - a) + z[k + 1] * a) * (1 - b) + (z[k + f.nx] * (1 - a) + z[k + f.nx + 1] * a) * b;
  }

  /**
   * The box has moved on the page other than by a scroll (a scene on the page carrying it): the
   * lamp keeps to the pointer, and the mask's point moves with him.
   */
  boxMoved() {
    // (a finger's lamp has gone out once it lifted: then the frame would be the same, and the box moved
    // only by a transform, so the picture is unchanged; it used to be drawn again in every frame of the
    // crossing all the same)
    if (this.visible && this._lit()) this._wake();
  }

  /** The cursor's lamp is lit, or lighting (out, it is not placed: nothing of it would be seen). */
  _lit() {
    return this.pointer.seen && (this.pointer.on > 0.002 || this.pointer.to > 0);
  }

  /** Where the mask's centre is on the page now (client pixels), or null before he is drawn. */
  maskPoint() {
    if (!this.ready || !this.maskAt) return null;
    this._apply();
    const p = this.maskAt.clone().applyMatrix4(this.turn.matrixWorld).project(this.camera);
    const r = this.container.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  _onScroll() {
    // the box moves under a still pointer: the lamp keeps to the pointer (while it is lit; a
    // finger's lamp has gone out once it lifted, and then the frame would be the same)
    if (this.visible && this._lit()) this._wake();
  }

  _onDown(e) {
    if (e.pointerType === 'touch') this._glowTo(e.clientX, e.clientY);
    if (this.reduced || !this.turnable || !this.ready || (e.pointerType === 'mouse' && e.button !== 0)) return;
    gsap.killTweensOf(this.yaw, 'drag');
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, from: this.yaw.drag, mode: null };
  }

  _onUp(e) {
    // a finger lifted: its lamp fades
    if (e?.pointerType === 'touch') { this.pointer.to = 0; this._wake(); }
    const p = this.press;
    if (!p || (e && e.pointerId !== p.id)) return;
    this.press = null;
    if (p.mode !== 'turn') return;
    document.documentElement.classList.remove('is-grabbing');
    this.onTurn(false);
    // let go: it settles back to its view, like a curtain, without a bounce (the design system's
    // motion: things rise and settle)
    gsap.to(this.yaw, { drag: 0, duration: 1.1, ease: 'power3.out', onUpdate: () => this._wake() });
  }

  _onWindowLeave(e) {
    if (e.pointerType === 'touch') return;
    // the pointer has left the page: its lamp fades
    this.pointer.to = 0;
    this._wake();
    if (this.reduced) return;
    this.yaw.follow = 0;
    this.elev.to = 0;
    this._wake();
  }

  // ---- a lost WebGL context ----

  _onLost(e) {
    e.preventDefault(); // so the browser may restore it
    this.lost = true;
    this.container.classList.add('is-lost'); // the still picture comes back (publication.css)
    this._sync();
  }

  _onRestored() {
    // three restores its own programs and buffers; the room's filtered target must be made again,
    // and the shadow drawn again
    if (this.disposed) return;
    this._makeEnv();
    this.lost = false;
    this._draw(true);
    this.container.classList.remove('is-lost');
    this._sync();
  }

  // ---- frames ----

  _resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.canvasSize.value);
    const cam = this.camera;
    cam.aspect = w / h;
    // the whole figure in view at any turn, with a little room above, and more below for the floor
    // (fit > 1 brings him closer)
    const fitH = (HEIGHT * 1.2) / this.fit;
    const fitW = (HEIGHT * 0.9) / this.fit;
    const tan = Math.tan((cam.fov * DEG) / 2);
    this.distance = Math.max(fitH / 2 / tan, fitW / 2 / (tan * cam.aspect));
    cam.updateProjectionMatrix();
    this._wake();
  }

  _apply() {
    // the turn, held within the reach whatever put it there (pointer, drag, the settle)
    const yaw = this.reduced ? 0 : THREE.MathUtils.clamp(this.yaw.now, -REACH, REACH);
    this.turn.rotation.y = REST + yaw;
    const e = 6 * DEG + (this.reduced ? 0 : this.elev.now);
    const cy = HEIGHT * 0.46;
    const cam = this.camera;
    cam.position.set(0, cy + Math.sin(e) * this.distance, Math.cos(e) * this.distance);
    cam.lookAt(0, cy, 0);
    cam.updateMatrixWorld();
    this.turn.updateMatrixWorld();
    // the relief's slopes are in the model's space: this turns them into the view's
    const mv = (this._mv ??= new THREE.Matrix4()).multiplyMatrices(cam.matrixWorldInverse, this.mesh.matrixWorld);
    this.uniforms.uTkView.value.getNormalMatrix(mv);
    // the cursor's lamp, where the pointer is now (eased after it in _tick; at once when still)
    const glow = this.lights.glow;
    if (this._lit()) {
      this._placeGlow(this.reduced);
      glow.position.copy(this.glowAt);
    }
    glow.intensity = (GLOW.intensity + (GLOW.dayIntensity - GLOW.intensity) * this.day.value) * this.pointer.on;
    glow.distance = GLOW.distance;
    // the shadow is drawn again only when the figure has turned
    if (Math.abs(this.turn.rotation.y - this.shadowYaw) > 1e-4 || this.shadowYaw !== this.shadowYaw) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowYaw = this.turn.rotation.y;
    }
  }

  /** Draw a frame now (`force`: the shadow too). */
  _draw(force = false) {
    if (!this.ready || this.lost || this.disposed) return;
    if (force) this.shadowYaw = NaN;
    this._apply();
    this.renderer.render(this.scene, this.camera);
    this.lastFrame = performance.now();
    this.dirty = false;
  }

  _sync() {
    const go = this.visible && this.ready && !this.lost && !this.disposed && !this.asleep;
    if (go && !this.running) { this.running = true; this.last = performance.now(); this.renderer.setAnimationLoop(this._tick); }
    else if (!go && this.running) { this.running = false; stopLoop(this.renderer, () => !this.running); }
  }

  _wake() {
    this.dirty = true;
    if (this.asleep) { this.asleep = false; this._sync(); }
  }

  /**
   * A tick with nothing to draw: once nothing is still easing toward its target either (the lean, the
   * lamp, its glow) and no hand is on it, for half a second, the loop stops asking for frames until
   * something wakes it (_wake: the pointer, a scroll, the theme, a turn's drag, a resize). It was only
   * waiting: what it would draw next is what is on the screen.
   */
  _rest(want) {
    const p = this.pointer;
    const settled = !this.press && want === this.yaw.now && this.elev.to === this.elev.now
      && Math.abs(p.to - p.on) < 1e-5 && (!p.seen || this.glowAt.distanceToSquared(this.glowTo) <= 1e-6);
    this.still = settled ? (this.still || 0) + 1 : 0;
    if (this.still > 30) { this.still = 0; this.asleep = true; this._sync(); }
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - (this.last ?? now)) / 1000);
    this.last = now;
    // eased toward where the pointer and the hand put it
    const want = THREE.MathUtils.clamp(this.yaw.follow + this.yaw.drag, -REACH * 1.2, REACH * 1.2);
    const turning = this.press?.mode === 'turn';
    const y0 = this.yaw.now, e0 = this.elev.now;
    this.yaw.now += (want - this.yaw.now) * (turning ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 3.5));
    this.elev.now += (this.elev.to - this.elev.now) * (1 - Math.exp(-dt * 3));
    // the cursor's lamp eases after the pointer, and up or down as it arrives or leaves
    const p = this.pointer;
    const o0 = p.on;
    p.on += (p.to - p.on) * (this.reduced ? 1 : 1 - Math.exp(-dt * 4));
    if (Math.abs(p.on - o0) > 1e-4) this.dirty = true;
    if (p.seen && this.dirty) {
      // (the target is placed in _apply, from the box's place now; ease toward the last one)
      const before = this._gb ??= new THREE.Vector3();
      before.copy(this.glowAt);
      this.glowAt.lerp(this.glowTo, this.reduced ? 1 : 1 - Math.exp(-dt * GLOW.ease));
      if (before.distanceToSquared(this.glowAt) > 1e-8) this.dirty = true;
    } else if (p.seen && this.glowAt.distanceToSquared(this.glowTo) > 1e-6) {
      this.glowAt.lerp(this.glowTo, 1 - Math.exp(-dt * GLOW.ease));
      this.dirty = true;
    }
    // a step under a hundredth of a degree (a tenth of a pixel on his box) is not worth a frame:
    // the lean lands on its target exactly, in one last frame, instead of creeping toward it for
    // another second of full redraws
    if (!turning && Math.abs(want - this.yaw.now) < 1e-4 && Math.abs(this.elev.to - this.elev.now) < 1e-4) { this.yaw.now = want; this.elev.now = this.elev.to; }
    // nothing moves while it is still: drawn only when something has changed
    if (Math.abs(this.yaw.now - y0) > 1e-5 || Math.abs(this.elev.now - e0) > 1e-5) this.dirty = true;
    if (!this.dirty) { this._rest(want); return; }
    this.still = 0;
    // about 30 frames a second, every frame only while a hand turns it: the page's other
    // animations keep the rest of the GPU
    if (!turning && now - this.lastFrame < IDLE_FRAME - 2) return;
    this._draw();
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    if (this.press?.mode === 'turn') { document.documentElement.classList.remove('is-grabbing'); this.onTurn(false); }
    this.press = null;
    gsap.killTweensOf(this.yaw);
    gsap.killTweensOf(this.day);
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.io.disconnect();
    window.removeEventListener('pointermove', this._onPointer);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    document.documentElement.removeEventListener('pointerleave', this._onWindowLeave);
    this.container.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('scroll', this._onScroll);
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onRestored);
    this.container.classList.remove('is-lost');
    // the geometry is shared: let go of it (freed with its last user); this renderer's copy goes below
    if (this.url) releaseModel(this.url);
    this.material?.dispose();
    if (this.floor) for (const o of Object.values(this.floor)) { o.geometry.dispose(); o.material.dispose(); }
    this.poolTex?.dispose();
    this.envTarget?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // its GPU memory back now (the page may hold several statues)
    this.renderer.domElement.remove();
  }
}
