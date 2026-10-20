// Capability and preference checks, read once at boot.

const query = new URLSearchParams(location.search);

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isMobileLayout = () => matchMedia('(max-width: 767px)').matches;

/** A trial switch is on (?flags=name, kept in this browser; tools/pages/build.mjs sets html.flag-<name>). */
export const flag = (name) => document.documentElement.classList.contains(`flag-${name}`);

let tier;
/** The phone and tablet tier (README): the trial switch phone-tier, on a touch screen. Read once. */
export const phoneTier = () => (tier ??= flag('phone-tier') && matchMedia('(hover: none) and (pointer: coarse)').matches);

const PIXEL_BUDGET = 2e6; // device pixels a full-screen canvas may have under the phone tier

/**
 * The pixel ratio to draw a canvas at: the device's, at most `cap`; under the phone tier, also at most what
 * keeps a canvas of w x h CSS pixels (the screen by default) within the pixel budget (a tablet's large
 * screen at DPR 2 is 5.6 million device pixels; the budget is 2 million).
 */
export function pixelRatio(cap, w = innerWidth, h = innerHeight) {
  const r = Math.min(devicePixelRatio || 1, cap);
  return phoneTier() ? Math.min(r, Math.max(1, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h)))) : r;
}

/**
 * Under the phone tier, at most 60 frames a second however fast the screen: the gate returned answers, for
 * each animation frame's time, whether to draw it (on a 120 Hz screen, every other one; on 90 Hz, two in
 * three). Without the tier it always says yes.
 */
export function frameGate() {
  let next = 0;
  return (now) => {
    if (!phoneTier()) return true;
    if (now < next - 2) return false;
    next = now - next < 1000 / 60 ? next + 1000 / 60 : now + 1000 / 60;
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
