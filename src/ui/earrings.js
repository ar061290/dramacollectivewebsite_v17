// The earrings that hang from the theme switch (docs/earrings/SPEC.md): the switch is clicked, and
// the earring for the theme just chosen (the sun for the light, the moon for the dark) comes down
// out of the button and dangles from it (the scene and its physics are src/scene/earrings.js). A
// visitor can take hold of it and pull it about; let go, it swings back. It goes back up into the
// button after 6 seconds untouched, when the theme is switched again (the other comes down as it
// goes), and at once when the button leaves the screen (the bar sliding away, or the publication's
// bar going back up).
//
// The model is fetched once the page is idle after its curtain has opened, and only where WebGL
// runs well (src/util/env.js); a switch clicked before then changes the theme at once, and the
// earring comes down when it is ready if that is soon (1.5 s), or not at all. One small canvas
// under the button, drawn only while an earring is out; over the earring, a transparent zone takes
// the pointer (and keeps a finger on the earring from scrolling the page) and lets nothing through
// to the page. With reduced motion there is no drop and no swing: the earring fades in hanging
// still, stays a moment and fades out, and cannot be taken hold of. Without WebGL there is none.
import { probeWebGL, prefersStatic } from '../util/env.js';

const MODEL = new URL('../../assets/models/earrings.glb', import.meta.url).href;
const IDLE = 6000; // ms untouched before it goes back up
const LATE = 1500; // ms: a switch clicked before the model is ready drops it if ready by then
const STILL = { fadeIn: 400, hold: 2500, fadeOut: 500 }; // ms: reduced motion's still earring
const REST = 4; // px below the button's foot where the ear wire's bend hangs at rest
const CLIP = 6; // px above the button's foot where the earring comes out (the canvas's top)
const INSET = 4; // px the grab zone keeps inside the earring's extent
const HEIGHT = { laptop: 240, phone: 180 }; // px: how tall an earring is drawn

const noop = { drop() {}, cleanup() {} };

/**
 * @param {{ reduced: boolean, opened?: Promise<void> }} o
 * @returns {{ drop: (theme: string) => void, cleanup: () => void }}
 */
export function setupEarrings({ reduced, opened }) {
  const button = document.querySelector('[data-theme-toggle]');
  if (!button) return noop;
  const root = document.documentElement;
  const phone = matchMedia('(max-width: 767px)');
  const debug = new URLSearchParams(location.search).has('debug');

  let scene = null; // the scene, once made
  let loading = null; // the promise of it
  let off = false; // no WebGL, a weak GPU, or the model failed: no earrings
  let gone = false; // cleaned up
  let idleId = 0;
  let frame = 0;
  let last = 0;
  let current = null; // the earring out (or coming down) that can be taken hold of
  let touched = 0; // when it was last held, pointed at or brought down
  let held = null; // the pointer holding it
  let hover = null; // the pointer over the zone, to test against the earring once a frame
  let still = null; // reduced motion: the fade under way
  let asked = null; // a drop asked for before the model was ready: { name, theme, at }
  let size = 0; // ?debug: a height (px) to draw it at instead of the usual
  let why = null; // ?debug: why it last went up

  // the zone over the earring that takes the pointer (data-holds-bar: on the publication pages,
  // the pointer on it keeps the bar down, src/publication/peekbar.js)
  const zone = document.createElement('div');
  zone.className = 'earring-grab';
  zone.hidden = true;
  zone.setAttribute('aria-hidden', 'true');
  zone.dataset.holdsBar = '';

  const load = () => {
    if (loading || off || gone) return loading;
    const gl = probeWebGL();
    if (!gl.ok || prefersStatic(gl.renderer)) { off = true; return null; }
    loading = import('../scene/earrings.js')
      .then((mod) => mod.Earrings.create(MODEL, { reduced }))
      .then(async (made) => {
        if (gone) { made.dispose(); return null; }
        scene = made;
        if (debug) expose();
        // the shaders compiled and the textures uploaded now, so the first drop does not stall
        await made.warm();
        return made;
      })
      .catch((err) => { console.warn('earrings:', err); off = true; return null; });
    return loading;
  };

  // after the curtain has opened, in a quiet moment
  Promise.resolve(opened).then(() => {
    if (gone) return;
    const go = () => { idleId = 0; load(); };
    idleId = window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1200);
  });

  /** Where the canvas, the ear wire's rest and the earring's size are, from the button. Returns whether the button is on the screen and in use. */
  const layout = () => {
    const r = button.getBoundingClientRect();
    const px = size || (phone.matches ? HEIGHT.phone : HEIGHT.laptop);
    scene.setScale(px);
    const cx = r.left + r.width / 2;
    // a box under the button big enough for the earring and its swing (wider than the 2.6
    // earring widths of the brief, so a strand pulled aside is not cut off by its edge)
    const w = Math.round(Math.min(innerWidth, Math.max((scene.width * px / scene.height) * 2.6, px * 1.25)));
    const h = Math.round(px * 1.4);
    const left = Math.round(Math.min(Math.max(cx - w / 2, 0), Math.max(0, innerWidth - w)));
    scene.setBox(left, Math.round(r.bottom - CLIP), w, h);
    scene.setAnchor(cx, r.bottom + REST);
    // the button can no longer be pressed while the bar is going away (nav.js, peekbar.js)
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(button).pointerEvents !== 'none';
  };

  const attach = () => {
    if (!scene.canvas.isConnected) document.body.append(scene.canvas, zone);
    scene.canvas.style.visibility = '';
  };

  const wake = () => { if (!frame && !gone) { last = 0; frame = requestAnimationFrame(tick); } };

  const letGo = () => {
    if (held === null) return;
    try { zone.releasePointerCapture(held); } catch { /* already released */ }
    held = null;
    scene.release();
    root.classList.remove('is-grabbing');
    zone.classList.remove('is-held');
    touched = performance.now();
  };

  /** The earring out goes back up (`reason`: for ?debug). */
  const retract = (reason = 'asked') => {
    if (!current) return;
    why = reason;
    letGo();
    scene.retract(current);
    current = null;
    zone.hidden = true;
    zone.classList.remove('is-over');
  };

  /** Bring the named earring down (and send the other up). */
  const show = (name, theme) => {
    try {
      scene.setTheme(theme);
      attach();
      layout();
      if (reduced) { showStill(name); return; }
      letGo();
      if (current && current !== name) why = 'switch';
      for (const other of ['moon', 'sun']) if (other !== name) scene.retract(other);
      scene.drop(name);
      current = name;
      touched = performance.now();
      wake();
    } catch (err) {
      console.warn('earrings:', err);
    }
  };

  // reduced motion: it fades in hanging still, stays, and fades out
  const showStill = (name) => {
    still?.cancel();
    scene.still(name);
    const total = STILL.fadeIn + STILL.hold + STILL.fadeOut;
    still = scene.canvas.animate(
      [{ opacity: 0 }, { opacity: 1, offset: STILL.fadeIn / total }, { opacity: 1, offset: (STILL.fadeIn + STILL.hold) / total }, { opacity: 0 }],
      { duration: total, easing: 'linear', fill: 'forwards' },
    );
    const mine = still;
    still.finished.then(() => { if (still === mine) endStill(); }, () => {});
    wake();
  };
  const endStill = () => {
    still?.cancel();
    still = null;
    for (const k of ['moon', 'sun']) scene.hide(k);
  };

  const tick = (now) => {
    frame = 0;
    if (gone || !scene) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    const there = layout();
    if (!there) {
      if (current) retract('button away');
      if (still) endStill();
    }
    if (current && held === null && now - touched > IDLE) retract('idle');
    // the pointer over the zone: over the earring, the cursor takes its grab form
    if (hover && current && held === null) {
      const hit = scene.pick(hover.x, hover.y, current);
      zone.classList.toggle('is-over', !!hit);
      if (hit) touched = now;
      hover = null;
    }
    const active = scene.step(dt);
    scene.render();
    // the zone follows the earring that can be held
    const r = current ? scene.rect(current) : null;
    if (r) {
      const btn = button.getBoundingClientRect();
      const top = Math.max(r.top + INSET, btn.bottom + 1);
      const left = Math.max(r.left + INSET, 0), right = Math.min(r.right - INSET, innerWidth);
      const bottom = Math.min(r.bottom - INSET, innerHeight);
      if (right > left && bottom > top) {
        zone.hidden = false;
        zone.style.transform = `translate(${left}px, ${top}px)`;
        zone.style.width = `${right - left}px`;
        zone.style.height = `${bottom - top}px`;
      } else zone.hidden = true;
    } else zone.hidden = true;
    if (active) { frame = requestAnimationFrame(tick); return; }
    // nothing out: an empty canvas, out of sight, and no frames until the next drop
    scene.clear();
    scene.canvas.style.visibility = 'hidden';
    zone.hidden = true;
    last = 0;
  };

  // ---- the pointer ----
  const onDown = (e) => {
    if (!current || held !== null || !scene) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); // a miss is not passed on to the page, and nothing is selected
    const hit = scene.pick(e.clientX, e.clientY, current);
    if (!hit) return;
    held = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch { /* the pointer has gone */ }
    scene.grab(hit);
    scene.setPointer(e.clientX, e.clientY, true);
    root.classList.add('is-grabbing');
    zone.classList.add('is-held');
    touched = performance.now();
    wake();
  };
  const onZoneMove = (e) => {
    if (held === e.pointerId) {
      scene.dragTo(e.clientX, e.clientY);
      touched = performance.now();
      return;
    }
    if (e.pointerType !== 'touch') hover = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => { if (held === e.pointerId) letGo(); };
  const onZoneLeave = () => { if (held === null) zone.classList.remove('is-over'); };
  // the cursor's gold lamp follows the pointer anywhere (a finger's only while it is down)
  const onMove = (e) => {
    if (!scene || !scene.active) return;
    if (e.pointerType === 'touch' && e.buttons === 0) return;
    scene.setPointer(e.clientX, e.clientY, true);
  };
  const onLeave = () => scene?.setPointer(0, 0, false);
  const onTouchEnd = (e) => { if (e.pointerType === 'touch') scene?.setPointer(0, 0, false); };

  zone.addEventListener('pointerdown', onDown);
  zone.addEventListener('pointermove', onZoneMove);
  zone.addEventListener('pointerup', onUp);
  zone.addEventListener('pointercancel', onUp);
  zone.addEventListener('lostpointercapture', onUp);
  zone.addEventListener('pointerleave', onZoneLeave);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onTouchEnd, { passive: true });
  root.addEventListener('pointerleave', onLeave);

  /** The theme has just been switched by the visitor (src/ui/theme.js): bring its earring down. */
  const drop = (theme) => {
    if (off || gone) return;
    const name = theme === 'light' ? 'sun' : 'moon';
    if (scene) { show(name, theme); return; }
    const at = performance.now();
    asked = { name, theme, at };
    const p = load();
    p?.then((made) => {
      // only the latest switch, and only if it is still soon after it
      if (!made || asked?.at !== at || performance.now() - at > LATE) return;
      asked = null;
      show(name, theme);
    });
  };

  // ?debug: the state, the bodies, and how well the joints hold, for testing
  const expose = () => {
    window.__earrings = {
      get scene() { return scene; },
      get state() {
        return {
          current, held: held !== null, idleFor: Math.round(performance.now() - touched),
          moon: scene.state('moon'), sun: scene.state('sun'),
          canvas: scene.canvas.isConnected && scene.canvas.style.visibility !== 'hidden',
          looping: !!frame, physicsMs: +scene.cost.toFixed(3), steps: scene.steps, lastUp: why,
        };
      },
      bodies: (name = current ?? 'moon') => {
        const rig = scene.earrings[name].rig;
        return rig.names.map((part, i) => ({ part, x: [...rig.x.subarray(3 * i, 3 * i + 3)], q: [...rig.q.subarray(4 * i, 4 * i + 4)], v: [...rig.v.subarray(3 * i, 3 * i + 3)], w: [...rig.w.subarray(3 * i, 3 * i + 3)] }));
      },
      /** The joints as drawn and as solved: the largest gap (model units and px) and stretch. */
      pivots: (name = current ?? 'moon') => {
        const m = scene.earrings[name].rig.measure(), ppu = scene.ppu;
        return {
          gapPx: m.gap * ppu, stretch: m.stretch, solverGapPx: m.solver.gap * ppu, solverStretch: m.solver.stretch,
          parts: m.parts.map((p) => ({ part: p.part, gapPx: +(p.gap * ppu).toFixed(5), distance: +p.distance.toFixed(5), rest: +p.rest.toFixed(5), stretch: p.stretch })),
        };
      },
      angles: (name = current ?? 'moon') => scene.earrings[name].rig.angles().map((a) => a.map((v) => +v.toFixed(1))),
      drop,
      retract,
      /** Draw it this many px tall (0: as usual), to look at it closely. */
      size: (px = 0) => { size = px; },
    };
  };

  const cleanup = () => {
    gone = true;
    if (idleId) (window.cancelIdleCallback ?? clearTimeout)(idleId);
    cancelAnimationFrame(frame);
    still?.cancel();
    letGo();
    zone.removeEventListener('pointerdown', onDown);
    zone.removeEventListener('pointermove', onZoneMove);
    zone.removeEventListener('pointerup', onUp);
    zone.removeEventListener('pointercancel', onUp);
    zone.removeEventListener('lostpointercapture', onUp);
    zone.removeEventListener('pointerleave', onZoneLeave);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onTouchEnd);
    root.removeEventListener('pointerleave', onLeave);
    zone.remove();
    scene?.dispose();
    scene = null;
    if (window.__earrings) delete window.__earrings;
  };

  return { drop, cleanup };
}
