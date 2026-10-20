// Capability and preference checks, read once at boot.

const query = new URLSearchParams(location.search);

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isMobileLayout = () => matchMedia('(max-width: 767px)').matches;

/** A trial switch is on (?flags=name, kept in this browser; tools/pages/build.mjs sets html.flag-<name>). */
export const flag = (name) => document.documentElement.classList.contains(`flag-${name}`);

/**
 * The device's tiers (README: Tiers), set on <html> by the head script before the first paint
 * (tools/pages/build.mjs): the phone tier on every touch screen; the lite tier on a device short of memory
 * or cores, where fidelity gives way to a steady frame. ?flags=full turns both off, ?flags=lite forces lite.
 */
export const phoneTier = () => document.documentElement.classList.contains('tier-phone');
export const liteTier = () => document.documentElement.classList.contains('tier-lite');

const PIXEL_BUDGET = 2e6; // device pixels a full-screen canvas may have under the phone tier
const LITE_PIXEL_BUDGET = 0.75e6; // and under the lite tier (a 393x851 phone at DPR 2.75 draws at 1.5)

/**
 * The pixel ratio to draw a canvas at: the device's, at most `cap`; under the phone tier, also at most what
 * keeps a canvas of w x h CSS pixels (the screen by default) within the pixel budget (a tablet's large
 * screen at DPR 2 is 5.6 million device pixels; the budget is 2 million); under the lite tier within 0.75
 * million.
 */
export function pixelRatio(cap, w = innerWidth, h = innerHeight) {
  const r = Math.min(devicePixelRatio || 1, cap);
  const budget = liteTier() ? LITE_PIXEL_BUDGET : phoneTier() ? PIXEL_BUDGET : 0;
  return budget ? Math.min(r, Math.max(1, Math.sqrt(budget / Math.max(1, w * h)))) : r;
}

/**
 * Multisampling for a WebGL canvas, in one place: what the scene asks for, the lite tier included. (Turned
 * off under lite, the home statue's outline came out visibly stepped; and on the tile-based GPUs of phones
 * Chrome resolves the samples on the chip, so they cost little memory or bandwidth there: the lite tier's
 * saving is its pixel budget.)
 */
export const antialias = (want = true) => !!want;

/**
 * Under the phone tier, at most 60 frames a second however fast the screen; under the lite tier at most
 * `liteFps` (a scene that loops passes 30: a steady 30 rather than an uneven 40-50 on a weak GPU). The
 * gate returned answers, for each animation frame's time, whether to draw it (on a 120 Hz screen, every
 * other one; on 90 Hz, two in three). Without a tier it always says yes.
 */
export function frameGate(liteFps = 60) {
  let next = 0;
  return (now) => {
    const lite = liteTier();
    if (!lite && !phoneTier()) return true;
    const step = 1000 / (lite ? liteFps : 60);
    if (now < next - 2) return false;
    next = now - next < step ? next + step : now + step;
    return true;
  };
}

/**
 * Probe WebGL once; returns { ok, renderer } where renderer is the unmasked GPU string if exposed.
 * WebGL 2 only: three.js (0.170) draws with nothing less, so a browser offering WebGL 1 alone gets
 * the still pictures at once rather than downloading a scene it cannot draw.
 */
let probed = null;
export function probeWebGL() {
  if (probed) return probed;
  return (probed = probe());
}

function probe() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { ok: false, renderer: '' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, renderer };
  } catch {
    return { ok: false, renderer: '' };
  }
}

/**
 * Low-power heuristic: software rasterisers, data-saver, or very small devices get the static
 * picture instead of the live scene. `?static` forces the picture, `?live` forces WebGL.
 */
export function prefersStatic(rendererString) {
  if (query.has('static')) return true;
  if (query.has('live')) return false;
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rendererString || '');
  const saveData = navigator.connection?.saveData === true;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  return software || saveData || cores <= 2 || memory <= 2;
}

/** Read a design token from :root (e.g. readToken('--gold-500')). */
export function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
