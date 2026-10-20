// The stage planner's entry (stage-planner.html, opened from The production). Before anything heavy
// loads, the visitor reads what the planner asks of their computer (the conditions, #gate) and
// confirms; only then is the planner itself fetched (app.js, with three.js) and the hall built.
// Nothing on the visitor's computer is tested: the planner takes their word for it. The confirmation
// lasts the visit (sessionStorage), so a reload goes straight to the hall.
// The page arrives behind the site's velvet curtain, which parts on the conditions (or, once they are
// confirmed, on the drawn hall), and "The production" closes it again on the way out
// (src/site/transition.js). Its type is the site's own (src/styles/fonts.css), loaded before the
// hall's signs and the built-in pictures are painted.
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase.js';
import { setupTransitions } from '../site/transition.js';
import { reducedMotion } from '../util/env.js';
import { startQuality } from './quality.js';

gsap.registerPlugin(CustomEase);
CustomEase.create('curtain', '.22,.61,.36,1'); // --ease-curtain from the design system

// set here on Confirm; the inline script in stage-planner.html reads it before paint (.planner-ok)
const OK_KEY = 'dc-planner-ok';

window.dcBooted = true; // for the failsafe in stage-planner.html's head
const root = document.documentElement;
const reduced = reducedMotion();
const veiled = root.classList.contains('is-veiled'); // read before setupTransitions clears it
const transitions = setupTransitions({ reduced });

const app = document.getElementById('app');
const loading = document.getElementById('loading');
const gate = document.getElementById('gate');
const quality = startQuality();

// the curtain parts once, whichever comes first: the conditions or the hall
let parted = null;
const part = () => (parted ??= transitions.open());

// Messages go to the loading screen, or to the conditions' own line while those are on screen.
let say = (msg) => {
  loading.hidden = false;
  loading.textContent = msg;
};

// the site's type first (the hall's signs and the built-in pictures are painted with it), but never
// wait on it for long
const fontsIn = Promise.race([
  Promise.all(['700 64px Lato', '900 64px Lato', '400 16px "Open Sans"', '600 16px "Open Sans"'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {});

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

// Fetch the planner and build the hall. Resolves with its panels (ui.js) once its first frame is
// drawn, or null if it could not open.
async function openHall() {
  if (!hasWebGL()) {
    say('This browser cannot show 3D graphics (WebGL 2 is off or unsupported).');
    return null;
  }
  await fontsIn;
  try {
    const { startPlanner } = await import('./app.js');
    return await new Promise((onReady) => startPlanner({ quality, onReady }));
  } catch (e) {
    console.error(e);
    say('Something went wrong while setting up the hall. Reload the page to try again.');
    return null;
  }
}

function showConditions() {
  const card = gate.querySelector('[data-gate-card]');
  const wait = gate.querySelector('[data-gate-wait]');
  const go = gate.querySelector('[data-gate-go]');
  const title = gate.querySelector('#gate-title');

  // the empty planner behind stays out of reach (and out of screen readers) until the hall is up
  app.inert = true;
  loading.hidden = true;

  // the level the hall will open in: fast, unless the address or an earlier pick this visit says otherwise
  const start = gate.querySelector(`[data-quality="${quality}"]`);
  const tag = gate.querySelector('[data-gate-start]');
  if (start && tag) {
    gate.querySelectorAll('[data-quality]').forEach((li) => li.classList.toggle('is-start', li === start));
    start.append(tag);
  }

  go.addEventListener('click', async () => {
    try { sessionStorage.setItem(OK_KEY, '1'); } catch { /* storage unavailable: asked again on reload */ }
    // the conditions step aside for one loading line; the bar above (and its way back) stays
    say = (msg) => { wait.textContent = msg; };
    const lift = reduced ? null : gsap.to(card, { autoAlpha: 0, y: -12, duration: 0.35, ease: 'power2.in' });
    if (lift) await lift.then();
    card.hidden = true;
    wait.hidden = false;
    say('Setting up the hall…');
    wait.focus({ preventScroll: true });
    // one painted frame with the loading line before the hall's setup holds the page
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const ui = await openHall();
    if (!ui) return; // the message stays, with the way back in the bar

    app.inert = false;
    root.classList.add('planner-ok');
    // The focused loading line leaves with the sheet, which would drop focus to the page itself:
    // focus goes into the hall first (its pressed mode button, the first of the hall's own controls
    // in the bar), the fading sheet goes out of reach, and the hall says it is ready, for anyone who
    // cannot see it open.
    gate.inert = true;
    app.querySelector('#topbar [data-mode][aria-pressed="true"]')?.focus({ preventScroll: true });
    ui.toast('The hall is ready');
    const done = () => gate.remove();
    if (reduced) done();
    else gsap.to(gate, { autoAlpha: 0, duration: 0.5, ease: 'curtain', onComplete: done });
  }, { once: true });

  // arriving through the curtain, the conditions rise into place as it parts; arriving directly they
  // are already painted, so they stay put
  if (veiled && !reduced) {
    const rows = [...gate.querySelectorAll('.gate-intro > *, .gate-item, .gate-modes, .gate-actions')];
    gsap.from(rows, { autoAlpha: 0, y: 16, duration: 0.7, ease: 'curtain', stagger: 0.04, delay: 0.15, clearProps: 'opacity,visibility,transform' });
  }
  // Raung (the title) in before the curtain parts, but never wait on it for long
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 450))]).then(() => {
    part();
    title.focus({ preventScroll: true });
  });
}

if (gate && !root.classList.contains('planner-ok')) showConditions();
else {
  gate?.remove();
  openHall().then((ok) => {
    if (ok) loading.hidden = true;
    part();
  });
}
