// Design-mode interaction: select, drag on surfaces, place new parts, aim lights, edit single seats, shortcuts.
import * as THREE from 'three';
import { TYPES, footprint } from './items.js';
import { HALL } from './hall.js';
import { clamp, uid, aimAngles, DEG } from './util.js';

const DEFAULT_SPOT = {
  stairs: [0, 0, 0.4], riser: [0, 0, 0.5], boxset: [0, 1, -2.4], table: [0, 1, -1.8], chair: [0, 1, -1.1],
  locker: [-2.6, 1, -3.5], speaker: [-4.3, 0, 0.6], floorspot: [0, 0, 2.5], rigspot: [0, 5, 0.6],
};

export function createInteraction(ctx) {
  const el = ctx.renderer.domElement;
  const store = ctx.store;
  const ray = new THREE.Raycaster();
  const downRay = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tmpN = new THREE.Vector3();
  const grab = new THREE.Vector3();
  let mode = 'idle'; // idle | place | aim | seats
  let placingId = null;
  let press = null;
  let dragId = null;
  let hoverQueued = false;
  let lastMove = null;

  const find = (s, id) => s.items.find((i) => i.id === id);

  function setRay(e) {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ctx.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, ctx.camera);
  }

  function pickItem() {
    const hit = ray.intersectObjects(ctx.items.pickMeshes(), false)[0];
    return hit ? hit.object.userData.itemId : null;
  }

  function upFacing(hit) {
    if (!hit.face) return false;
    tmpN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return tmpN.y > 0.7;
  }

  function supportList(excludeId) {
    return [...ctx.hall.supports, ...ctx.items.supportMeshes(excludeId)];
  }

  function surfacePoint(excludeId) {
    for (const h of ray.intersectObjects(supportList(excludeId), false)) if (upFacing(h)) return h.point.clone();
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(ground, p) ? p : null;
  }

  // Height of the highest walkable surface under (x, z).
  function supportY(x, z, excludeId) {
    downRay.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
    for (const h of downRay.intersectObjects(supportList(excludeId), false)) if (upFacing(h)) return Math.round(h.point.y * 1000) / 1000;
    return 0;
  }

  function snapStep(type) {
    const m = ctx.snapMode || 'auto';
    if (m === 'auto') return TYPES[type].snap || 0;
    return +m;
  }

  function placeAt(it) {
    const t = TYPES[it.type];
    if (t.rig) {
      let p = ray.intersectObjects(ctx.rig.hitMeshes, false)[0]?.point;
      if (!p) {
        p = new THREE.Vector3();
        if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ctx.rig.height), p)) return;
      }
      const s = ctx.rig.snap(p.x, p.z);
      it.x = Math.round(s.x * 100) / 100;
      it.y = s.y;
      it.z = Math.round(s.z * 100) / 100;
      return;
    }
    const p = surfacePoint(it.id);
    if (!p) return;
    let x = p.x + grab.x, z = p.z + grab.z;
    const step = snapStep(it.type);
    if (step) {
      const f = footprint(it);
      x = Math.round((x - f.hx) / step) * step + f.hx;
      z = Math.round((z - f.hz) / step) * step + f.hz;
    }
    it.x = Math.round(clamp(x, -HALL.W / 2 + 0.3, HALL.W / 2 - 0.3) * 1000) / 1000;
    it.z = Math.round(clamp(z, HALL.zFront + 0.3, HALL.zBack - 0.3) * 1000) / 1000;
    it.y = supportY(it.x, it.z, it.id);
  }

  // ---------- pointer ----------
  function onDown(e) {
    if (ctx.mode !== 'design') return;
    setRay(e);
    if (mode === 'place') {
      if (e.button !== 0) return;
      e.stopImmediatePropagation();
      store.update((s) => { const it = find(s, placingId); if (it) placeAt(it); });
      finishPlacing(e.shiftKey);
      return;
    }
    if (mode === 'aim') {
      if (e.button !== 0) return;
      e.stopImmediatePropagation();
      const hit = ray.intersectObjects(ctx.solidMeshes(), false)[0];
      if (hit) aimAt(hit.point);
      setMode('idle');
      return;
    }
    if (e.button !== 0) return;
    if (mode === 'seats') {
      const key = ctx.seating.pick(ray);
      if (key) {
        e.stopImmediatePropagation();
        store.commit((s) => {
          const set = new Set(s.seating.removed);
          set.has(key) ? set.delete(key) : set.add(key);
          s.seating.removed = [...set];
        });
      }
      return;
    }
    const id = pickItem();
    press = { x: e.clientX, y: e.clientY, id };
    if (id) {
      e.stopImmediatePropagation();
      el.setPointerCapture(e.pointerId);
      if (ctx.selectedId !== id) ctx.select(id);
    }
  }

  function onMove(e) {
    if (ctx.mode !== 'design') return;
    lastMove = e;
    if (mode === 'place') {
      setRay(e);
      store.update((s) => { const it = find(s, placingId); if (it) placeAt(it); });
      return;
    }
    if (press && press.id && !dragId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) {
      dragId = press.id;
      setRay(e);
      const it = find(store.state, dragId);
      const p = it && !TYPES[it.type].rig ? surfacePoint(dragId) : null;
      grab.set(p ? it.x - p.x : 0, 0, p ? it.z - p.z : 0);
      store.begin();
      el.style.cursor = 'grabbing';
    }
    if (dragId) {
      setRay(e);
      store.update((s) => { const it = find(s, dragId); if (it) placeAt(it); });
      return;
    }
    if (!press && !hoverQueued) {
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        if (!lastMove || mode === 'aim') return;
        setRay(lastMove);
        if (mode === 'seats') el.style.cursor = ctx.seating.pick(ray) ? 'pointer' : '';
        else el.style.cursor = pickItem() ? 'grab' : '';
      });
    }
  }

  function onUp(e) {
    if (dragId) {
      dragId = null;
      grab.set(0, 0, 0);
      store.end();
      el.style.cursor = 'grab';
    } else if (press && ctx.mode === 'design' && mode === 'idle' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5 && !press.id) {
      setRay(e);
      clickBackground();
    }
    if (press && el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    press = null;
  }

  // A click on empty space opens the panel for what was clicked, or clears the selection.
  function clickBackground() {
    ctx.select(null);
    const targets = [];
    if (ctx.seating.chairMesh) targets.push([ctx.seating.chairMesh, 'audience']);
    targets.push([ctx.led.screen, 'stage']);
    if (ctx.rig.group.visible) ctx.rig.group.traverse((o) => { if (o.isMesh && o.visible) targets.push([o, 'lights']); });
    let best = null;
    for (const [obj, tab] of targets) {
      const hit = ray.intersectObject(obj, false)[0];
      if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, tab };
    }
    if (best) ctx.ui.setTab(best.tab);
  }

  el.addEventListener('pointerdown', onDown, true);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('contextmenu', (e) => { if (mode === 'place') { e.preventDefault(); cancelPlacing(); } });

  // ---------- modes ----------
  function setMode(m) {
    mode = m;
    el.style.cursor = m === 'aim' ? 'crosshair' : m === 'place' ? 'copy' : '';
    ctx.ui.setHint(
      m === 'place' ? 'Click to place · Shift-click to place another · R to rotate · Esc to cancel'
        : m === 'aim' ? 'Click any surface to point the light at it · Esc to cancel'
          : m === 'seats' ? 'Click a chair to remove it · click a red seat to bring it back'
            : '');
  }

  function startPlacing(type, props = {}, rot) {
    if (ctx.mode !== 'design') ctx.setMode('design');
    if (mode === 'place') cancelPlacing();
    if (mode === 'seats') ctx.ui.setSeatEdit(false);
    const t = TYPES[type];
    const [x, y, z] = DEFAULT_SPOT[type];
    const it = { id: uid(type), type, x, y, z, rot: 0, props: { ...t.defaults(), ...props } };
    if (type === 'boxset') it.z = -3.9 + it.props.d / 2;
    if (t.rig) {
      const s = ctx.rig.snap(x, z);
      Object.assign(it, { x: s.x, y: s.y, z: s.z });
    }
    if (t.fixture) {
      const headY = t.rig ? it.y - 0.25 : it.y + 0.26;
      const a = aimAngles({ x: it.x, y: headY, z: it.z }, { x: 0, y: 1, z: -2 });
      it.rot = a.pan;
      it.props.tilt = clamp(a.tilt, t.rig ? -90 : -20, t.rig ? 30 : 90);
    }
    if (rot !== undefined && !t.fixture) it.rot = rot;
    if (!t.rig && !t.fixture) it.y = supportY(it.x, it.z, it.id);
    if (!t.rig && type === 'floorspot') it.y = supportY(it.x, it.z, it.id);
    store.update((s) => {
      if (t.rig) s.rig.on = true;
      s.items.push(it);
    });
    placingId = it.id;
    grab.set(0, 0, 0);
    ctx.select(it.id);
    setMode('place');
  }

  function finishPlacing(again) {
    const it = find(store.state, placingId);
    placingId = null;
    setMode('idle');
    store.end();
    if (again && it) startPlacing(it.type, it.props, it.rot);
  }

  function cancelPlacing() {
    placingId = null;
    setMode('idle');
    store.cancel();
    ctx.select(null);
  }

  function startAim() {
    if (!ctx.selectedId) return;
    setMode('aim');
  }

  function aimAt(p) {
    const id = ctx.selectedId;
    const obj = id && ctx.items.get(id);
    if (!obj || !obj.userData.fixture) return;
    const hp = obj.userData.fixture.head.getWorldPosition(new THREE.Vector3());
    const a = aimAngles(hp, p);
    const t = TYPES[find(store.state, id).type];
    store.commit((s) => {
      const it = find(s, id);
      it.rot = a.pan;
      it.props.tilt = clamp(a.tilt, t.rig ? -90 : -20, t.rig ? 30 : 90);
    });
  }

  function setSeatMode(on) {
    if (mode === 'place') cancelPlacing();
    ctx.seating.setEditMode(on);
    if (on) ctx.select(null);
    setMode(on ? 'seats' : 'idle');
  }

  // ---------- edits ----------
  function remove() {
    const id = ctx.selectedId;
    if (!id) return;
    ctx.select(null);
    store.commit((s) => { s.items = s.items.filter((i) => i.id !== id); });
  }

  function duplicate() {
    const src = ctx.selectedId && find(store.state, ctx.selectedId);
    if (!src) return;
    const t = TYPES[src.type];
    const f = footprint(src);
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid(src.type);
    copy.x = clamp(src.x + (t.rig ? 0.6 : f.hx * 2), -HALL.W / 2 + 0.3, HALL.W / 2 - 0.3);
    if (!t.rig) copy.y = supportY(copy.x, copy.z, null);
    store.commit((s) => { s.items.push(copy); });
    ctx.select(copy.id);
  }

  function rotate(deg) {
    const id = ctx.selectedId;
    if (!id) return;
    if (mode === 'place') store.update((s) => { const it = find(s, id); it.rot = (it.rot || 0) + deg; });
    else store.commit((s) => { const it = find(s, id); it.rot = (it.rot || 0) + deg; });
  }

  function nudge(dx, dz, dy = 0) {
    const id = ctx.selectedId;
    if (!id) return;
    store.commit((s) => {
      const it = find(s, id);
      it.x = Math.round(clamp(it.x + dx, -HALL.W / 2 + 0.3, HALL.W / 2 - 0.3) * 1000) / 1000;
      it.z = Math.round(clamp(it.z + dz, HALL.zFront + 0.3, HALL.zBack - 0.3) * 1000) / 1000;
      if (TYPES[it.type].rig) {
        const sn = ctx.rig.snap(it.x, it.z);
        it.x = sn.x;
        it.z = sn.z;
      } else if (dy) it.y = Math.max(0, Math.round((it.y + dy) * 100) / 100);
      else it.y = supportY(it.x, it.z, it.id);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (ctx.mode !== 'design') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && k.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? store.redo() : store.undo();
      return;
    }
    if (mod && k.toLowerCase() === 'y') {
      e.preventDefault();
      store.redo();
      return;
    }
    if (mod && k.toLowerCase() === 'd') {
      e.preventDefault();
      duplicate();
      return;
    }
    if (k === 'Escape') {
      if (mode === 'place') cancelPlacing();
      else if (mode === 'aim') setMode('idle');
      else if (mode === 'seats') ctx.ui.setSeatEdit(false);
      else ctx.select(null);
      return;
    }
    if (!ctx.selectedId) return;
    const it = find(store.state, ctx.selectedId);
    if (!it) return;
    const fixture = TYPES[it.type].fixture || it.type === 'speaker';
    const step = (snapStep(it.type) || 0.05) * (e.shiftKey ? 5 : 1);
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      remove();
    } else if (k === 'r' || k === 'R') {
      rotate((fixture ? 15 : 90) * (e.shiftKey ? -1 : 1));
    } else if (k === 'ArrowLeft') {
      e.preventDefault();
      nudge(-step, 0);
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      nudge(step, 0);
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      nudge(0, -step);
    } else if (k === 'ArrowDown') {
      e.preventDefault();
      nudge(0, step);
    } else if (k === 'PageUp') {
      e.preventDefault();
      nudge(0, 0, 0.1);
    } else if (k === 'PageDown') {
      e.preventDefault();
      nudge(0, 0, -0.1);
    } else if (k === 'f' || k === 'F') {
      ctx.focusSelection?.();
    }
  });

  return {
    startPlacing, cancelPlacing, startAim, aimAt, setSeatMode, remove, duplicate,
    get mode() { return mode; },
    reset() {
      if (mode === 'place') cancelPlacing();
      if (mode === 'seats') ctx.ui.setSeatEdit(false);
      setMode('idle');
    },
  };
}

export { DEG };
