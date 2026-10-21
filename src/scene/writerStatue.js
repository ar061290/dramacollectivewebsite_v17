// Meet our writers' statue: a robed figure in the pose of the Statue of Liberty, the comedy and
// tragedy masks for a face, raising a fountain pen like a torch and holding the publication, The
// Drama Collective, against its side (a Meshy model, assets/models/writer-statue.glb, made by
// tools/writers/build-statue.mjs; its measures, the book's cover and the boxes round the book and
// the nib, are in writer-statue.json). The page opens on it (src/writers/opening.js): it stands in
// its box among the stars, and as the page scrolls the camera comes to the book in its hand.
// Another page may stand another model made the same way in the same stone (the `model` option:
// its glb and its json), as Apply to be a writer does with the statue whose pen is different.
// It is cast in bronze in the file; here it is polished marble in the site's colours, a blush white
// veined and clouded with the brand's plum, and the model's own pattern carries through: its normal
// map, and the light and shade of its bronze (the hammered, cast detail, the folds' darkening), taken
// as the stone's own. The plum is a pattern in the statue's space (soft clouds, warped, veins along
// them with a hair of gold in the deepest, and a few dark flecks), so it runs on unbroken across the
// seams of the model's texture. The book stays the publication, deep plum with its edges in gold,
// and on its front the real October cover (the picture the page then lifts off it), laid on in the
// shader from the cover's measured corners, under the fingers that hold it; the nib stays silver.
// It is lit as the publication's statue is (src/scene/thinker.js, whose lights and stages this
// borrows): one warm spotlight from above, a soft rim behind, the house lights in the light theme,
// and the cursor's glow as a small gold lamp held just in front of the stone under the pointer, which
// the polish reflects. It does not spin: it leans a few degrees after the pointer, eased, and stands
// still with reduced motion.
// One canvas the size of the opening; the camera is the page's (src/writers/rig.js), so the book's
// corners can be put on the page exactly where it draws them (onDraw). It draws only while in view,
// only when something has moved (every frame while the view is moving, else at most 30 a second).
// If the browser drops its WebGL context, the still picture comes back until the context returns.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { readToken, antialias } from '../util/env.js';
import { liteTexture, liteTextures } from './lite.js';
import { stopLoop } from './loop.js';
import { rig } from '../writers/rig.js';
import { mark } from '../util/perf.js';

let statueMarked = false; // the steps are marked for the first statue on a page only

// the Draco decoder served with the site (as for the other statues)
const DRACO_PATH = import.meta.env ? new URL('draco/', document.baseURI).href : new URL('../../public/draco/', import.meta.url).href;

/** The writer statue's model and its measures (the `model` option's default). */
export const WRITER_MODEL = {
  glb: new URL('../../assets/models/writer-statue.glb', import.meta.url).href,
  json: new URL('../../assets/models/writer-statue.json', import.meta.url).href,
};
// the cover on its book (the `cover` option's default): the October issue's, as the page's own
const COVER = new URL('../../assets/publication/cover-october-2026.webp', import.meta.url).href;

const DEG = Math.PI / 180;
const HEIGHT = 2; // the model's height, its base on y = 0 (as made)
const FOLLOW = 6 * DEG; // how far the pointer turns it, at the page's edge
const PITCH = 2.5 * DEG; // and how far it raises or lowers the view
const IDLE_FRAME = 1000 / 30; // ms between frames unless the view is moving
// While the view moves, a GPU that cannot keep up (frames over SLOW ms, several in a row) draws at
// LOW of its resolution until the view has been still for a moment; then it is drawn sharp again.
const SLOW = 28;
const LOW = 0.65;

// The stage in each theme, as the publication's statue's (thinker.js), with the key and the house
// lights a little down for white stone: the spotlight's and the rim's strength, the house lights (an
// even light from above, and the room the polish reflects), the exposure, the warm pool on the floor,
// the shadow's depth, and the stone's own glow (a hint of the light marble lets in, so its shade
// stays a warm white and never goes grey)
const STAGE = {
  dark: { key: 0.62, rim: 0.5, hemi: 0.22, env: 0.42, exposure: 1, pool: 0.12, shadow: 0.5, self: 0.08 },
  light: { key: 0.5, rim: 0.42, hemi: 0.9, env: 0.6, exposure: 0.92, pool: 0, shadow: 0.28, self: 0.02 },
};

// The stone. Colours are hex or design tokens. cream0..cream1 the white, a blush white; blush, rose
// and mauve the clouds, from their edges to their hearts; vein0..vein1 the veins, light to deep;
// fleck the few darkest flecks; veinGold the hair of gold in the deepest veins. The book: its cover
// plum (bookDeep..bookCover) and its lettering gold; the nib silver.
const MARBLE = {
  cream0: '--plum-50', cream1: '#f6eef0',
  blush: '--plum-100', rose: '--plum-200', mauve: '--plum-300',
  vein0: '--plum-400', vein1: '--plum-500', fleck: '--plum-500', veinGold: '--gold-600',
  bookDeep: '--plum-800', bookCover: '--plum-700', gold: '--gold-500', silver: '#d9d9de',
  // how far in front of its cover the book's box reaches (the raised lettering inside it, the
  // fingers on it outside)
  bookFront: 0.011,
  // the pattern: its size (per unit of height; the figure is 2 high), how far the clouds are warped,
  // where they begin and where they are whole (on the noise's 0..1), how much of them deepens to mauve
  scale: 1.2, warp: 1.9, cloudLo: 0.38, cloudHi: 0.75, deepLo: 0.55, deepHi: 0.9, cloudAmt: 0.6,
  // veins: their size, how thin their core is and how wide their halo, and how strong each; the finer
  // veins between them (size, thinness, strength); how much gold catches in the deepest
  veinScale: 1.2, veinSharp: 14, haloSharp: 2.5, veinAmt: 1, haloAmt: 0.7,
  fineScale: 3.6, fineSharp: 70, fineAmt: 0.7, goldAmt: 0.55,
  // the slant the veins run along (in the statue's space), and how far drawn out along it (1 not at all)
  veinDir: [0.45, 0.82, 0.35], veinStretch: 0.3,
  // flecks: their size, how few (0..1), how strong
  fleckScale: 70, fleckLo: 0.9, fleckAmt: 0.75,
  // the model's own light and shade, as the stone's: its bronze's luminance against lumRef (the
  // bronze's middle), how strongly it shows (by its logarithm), and its floor and ceiling
  lumRef: 0.06, detail: 0.17, shadeLo: 0.42, shadeHi: 1.04, shadeMid: 0.94,
  // the polish: roughness from the model's map, between roughLo and roughHi; the clear coat
  roughLo: 0.25, roughHi: 0.35, coat: 0.5, coatRough: 0.12,
  // the book: where its lettering turns gold (by luminance) and its finish; the nib's
  goldLo: 0.1, goldHi: 0.22, bookRough: 0.55, goldRough: 0.32, goldMetal: 0.6,
  nibSatLo: 0.45, nibSatHi: 0.7, nibLum: 0.05, nibMetal: 0.9, nibRough: 0.25,
  // the cover on the book: how far behind and in front of the plane through its corners the surface
  // may be and still take it (its face stands about 0.007 in front of that plane, the fingers on it
  // 0.01 and more, the fold of the robe over its foot further still), and its finish while it is lit
  // (a satin print)
  decalBack: 0.008, decalFront: 0.0095, decalRough: 0.5,
};
const COLORS = ['cream0', 'cream1', 'blush', 'rose', 'mauve', 'vein0', 'vein1', 'fleck', 'veinGold', 'bookDeep', 'bookCover', 'gold', 'silver'];
const uniformName = (k) => `uWs${k[0].toUpperCase()}${k.slice(1)}`;

// The cursor's lamp: the glow's gold, held a little in front of the stone under the pointer (in the
// whole statue's view: nearer, and its reach shorter, as the view closes on the book), its strength
// in each theme, and how quickly it eases after the pointer
const GLOW = { intensity: 0.22, dayIntensity: 0.36, ahead: 0.24, distance: 0.95, ease: 10 };

/** A colour from a hex or a design token. */
function tokenColor(spec) {
  if (typeof spec === 'string' && spec.startsWith('--')) return new THREE.Color(readToken(spec) || '#808080');
  return new THREE.Color(spec);
}

const frames = (n) => new Promise((resolve) => { const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step)); step(); });

const NOISE = /* glsl */ `
// 3D simplex noise (after Ashima Arts and Stefan Gustavson, MIT), about -1..1
vec3 wsMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 wsMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 wsPermute(vec4 x) { return wsMod289(((x * 34.0) + 10.0) * x); }
float wsNoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = wsMod289(i);
  vec4 p = wsPermute(wsPermute(wsPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 nr = 1.79284291400159 - 0.85373472095314 * vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= nr.x; p1 *= nr.y; p2 *= nr.z; p3 *= nr.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// four octaves, each turned off the last (so no grain lines up)
const mat3 WS_ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float wsFbm(vec3 x) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * wsNoise(x); x = WS_ROT * x * 2.02 + 1.3; a *= 0.5; }
  return s / 0.9375;
}
// how far inside an oriented box (rows of ax: its axes; hs: its half size), softened by f at its
// faces; its front face (along the third axis) may be brought in to front
float wsBox(vec3 p, vec3 c, mat3 ax, vec3 hs, float front, float f) {
  vec3 q = ax * (p - c);
  vec3 a = abs(q);
  float zLim = q.z > 0.0 ? front : hs.z;
  return (1.0 - smoothstep(hs.x - f, hs.x, a.x)) * (1.0 - smoothstep(hs.y - f, hs.y, a.y)) * (1.0 - smoothstep(zLim - f, zLim, a.z));
}`;

// the stone's colour, after the model's base colour is read and before the light is reckoned
const COLOUR_GLSL = /* glsl */ `#include <map_fragment>
{
  vec3 bronze = diffuseColor.rgb;
  float lum = dot(bronze, vec3(0.2126, 0.7152, 0.0722));
  float hi = max(bronze.r, max(bronze.g, bronze.b)), lo = min(bronze.r, min(bronze.g, bronze.b));
  float sat = (hi - lo) / max(hi, 1e-4);
  // the model's own light and shade: bright where the bronze was bright, darker in its recesses
  float shade = clamp(uWsShadeMid + uWsDetail * log2(max(lum, 1e-4) / uWsLumRef), uWsShadeLo, uWsShadeHi);
  // the pattern, in the statue's own space: clouds warped by a broader noise (both soft, found for
  // each vertex: WARP_GLSL), then the veins along the same warp (thin lines where a noise crosses its
  // middle) and a few small dark flecks, found here for each pixel
  vec3 w = vWsWarp;
  vec3 pw = vWsPos * uWsScale + uWsWarp * w;
  float c = vWsCloud.x;
  float cloud = smoothstep(uWsCloudLo, uWsCloudHi, c) * uWsCloudAmt;
  float deep = smoothstep(uWsDeepLo, uWsDeepHi, c + vWsCloud.y);
  // (the veins run with the clouds' flow, drawn out along one slant, as marble's veins run in long
  // sweeps across the block and not in cells; wider and deeper in the clouds, fainter and thinner out
  // in the white, each in a soft halo of the clouds' colour; the finer veins mostly in the clouds)
  vec3 pv = pw + (uWsVeinStretch - 1.0) * uWsVeinDir * dot(pw, uWsVeinDir);
  float near = smoothstep(uWsCloudLo - 0.15, uWsCloudHi, c);
  float ridge = 1.0 - abs(wsNoise(pv * uWsVeinScale));
  float core = pow(ridge, uWsVeinSharp * mix(1.8, 0.75, near)) * uWsVeinAmt * mix(0.3, 1.0, near);
  float halo = pow(ridge, uWsHaloSharp) * uWsHaloAmt * near;
  // (the fine veins and the flecks only where they can show: each is a noise for each pixel, and the
  // white between the clouds, a good part of the figure, is spared them)
  float fine = 0.0, fleck = 0.0;
  if (c > 0.3) fine = pow(1.0 - abs(wsNoise(pv * uWsFineScale + 7.3)), uWsFineSharp) * uWsFineAmt * smoothstep(0.3, 0.75, c);
  if (deep > 0.0) fleck = smoothstep(uWsFleckLo, uWsFleckLo + 0.04, wsNoise(vWsPos * uWsFleckScale + 3.0 * w) * 0.5 + 0.5) * deep * uWsFleckAmt;
  vec3 stone = mix(uWsCream1, uWsCream0, smoothstep(-0.4, 0.6, w.x));
  stone = mix(stone, uWsBlush, smoothstep(0.0, 0.45, max(cloud, halo)));
  stone = mix(stone, uWsRose, max(smoothstep(0.25, 1.0, cloud), halo * 0.6));
  stone = mix(stone, uWsMauve, deep * cloud * 0.55);
  float vein = max(core, fine);
  stone = mix(stone, mix(uWsVein0, uWsVein1, smoothstep(0.35, 0.95, core) * (0.4 + 0.6 * deep)), vein);
  // (a hair of gold along the hearts of the deepest veins, a pixel or two wide however near: its band
  // is as much of the ridge as falls away within about a pixel of a vein's heart (rw, the ridge's
  // change across one pixel), so it is measured on the screen and not on the stone, and it is kept
  // inside a vein that shows; and the darkest flecks)
  float rw = max(fwidth(ridge), 1e-5);
  float hair = smoothstep(1.0 - 1.0 * rw, 1.0 - 0.3 * rw, ridge) * smoothstep(0.45, 0.9, deep) * near * smoothstep(0.5, 0.9, core);
  stone = mix(stone, uWsVeinGold, uWsGoldAmt * hair);
  stone = mix(stone, uWsFleck, fleck);
  stone *= shade;
  // the book: the model's colours carried to the publication's, plum, and its lettering gold
  wsBook = wsBox(vWsPos, uWsBookC, uWsBookAx, uWsBookHalf, uWsCoverZ + uWsBookFront, 0.005);
  wsGold = smoothstep(uWsGoldLo, uWsGoldHi, lum);
  vec3 book = mix(mix(uWsBookDeep, uWsBookCover, smoothstep(0.02, 0.08, lum)), uWsGold * (0.75 + 0.35 * smoothstep(uWsGoldHi, 0.4, lum)), wsGold);
  // the nib: silver, where it is grey and bright in its box
  wsNib = wsBox(vWsPos, uWsNibC, uWsNibAx, uWsNibHalf, uWsNibHalf.z, 0.004)
    * (1.0 - smoothstep(uWsNibSatLo, uWsNibSatHi, sat)) * smoothstep(uWsNibLum * 0.5, uWsNibLum, lum);
  vec3 silver = uWsSilver * clamp(lum / 0.3, 0.6, 1.1);
  diffuseColor.rgb = mix(mix(stone, book, wsBook), silver, wsNib);
  // the cover on the book's front: each point is carried along the line from the eye of the book's
  // view (straight in front of the cover, where the page's camera ends) onto the cover's plane, and
  // there mapped onto the picture by the plane's projective map from the cover's four corners, so in
  // that view it lies exactly where the page then lays the picture itself. Only the front face takes
  // it (near the plane and facing out): the fingers on it and the book's edges keep their own.
  vec3 xc = vWsPos - uWsCoverC;
  float xn = dot(xc, uWsCoverN);
  float k = uWsEyeD / (uWsEyeD - xn);
  vec3 hq = uWsDecalH * vec3(dot(xc, uWsCoverR) * k, dot(xc, uWsCoverU) * k, 1.0);
  vec2 duv = hq.xy / hq.z;
  vec2 duvDx = dFdx(duv), duvDy = dFdy(duv);
  vec2 aa = (abs(duvDx) + abs(duvDy)) * 0.7 + 1e-5;
  float inside = smoothstep(-aa.x, aa.x, duv.x) * smoothstep(-aa.x, aa.x, 1.0 - duv.x) * smoothstep(-aa.y, aa.y, duv.y) * smoothstep(-aa.y, aa.y, 1.0 - duv.y);
  wsDecal = inside * smoothstep(-uWsDecalBack - 0.003, -uWsDecalBack, xn) * (1.0 - smoothstep(uWsDecalFront, uWsDecalFront + 0.002, xn))
    * smoothstep(0.05, 0.4, dot(normalize(vWsNrm), uWsCoverN)) * uWsDecalOn;
  // (the picture is filtered as it is stored, in sRGB, as the browser filters it when it draws it
  // smaller, and only then decoded to light; it is read only where it shows)
  if (wsDecal > 0.0) {
    wsDecalCol = sRGBTransferEOTF(textureGrad(uWsDecalMap, clamp(duv, 0.0, 1.0), duvDx, duvDy)).rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, wsDecalCol, wsDecal);
  }
}`;

// the soft part of the pattern, for each vertex (the model is dense enough for it to stay smooth):
// the warp and the clouds
const WARP_GLSL = /* glsl */ `#include <begin_vertex>
vWsPos = position;
vWsNrm = objectNormal;
{
  vec3 p = position * uWsScale;
  vWsWarp = vec3(wsFbm(p + vec3(1.7, 9.2, 3.1)), wsFbm(p + vec3(8.3, 2.8, 5.5)), wsFbm(p + vec3(4.1, 6.3, 0.7)));
  vWsCloud = vec2(wsFbm(p + uWsWarp * vWsWarp) * 0.5 + 0.5, 0.1 * wsNoise(p * 3.1));
}`;

// the finish: polished stone from the model's roughness, the book satin, the cover on it a satin
// print, the nib metal
const ROUGH_GLSL = /* glsl */ `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor = mix(uWsRoughLo, uWsRoughHi, smoothstep(0.38, 0.6, texture2D(roughnessMap, vRoughnessMapUv).g));
#endif
roughnessFactor = mix(roughnessFactor, mix(uWsBookRough, uWsGoldRough, wsGold), wsBook);
roughnessFactor = mix(roughnessFactor, uWsDecalRough, wsDecal);
roughnessFactor = mix(roughnessFactor, uWsNibRough, wsNib);`;
const METAL_GLSL = /* glsl */ `float metalnessFactor = mix(uWsGoldMetal * wsGold * wsBook * (1.0 - wsDecal), uWsNibMetal, wsNib);`;
// (the cover is printed flat over the model's own lettering: its relief in the normal map goes)
const NORMAL_GLSL = /* glsl */ `#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, wsDecal));`;
// The cover as the page shows the picture: where the page is about to lay the picture over it, its
// colours are put out as they are in the picture, past the light and the tone curve (the canvas then
// encodes them to sRGB as the browser shows the picture), so the hand-over changes nothing.
const FLAT_GLSL = /* glsl */ `#include <tonemapping_fragment>
gl_FragColor.rgb = mix(gl_FragColor.rgb, wsDecalCol, wsDecal * uWsDecalFlat);`;
// the clear coat: on the stone, less on the book, none on the nib
const COAT_GLSL = /* glsl */ `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= (1.0 - 0.7 * wsBook) * (1.0 - wsNib);
#endif`;
// the light marble lets in: its shade never falls to grey
const SELF_GLSL = /* glsl */ `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uWsSelf * (1.0 - wsNib) * (1.0 - 0.8 * wsBook);`;

/**
 * The statue's front, seen from +z: over a grid across x and y, how far toward the viewer its
 * nearest surface comes; past its outline carried out from the edges, then softened, so the
 * cursor's lamp can be held just in front of whatever is under the pointer and glides where one form
 * stands in front of another (as thinker.js's frontOf).
 */
function frontOf(pos) {
  const CELL = 0.02, PAD = 0.4;
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (pos.getY(i) > y1) y1 = pos.getY(i);
  }
  x0 -= PAD; x1 += PAD; y1 += PAD;
  const y0 = -PAD;
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL);
  const EMPTY = -Infinity;
  let z = new Float32Array(nx * ny).fill(EMPTY);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.floor((pos.getY(i) - y0) / CELL) * nx + Math.floor((pos.getX(i) - x0) / CELL);
    if (pos.getZ(i) > z[k]) z[k] = pos.getZ(i);
  }
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
  for (let k = 0; k < z.length; k++) if (z[k] === EMPTY) z[k] = 0;
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

/** A box's uniforms (into `u`): its centre, its axes (as the rows of a matrix) and its half size. */
function setBox(u, obb) {
  const [a, b, c] = obb.axes;
  u.c.value.set(...obb.centre);
  u.ax.value.set(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  u.half.value.set(...obb.half);
}

/**
 * The plane's projective map taking the unit square (x right, y down: its top-left, top-right,
 * bottom-right and bottom-left corners) onto the quadrilateral q (the same corners), as a matrix on
 * [x, y, 1] (after Heckbert, as opening.js's quadMatrix).
 */
function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
  return new THREE.Matrix3().set(x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1);
}

export class WriterStatue {
  /**
   * @param {HTMLElement} container  the opening's stage; the canvas fills it
   * @param {object} o
   * @param {{glb: string, json: string}} [o.model]  the model and its measures (WRITER_MODEL; another
   *   statue made by tools/writers/build-statue.mjs, such as the one with the other pen, takes the
   *   same stone)
   * @param {object} [o.measures]    the model's json, if the page has it already (else it is fetched)
   * @param {string|null} [o.cover]  the picture on the book's front (the October cover); null for none
   * @param {boolean} o.reduced      reduced motion: it stands still
   * @param {'dark'|'light'} o.theme
   * @param {(corners: number[][]) => void} [o.onDraw]  told, as each frame is drawn, where the book's
   *   cover's corners are in it (CSS px from the canvas's top left: top-left, top-right,
   *   bottom-right, bottom-left), exactly where the picture on it is drawn
   */
  constructor(container, { model = WRITER_MODEL, measures = null, cover = COVER, reduced = false, theme = 'dark', onDraw = () => {} } = {}) {
    this.container = container;
    this.model = model;
    this.measures = measures;
    this.coverUrl = cover;
    this.reduced = reduced;
    this.theme = theme in STAGE ? theme : 'dark';
    this.onDraw = onDraw;
    this.visible = true;
    this.hidden = false; // the page has faded it out: nothing to draw
    this.dirty = true;
    this.moving = false; // the view moved since the last frame: draw at once
    this.ready = false;
    this.lost = false;
    this.view = 0;
    this.slot = null;
    const dpr = Math.min(devicePixelRatio, 1.5);
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: antialias(dpr < 1.25), alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(dpr);
    this.res = { base: dpr, low: false, sharp: false, slow: 0, moved: 0 };
    r.outputColorSpace = THREE.SRGBColorSpace;
    // (the neutral tone curve keeps the pinks pink: ACES would turn them toward salmon)
    r.toneMapping = THREE.NeutralToneMapping;
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false; // drawn again only when the statue leans
    const canvas = r.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity .9s cubic-bezier(.22,.61,.36,1)';
    container.append(canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(20, 1, 0.05, 60);

    // the publication's statue's lights: the spotlight a warm white (the gold token carried most of
    // the way to white: white stone takes any warmth as cream), the rim and the house light soft
    const white = new THREE.Color(1, 1, 1);
    this.warm = tokenColor('--gold-300').lerp(white, 0.6);
    const H = HEIGHT;
    const key = new THREE.SpotLight(this.warm, 0, 0, 0.36, 0.85, 2);
    key.position.set(1.35 * H, 2.9 * H, 1.6 * H);
    key.target.position.set(0, H * 0.45, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 6 * H;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const rim = new THREE.SpotLight(tokenColor('--plum-100').lerp(white, 0.4), 0, 0, 0.5, 1, 2);
    rim.position.set(-1.4 * H, 2.1 * H, -1.8 * H);
    rim.target.position.set(0, H * 0.5, 0);
    const hemi = new THREE.HemisphereLight(tokenColor('--plum-50'), tokenColor('--plum-700'), 0);
    hemi.position.set(0, 4 * H, 0);
    const glow = new THREE.PointLight(tokenColor('--gold-300'), 0, GLOW.distance, 2);
    this.scene.add(key, key.target, rim, rim.target, hemi, glow);
    this.lights = { key, rim, hemi, glow, keyPower: 26 * H * H, rimPower: 9 * H * H };
    this.glowGold = { dark: tokenColor('--gold-300'), light: tokenColor('--gold-600') };
    this.pointer = { x: 0, y: 0, seen: false, on: 0, to: 0 };
    this.glowAt = new THREE.Vector3(0, H * 0.7, 1);
    this.glowTo = new THREE.Vector3(0, H * 0.7, 1);

    this.turn = new THREE.Group(); // the lean, about the upright through the plinth
    this.scene.add(this.turn);

    // the stone's uniforms (colours from the tokens); the two boxes and the cover's place are the
    // model's measures' (_useMeasures), the cover's picture is loaded with the model
    this.uniforms = {};
    for (const [k, v] of Object.entries(MARBLE)) this.uniforms[uniformName(k)] = { value: COLORS.includes(k) ? tokenColor(v) : Array.isArray(v) ? new THREE.Vector3(...v).normalize() : v };
    const v3 = () => ({ value: new THREE.Vector3() });
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blank.needsUpdate = true;
    Object.assign(this.uniforms, {
      uWsBookC: v3(), uWsBookAx: { value: new THREE.Matrix3() }, uWsBookHalf: v3(), uWsCoverZ: { value: 0 },
      uWsNibC: v3(), uWsNibAx: { value: new THREE.Matrix3() }, uWsNibHalf: v3(),
      uWsCoverC: v3(), uWsCoverN: v3(), uWsCoverR: v3(), uWsCoverU: v3(), uWsEyeD: { value: 1 },
      uWsDecalH: { value: new THREE.Matrix3() }, uWsDecalMap: { value: blank }, uWsDecalOn: { value: 0 }, uWsDecalFlat: { value: 0 },
      uWsSelf: { value: 0 },
    });
    this.blank = blank;
    this.decal = { on: 1, flat: 0 };
    this.finish = { ...MARBLE };
    if (measures) this._useMeasures(measures);
    this.canvasSize = { value: new THREE.Vector2(1, 1) };

    this.day = { value: this.theme === 'light' ? 1 : 0 };
    this.yaw = { now: 0, to: 0 };
    this.pitch = { now: 0, to: 0 };
    this.lastFrame = 0;
    this.shadowYaw = NaN;
    this._tick = this._tick.bind(this);
    this._onPointer = this._onPointer.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onLost = this._onLost.bind(this);
    this._onRestored = this._onRestored.bind(this);
    canvas.addEventListener('webglcontextlost', this._onLost);
    canvas.addEventListener('webglcontextrestored', this._onRestored);
    this.ro = new ResizeObserver(() => this._resize());
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this._sync(); });
  }

  /** The model's measures: the book's and the nib's boxes, and the cover's place and frame. */
  _useMeasures(measures) {
    this.measures = measures;
    const U = this.uniforms;
    setBox({ c: U.uWsBookC, ax: U.uWsBookAx, half: U.uWsBookHalf }, measures.book.obb);
    setBox({ c: U.uWsNibC, ax: U.uWsNibAx, half: U.uWsNibHalf }, measures.nib.obb);
    const cover = measures.book.cover;
    // (the cover's depth in the box: its front face is brought in to just before it, so the fingers
    // on the cover stay stone)
    U.uWsCoverZ.value = new THREE.Vector3(...cover.centre).sub(U.uWsBookC.value).dot(new THREE.Vector3(...measures.book.obb.axes[2]));
    // the cover's plane: through its centre, square to its normal; its right and up axes made exactly
    // square to that (right x up = normal)
    const N = U.uWsCoverN.value.set(...cover.normal).normalize();
    const R = U.uWsCoverR.value.set(...cover.right);
    R.addScaledVector(N, -R.dot(N)).normalize();
    U.uWsCoverU.value.crossVectors(N, R);
    U.uWsCoverC.value.set(...cover.centre);
    this._decalFrame();
  }

  /**
   * The picture's place on the cover for this canvas: the eye of the book's view (rig's view 1:
   * straight out from the cover's centre, as far as this canvas's shape puts it), the cover's four
   * corners carried along the lines from that eye onto the cover's plane (in that view each is drawn
   * exactly where the modelled corner is), and the plane's projective map from those corners onto the
   * picture. The page lays its picture on the same corners (coverCorners), so the two agree.
   */
  _decalFrame() {
    if (!this.measures) return;
    const U = this.uniforms;
    const cover = this.measures.book.cover;
    const { w, h } = this.size ?? { w: 1, h: 1 };
    const slot = this.slot ?? { x: w * 0.5, y: 0, w: w * 0.5, h };
    const c1 = rig({ view: 1, w, h, slot, book: cover });
    const d = Math.hypot(c1.pos[0] - c1.target[0], c1.pos[1] - c1.target[1], c1.pos[2] - c1.target[2]);
    U.uWsEyeD.value = d;
    const C = U.uWsCoverC.value, N = U.uWsCoverN.value, R = U.uWsCoverR.value, Up = U.uWsCoverU.value;
    const p = new THREE.Vector3();
    const q = cover.corners.map((corner) => {
      p.set(...corner).sub(C);
      const k = d / (d - p.dot(N));
      return [p.dot(R) * k, p.dot(Up) * k];
    });
    this.corners = q.map(([s, t]) => C.clone().addScaledVector(R, s).addScaledVector(Up, t));
    U.uWsDecalH.value.copy(squareToQuad(q)).invert();
  }

  /**
   * The picture on the book (the page's hold on it): `on` how much of it shows (0 the model's own
   * plum book, under the page's own picture once that is laid over it), `flat` how far it is shown
   * as the page shows the picture (1: exactly its colours, unlit) rather than lit as the stone is.
   */
  setCover({ on = this.decal.on, flat = this.decal.flat } = {}) {
    if (on === this.decal.on && flat === this.decal.flat) return;
    this.decal.on = on;
    this.decal.flat = flat;
    this.uniforms.uWsDecalOn.value = this.coverTex ? on : 0;
    this.uniforms.uWsDecalFlat.value = flat;
    this._wake(true);
  }

  /** The room the polish reflects (three's RoomEnvironment), pre-filtered. */
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

  /** The floor, seen only where the light and the shadow fall on it (as under the publication's statue). */
  _buildFloor() {
    const H = HEIGHT;
    const fade = (m, r0, r1) => {
      m.onBeforeCompile = (s) => {
        s.vertexShader = s.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vWsFloor;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWsFloor = position.xy;');
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vWsFloor;')
          .replace('#include <tonemapping_fragment>', `gl_FragColor.a *= 1.0 - smoothstep(${r0.toFixed(3)}, ${r1.toFixed(3)}, length(vWsFloor));
#include <tonemapping_fragment>`);
      };
      return m;
    };
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.75 * H, 48),
      fade(new THREE.ShadowMaterial({ color: tokenColor('--plum-900'), opacity: 0.5, depthWrite: false }), 0.32 * H, 0.72 * H),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
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
      new THREE.PlaneGeometry(H * 1.3, H * 1.3),
      new THREE.MeshBasicMaterial({ map: this.poolTex, color: this.warm, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.001;
    this.floor = { shadow, pool };
    this.turn.add(shadow, pool);
  }

  /** Fetch the model (its measures too, unless given) and the cover's picture, and stand it. */
  async load(url = this.model.glb) {
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH).setDecoderConfig({ type: 'wasm' });
    draco.preload();
    const loading = new GLTFLoader().setDRACOLoader(draco).loadAsync(url).finally(() => draco.dispose());
    loading.catch(() => {}); // reported below
    const measuring = this.measures ? Promise.resolve(this.measures)
      : fetch(this.model.json).then((r) => { if (!r.ok) throw new Error(`The model's measures did not load (${r.status}).`); return r.json(); });
    measuring.catch(() => {});
    // (in Chromium the cover is decoded as an ImageBitmap, off the page's thread, its rows from the top
    // and its values as they are, as the <img> was uploaded (flipY, the colour space and the alpha left
    // alone): the same pixels; an <img> is decoded on the page's thread when it is first used, and the
    // lite tier's smaller copy of it was made there too. Elsewhere an <img>, as before. As About's ring)
    const bitmaps = typeof createImageBitmap === 'function' && !!navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand));
    const covering = !this.coverUrl ? Promise.resolve(null)
      : bitmaps ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
        .loadAsync(this.coverUrl).then((bitmap) => new THREE.Texture(bitmap))
        : new THREE.TextureLoader().loadAsync(this.coverUrl);
    covering.catch(() => {});
    const step = statueMarked ? () => {} : mark; // dc:statue-env, -model, -compiled, -drawn, for the lab
    statueMarked = true;
    await frames(2);
    if (this.disposed) return;
    this._makeEnv();
    step('statue env');
    if (this.measures !== (await measuring)) this._useMeasures(await measuring);
    const gltf = await loading;
    if (this.disposed) { gltf.scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } }); return; }
    await liteTextures(gltf.scene); // (lite tier: its 2048-pixel maps at 1024, before they are uploaded)
    step('statue model');
    // the cover's picture: mipmapped and sharp at a slant, its sRGB kept as it is (the shader decodes
    // it after filtering); if it fails, the book is the model's own
    try {
      const tex = await covering;
      if (tex) {
        tex.colorSpace = THREE.NoColorSpace;
        tex.flipY = false; // (its rows from the top, as the map in the shader reads them)
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        tex.needsUpdate = true;
        await liteTexture(tex); // (lite tier: at most 1024 a side; it keeps its rows from the top)
        this.coverTex = tex;
        this.uniforms.uWsDecalMap.value = tex;
        this.uniforms.uWsDecalOn.value = this.decal.on;
      }
    } catch (err) {
      console.warn('The cover on the statue\'s book is unavailable.', err);
    }
    if (this.disposed) return;
    gltf.scene.updateMatrixWorld(true);
    let src = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    if (!src) throw new Error('The model has no mesh.');
    const geometry = src.geometry.applyMatrix4(src.matrixWorld);
    this.front = frontOf(geometry.attributes.position);
    const own = src.material;

    // the model's own textures, under a polished stone's finish
    const m = (this.material = new THREE.MeshPhysicalMaterial({
      map: own.map,
      normalMap: own.normalMap,
      normalScale: own.normalScale?.clone() ?? new THREE.Vector2(1, 1),
      roughnessMap: own.roughnessMap,
      metalness: 0,
      roughness: 0.3,
      clearcoat: MARBLE.coat,
      clearcoatRoughness: MARBLE.coatRough,
      side: THREE.FrontSide,
    }));
    this.textures = [own.map, own.normalMap, own.roughnessMap, own.metalnessMap].filter(Boolean);
    own.dispose();
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      const decl = Object.entries(this.uniforms).map(([k, u]) => {
        const v = u.value;
        const type = v.isColor || v.isVector3 ? 'vec3' : v.isMatrix3 ? 'mat3' : v.isTexture ? 'sampler2D' : 'float';
        return `uniform ${type} ${k};`;
      }).join('\n');
      const vary = 'varying vec3 vWsPos;\nvarying vec3 vWsNrm;\nvarying vec3 vWsWarp;\nvarying vec2 vWsCloud;';
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${vary}\nuniform float uWsScale;\nuniform float uWsWarp;\n${NOISE}`)
        .replace('#include <begin_vertex>', WARP_GLSL);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${vary}\n${decl}\n${NOISE}\nfloat wsBook = 0.0, wsGold = 0.0, wsNib = 0.0, wsDecal = 0.0;\nvec3 wsDecalCol = vec3(0.0);`)
        .replace('#include <map_fragment>', COLOUR_GLSL)
        .replace('#include <roughnessmap_fragment>', ROUGH_GLSL)
        .replace('#include <metalnessmap_fragment>', METAL_GLSL)
        .replace('#include <normal_fragment_maps>', NORMAL_GLSL)
        .replace('#include <lights_physical_fragment>', COAT_GLSL)
        .replace('#include <emissivemap_fragment>', SELF_GLSL)
        .replace('#include <tonemapping_fragment>', FLAT_GLSL);
    };

    this.mesh = new THREE.Mesh(geometry, m);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.turn.add(this.mesh);
    this._buildFloor();

    this._resize();
    this.ro.observe(this.container);
    this.io.observe(this.container);
    this._listen();
    this._applyStage();
    // the shadow pass's depth material is not in the scene: a stand-in with the same material on
    // the same kind of mesh, compiled against the scene's lights into a render target, builds the
    // program the pass will ask for, which the first draw used to compile on the spot
    const shadowed = new THREE.Scene();
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.map = m.map ?? null;
    depth.alphaMap = m.alphaMap ?? null;
    depth.alphaTest = m.alphaTest;
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
    this._draw(true);
    // the stand-in's material is let go only after the first draw: disposing a material releases its
    // program when nothing else holds it yet, and the draw's shadow pass would compile it again on the spot
    depth.dispose();
    step('statue drawn');
    requestAnimationFrame(() => { this.renderer.domElement.style.opacity = '1'; });
    this._sync();
  }

  // ---- the page's hold on it ----

  /** Where the statue's box is in the canvas (CSS px, from the canvas's top left). */
  setSlot(slot) {
    this.slot = slot;
    this._wake(true);
  }

  /** The view: 0 the statue in its box .. 1 the book (src/writers/rig.js). */
  setView(v) {
    if (v === this.view) return;
    this.view = v;
    this._wake(true);
  }

  /** The page has faded the canvas out (or back in): nothing is drawn while it is out. */
  setHidden(hidden) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    // faded out, it keeps no drawing buffer at the book's full density (up to 3 device pixels to the CSS
    // pixel, about 14-21 MB on a phone, for the rest of the page): its usual one again; a frame shown at
    // the book again is made sharp again before it is drawn (_adapt, at the head of every frame)
    if (hidden && (this.res.sharp || this.res.low)) this._setRes({ sharp: false, low: false });
    if (!hidden) this._wake(true);
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
    this.uniforms.uWsSelf.value = lerp('self');
    if (this.floor) {
      this.floor.pool.material.opacity = lerp('pool');
      this.floor.shadow.material.opacity = lerp('shadow');
    }
  }

  /** ?debug: change the stone (a MARBLE key: a number, or a colour as hex or token; `dark` or
   * `light`: the stage; `glow`: the cursor's lamp). */
  setFinish(o = {}) {
    for (const [k, v] of Object.entries(o)) {
      const u = this.uniforms[uniformName(k)];
      if (!u) continue;
      this.finish[k] = v;
      if (COLORS.includes(k)) u.value.copy(tokenColor(v)); else if (u.value.isVector3) u.value.set(...v).normalize(); else u.value = v;
    }
    if (this.material && 'coat' in o) this.material.clearcoat = o.coat;
    if (this.material && 'coatRough' in o) this.material.clearcoatRoughness = o.coatRough;
    for (const t of ['dark', 'light']) if (o[t]) Object.assign(STAGE[t], o[t]);
    if (o.glow) Object.assign(GLOW, o.glow);
    this._applyStage();
    this._draw(true);
    return { ...this.finish, stage: STAGE, glow: GLOW };
  }

  // ---- the pointer ----

  _listen() {
    window.addEventListener('pointermove', this._onPointer, { passive: true });
    window.addEventListener('pointerdown', this._onPointer, { passive: true });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    document.documentElement.addEventListener('pointerleave', this._onLeave);
  }

  _onPointer(e) {
    // the cursor's lamp goes where the pointer is (a finger's only while it is down)
    if (e.pointerType !== 'touch' || e.buttons) {
      const p = this.pointer;
      p.x = e.clientX; p.y = e.clientY; p.to = 1;
      if (!p.seen) { p.seen = true; this._placeGlow(true); }
      this._wake();
    }
    // the lean: toward a mouse or a pen, wherever it is on the page (with reduced motion it stands)
    if (!this.reduced && (e.pointerType === 'mouse' || e.pointerType === 'pen')) {
      this.yaw.to = THREE.MathUtils.clamp((e.clientX / innerWidth) * 2 - 1, -1, 1) * FOLLOW;
      this.pitch.to = THREE.MathUtils.clamp((e.clientY / innerHeight) * 2 - 1, -1, 1) * PITCH;
      this._wake();
    }
  }

  _onUp(e) {
    if (e?.pointerType === 'touch') { this.pointer.to = 0; this._wake(); }
  }

  _onLeave(e) {
    if (e.pointerType === 'touch') return;
    this.pointer.to = 0;
    this.yaw.to = 0;
    this.pitch.to = 0;
    this._wake();
  }

  /** The page moved under a still pointer (a scroll): the lamp keeps to the pointer. */
  boxMoved() {
    // the box's place is forgotten, and read again only when the lamp is next placed (a read here,
    // after the opening has written the page's styles, forced a layout every frame of the scroll)
    this.rect = null;
    // a finger's lamp has gone out once it lifted: then the frame would be the same
    if (this._lit()) this._wake();
  }

  /** The cursor's lamp is lit, or lighting (out, it is not placed: nothing of it would be seen). */
  _lit() {
    return this.pointer.seen && (this.pointer.on > 0.002 || this.pointer.to > 0);
  }

  /**
   * Where the cursor's lamp should be: on the line from the camera through the pointer, held in
   * front of the surface that line meets (the statue's front, frontOf), so it lights a small pool of
   * stone right under the pointer, and beside the statue by its nearest edge. `snap`: there at once.
   */
  _placeGlow(snap = false) {
    if (!this.ready || !this.front) return;
    const r = (this.rect ??= this.container.getBoundingClientRect()); // kept until the box moves or resizes
    if (!r.width || !r.height) return;
    const cam = this.camera;
    const dir = (this._ndc ??= new THREE.Vector3());
    dir.set(((this.pointer.x - r.left) / r.width) * 2 - 1, -(((this.pointer.y - r.top) / r.height) * 2 - 1), 0.5)
      .unproject(cam).sub(cam.position).normalize();
    // into the statue's own frame (the lean undone), where its front is mapped
    const yaw = this.turn.rotation.y;
    const Y = (this._Y ??= new THREE.Vector3(0, 1, 0));
    const o = (this._o ??= new THREE.Vector3()).copy(cam.position).applyAxisAngle(Y, -yaw);
    const d = (this._d ??= new THREE.Vector3()).copy(dir).applyAxisAngle(Y, -yaw);
    if (d.z > -1e-3) return;
    let zf = 0;
    for (let k = 0; k < 3; k++) {
      const t = (zf - o.z) / d.z;
      zf = this._frontAt(o.x + d.x * t, o.y + d.y * t);
    }
    const t = (zf - o.z) / d.z - GLOW.ahead * this._near();
    this.glowTo.copy(o).addScaledVector(d, t).applyAxisAngle(Y, yaw);
    if (snap) this.glowAt.copy(this.glowTo);
  }

  _frontAt(x, y) {
    const f = this.front;
    const u = Math.min(Math.max((x - f.x0) / f.cell - 0.5, 0), f.nx - 1.001);
    const v = Math.min(Math.max((y - f.y0) / f.cell - 0.5, 0), f.ny - 1.001);
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * f.nx + i, z = f.z;
    return (z[k] * (1 - a) + z[k + 1] * a) * (1 - b) + (z[k + f.nx] * (1 - a) + z[k + f.nx + 1] * a) * b;
  }

  /** How near the camera is, against the whole statue's view (1 there; less as it closes on the book). */
  _near() {
    return this.d0 ? THREE.MathUtils.clamp(this.camera.position.distanceTo(this.camTarget) / this.d0, 0.15, 1) : 1;
  }

  // ---- a lost WebGL context ----

  _onLost(e) {
    e.preventDefault();
    this.lost = true;
    this.container.classList.add('is-lost');
    this._sync();
  }

  _onRestored() {
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
    this.rect = null;
    if (this.size && this.size.w === w && this.size.h === h) return; // the observer's first call, at the size already set: nothing to redo
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.canvasSize.value);
    this.rect = null;
    this._decalFrame(); // (the book's view, and so the picture's eye, depends on the canvas's shape)
    this._wake(true);
  }

  /** The camera, the lean and the lamp for now. */
  _apply() {
    const { w, h } = this.size ?? { w: 1, h: 1 };
    const slot = this.slot ?? { x: w * 0.5, y: 0, w: w * 0.5, h };
    // the lean fades as the view leaves the whole statue: near the book it holds still
    const lean = this.reduced ? 0 : 1 - THREE.MathUtils.smoothstep(this.view, 0, 0.6);
    this.turn.rotation.y = this.yaw.now * lean;
    const c = rig({ view: this.view, w, h, slot, book: this.measures.book.cover, pitch: this.pitch.now * lean });
    const cam = this.camera;
    cam.fov = c.fov;
    cam.aspect = c.aspect;
    cam.position.set(...c.pos);
    cam.up.set(...c.up);
    (this.camTarget ??= new THREE.Vector3()).set(...c.target);
    cam.lookAt(this.camTarget);
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    // the lens shift: the view's centre where rig puts it (three's projection, off its axis)
    cam.projectionMatrix.elements[8] = -c.sx;
    cam.projectionMatrix.elements[9] = -c.sy;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.updateMatrixWorld();
    this.turn.updateMatrixWorld();
    // (the whole statue's view, against which the lamp is brought nearer as the view closes in)
    const c0 = this.view ? rig({ view: 0, w, h, slot, book: this.measures.book.cover }) : c;
    this.d0 = Math.hypot(c0.pos[0] - c0.target[0], c0.pos[1] - c0.target[1], c0.pos[2] - c0.target[2]);
    // the cursor's lamp
    const glow = this.lights.glow;
    if (this._lit()) {
      this._placeGlow(this.reduced);
      glow.position.copy(this.glowAt);
    }
    const near = this._near();
    glow.intensity = (GLOW.intensity + (GLOW.dayIntensity - GLOW.intensity) * this.day.value) * this.pointer.on * near * near;
    glow.distance = GLOW.distance * near;
    // (the shadow is drawn again when the statue has leaned, while the floor is in view)
    if ((this.view < 0.35 && Math.abs(this.turn.rotation.y - this.shadowYaw) > 1e-4) || this.shadowYaw !== this.shadowYaw) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowYaw = this.turn.rotation.y;
    }
  }

  /** Where the corners of the picture on the book's cover are on the canvas now (CSS px), as last
   * drawn (_decalFrame: in the book's view, exactly the modelled corners). */
  coverCorners() {
    const { w, h } = this.size ?? { w: 1, h: 1 };
    const v = (this._v ??= new THREE.Vector3());
    return this.corners.map((p) => {
      v.copy(p).applyMatrix4(this.turn.matrixWorld).project(this.camera);
      return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
    });
  }

  /** Draw a frame now (`force`: the shadow too). */
  _draw(force = false) {
    if (!this.ready || this.lost || this.disposed) return;
    if (force) this.shadowYaw = NaN;
    this._apply();
    this.renderer.render(this.scene, this.camera);
    this.lastFrame = performance.now();
    this.dirty = false;
    this.moving = false;
    this.onDraw(this.coverCorners());
  }

  _sync() {
    const go = this.visible && !this.hidden && this.ready && !this.lost && !this.disposed && !this.asleep;
    if (go && !this.running) { this.running = true; this.last = performance.now(); this.renderer.setAnimationLoop(this._tick); }
    else if (!go && this.running) { this.running = false; stopLoop(this.renderer, () => !this.running); }
  }

  _wake(moving = false) {
    this.dirty = true;
    if (moving) this.moving = true;
    if (this.asleep) { this.asleep = false; this._sync(); }
  }

  /**
   * A tick with nothing to draw: once nothing is still easing toward its target either (the lean, the
   * lamp, its glow; the resolution back at its own) for half a second, the loop stops asking for frames
   * until something wakes it (_wake: the pointer, a scroll, the theme, the view, a resize). It was only
   * waiting: what it would draw next is what is on the screen.
   */
  _rest() {
    const p = this.pointer;
    const settled = !this.moving && !this.res.low && Math.abs(this.yaw.to - this.yaw.now) < 1e-5 && Math.abs(this.pitch.to - this.pitch.now) < 1e-5
      && Math.abs(p.to - p.on) < 1e-5 && (!p.seen || this.glowAt.distanceToSquared(this.glowTo) <= 1e-7);
    this.still = settled ? (this.still || 0) + 1 : 0;
    if (this.still > 30) { this.still = 0; this.asleep = true; this._sync(); }
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - (this.last ?? now)) / 1000);
    this.last = now;
    const y0 = this.yaw.now, p0 = this.pitch.now;
    this.yaw.now += (this.yaw.to - this.yaw.now) * (1 - Math.exp(-dt * 3.5));
    this.pitch.now += (this.pitch.to - this.pitch.now) * (1 - Math.exp(-dt * 3));
    const p = this.pointer;
    const o0 = p.on;
    p.on += (p.to - p.on) * (this.reduced ? 1 : 1 - Math.exp(-dt * 4));
    if (Math.abs(p.on - o0) > 1e-4) this.dirty = true;
    if (p.seen && (this.dirty || this.glowAt.distanceToSquared(this.glowTo) > 1e-7)) {
      const before = (this._gb ??= new THREE.Vector3()).copy(this.glowAt);
      this.glowAt.lerp(this.glowTo, this.reduced ? 1 : 1 - Math.exp(-dt * GLOW.ease));
      if (before.distanceToSquared(this.glowAt) > 1e-8) this.dirty = true;
    }
    if (Math.abs(this.yaw.now - y0) > 1e-5 || Math.abs(this.pitch.now - p0) > 1e-5) this.dirty = true;
    this._adapt(now);
    if (!this.dirty) { this._rest(); return; }
    this.still = 0;
    // every frame while the view moves (the page lays the cover on it as it is drawn); else about
    // 30 a second, so the page's other animations keep the rest of the GPU
    if (!this.moving && now - this.lastFrame < IDLE_FRAME - 2) return;
    this._draw();
  }

  /** The resolution for how the GPU is keeping up (SLOW, LOW). */
  _adapt(now) {
    const res = this.res;
    // (at the book the view holds still while the page lays the picture over it: it is drawn sharp
    // there at once, at the screen's own density (up to 3 device pixels to the CSS pixel, past the
    // usual cap of 1.5), as sharp as the picture; only a few frames are drawn there, the view being
    // still, and the cap comes back as the view leaves it. "At the book" is within a ten-thousandth
    // of it, where the camera's eased arrival no longer moves it by a pixel, so the change is made
    // before the picture begins to fade in, not during it)
    if (this.view > 0.9999) {
      res.slow = 0;
      if (res.low || !res.sharp) this._setRes({ low: false, sharp: true });
      return;
    }
    if (res.sharp) this._setRes({ sharp: false });
    if (this.moving) {
      const gap = now - this.lastFrame;
      res.slow = gap > SLOW && gap < 250 ? res.slow + 1 : Math.max(0, res.slow - 1);
      res.moved = now;
      if (!res.low && res.slow >= 4) this._setRes({ low: true });
    } else if (res.low && now - res.moved > 350) {
      this._setRes({ low: false });
    }
  }

  _setRes({ low = this.res.low, sharp = this.res.sharp }) {
    const res = this.res;
    res.low = low;
    res.sharp = sharp;
    res.slow = 0;
    const ratio = sharp ? Math.max(res.base, Math.min(devicePixelRatio, 3)) : low ? res.base * LOW : res.base;
    if (ratio !== this.renderer.getPixelRatio()) {
      this.renderer.setPixelRatio(ratio);
      this._resize();
    }
  }

  /** ?debug and the stills: the canvas as an image now (drawn first, so it is current). */
  snapshot(type = 'image/png') {
    this._draw(true);
    return this.renderer.domElement.toDataURL(type);
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    gsap.killTweensOf(this.day);
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.io.disconnect();
    window.removeEventListener('pointermove', this._onPointer);
    window.removeEventListener('pointerdown', this._onPointer);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    document.documentElement.removeEventListener('pointerleave', this._onLeave);
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onRestored);
    this.container.classList.remove('is-lost');
    this.mesh?.geometry.dispose();
    this.material?.dispose();
    this.textures?.forEach((t) => t.dispose());
    if (this.floor) for (const o of Object.values(this.floor)) { o.geometry.dispose(); o.material.dispose(); }
    this.poolTex?.dispose();
    this.coverTex?.dispose();
    this.blank.dispose();
    this.envTarget?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
