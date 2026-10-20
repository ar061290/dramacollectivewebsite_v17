// The frame governor (README: Tiers). The head script puts a device in the lite tier from what it reads
// of it (memory, cores); some slow devices read as capable (an iPhone reads no memory at all, a phone may
// read 8 GB and still draw slowly). So while the page animates in earnest (the sky following a scroll or
// a finger), the length of its frames is noted, and if, the boot over, the middle of 90 of them is still
// over 30 ms (fewer than about 33 frames a second), the device joins the lite tier: at once for what can
// change live (the sky, the 3D scenes' pixel budgets and frame rates, ScrollTrigger's polling), and for
// the rest of the visit (sessionStorage, read by the head script on the next page). ?flags=full: never.
import { liteTier } from './env.js';

const KEY = 'dc-lite';
const NEED = 90; // frames
const SLOW = 30; // ms, the middle frame's length
const SETTLE = 3000; // ms after the page starts before any frame counts
const frames = [];
const listeners = new Set();
let decided = false;

/** A frame's length (ms) while the page was busy animating. */
export function noteFrame(ms) {
  if (decided || !(ms > 0) || ms > 250 || performance.now() < SETTLE) return;
  frames.push(ms);
  if (frames.length < NEED) return;
  decided = true;
  const sorted = frames.slice().sort((a, b) => a - b);
  if (sorted[Math.floor(sorted.length / 2)] > SLOW) goLite();
}

/** Join the lite tier now (and for the rest of the visit), and tell whoever listens. */
export function goLite() {
  const html = document.documentElement.classList;
  if (liteTier() || html.contains('flag-full')) return;
  html.add('tier-lite');
  try { sessionStorage.setItem(KEY, '1'); } catch { /* storage blocked: this page only */ }
  for (const fn of listeners) { try { fn(); } catch (err) { console.error(err); } }
}

/** Call fn if the device joins the lite tier while this page is open. Returns a function that stops listening. */
export function onLite(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
