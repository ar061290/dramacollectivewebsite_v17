// Walk-through mode: first-person view at eye height inside the hall.
// You can climb stairs and risers (steps up to 0.55 m), but not walk through walls, sets or the stage front.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { HALL } from './hall.js';
import { clamp } from './util.js';

const STEP = 0.55;
const STAND = 1.65;
const SIT = 1.15;

export function viewpointsFor(state) {
  const s = state.seating;
  const firstZ = s.frontGap + 0.25;
  const seatX = s.layout === 'curved' ? 0.9 : s.blocks % 2 === 0 ? s.aisle / 2 + s.seatSpacing * 1.5 : s.seatSpacing * 0.5;
  const list = [
    { name: 'Back of the hall', x: 0, z: HALL.zBack - 1.2, eye: STAND, look: [0, 2.0, -2] },
  ];
  if (s.rows > 0) {
    list.push({ name: 'Front row', x: s.offsetX + seatX, z: firstZ, eye: SIT, look: [0, 1.9, -2] });
    list.push({ name: 'Middle seat', x: s.offsetX + seatX + s.seatSpacing * 2, z: firstZ + Math.floor(s.rows / 2) * s.rowSpacing, eye: SIT, look: [0, 1.9, -2] });
  }
  list.push(
    { name: 'Side aisle', x: -HALL.W / 2 + 0.9, z: 7, eye: STAND, look: [0, 1.8, -2] },
    { name: 'On stage', x: 0, z: -1.2, eye: STAND, look: [0, 1.7, 12] },
    { name: 'In the wings', x: 3.2, z: -3.6, eye: STAND, look: [-1, 1.9, -1] },
  );
  return list;
}

export function createWalk(ctx) {
  const cam = ctx.camera;
  const el = ctx.renderer.domElement;
  const plc = new PointerLockControls(cam, el);
  const keys = new Set();
  const feet = new THREE.Vector3();
  const down = new THREE.Raycaster();
  const side = new THREE.Raycaster();
  const tmpN = new THREE.Vector3();
  const touch = { f: 0, s: 0 };
  let active = false;
  let eye = STAND;
  let drag = null;
  let blockers = [];
  let supports = [];

  plc.addEventListener('lock', () => ctx.ui.renderWalkHud(viewpointsFor(ctx.store.state), true));
  plc.addEventListener('unlock', () => {
    keys.clear();
    if (active) ctx.ui.renderWalkHud(viewpointsFor(ctx.store.state), false);
  });

  function refreshColliders() {
    supports = [...ctx.hall.supports, ...ctx.items.supportMeshes(null)];
    blockers = [...ctx.hall.solids.filter((m) => m !== ctx.hall.floor), ...ctx.led.solids, ...ctx.items.solidMeshes()];
  }

  function supportHeight(x, z, fromY) {
    down.set(new THREE.Vector3(x, fromY + STEP + 0.02, z), new THREE.Vector3(0, -1, 0));
    down.far = 40;
    for (const h of down.intersectObjects(supports, false)) {
      if (!h.face) continue;
      tmpN.copy(h.face.normal).transformDirection(h.object.matrixWorld);
      if (tmpN.y > 0.7) return h.point.y;
    }
    return 0;
  }

  function blocked(dx, dz) {
    const len = Math.hypot(dx, dz);
    if (!len) return false;
    const dir = new THREE.Vector3(dx / len, 0, dz / len);
    for (const hgt of [STEP + 0.08, 1.4]) {
      side.set(new THREE.Vector3(feet.x, feet.y + hgt, feet.z), dir);
      side.far = len + 0.25;
      if (side.intersectObjects(blockers, false).length) return true;
    }
    return false;
  }

  function tryMove(dx, dz) {
    for (const [ax, az] of [[dx, dz], [dx, 0], [0, dz]]) {
      if (!ax && !az) continue;
      const nx = clamp(feet.x + ax, -HALL.W / 2 + 0.35, HALL.W / 2 - 0.35);
      const nz = clamp(feet.z + az, HALL.zFront + 0.35, HALL.zBack - 0.35);
      if (blocked(nx - feet.x, nz - feet.z)) continue;
      const hgt = supportHeight(nx, nz, feet.y);
      if (hgt - feet.y > STEP) continue;
      feet.x = nx;
      feet.z = nz;
      return true;
    }
    return false;
  }

  function goTo(vp) {
    refreshColliders();
    feet.set(vp.x, 0, vp.z);
    feet.y = supportHeight(vp.x, vp.z, 8);
    eye = vp.eye;
    cam.position.set(feet.x, feet.y + eye, feet.z);
    cam.lookAt(new THREE.Vector3(...vp.look));
    ctx.invalidate();
  }

  function enter() {
    active = true;
    cam.rotation.order = 'YXZ';
    refreshColliders();
    goTo(viewpointsFor(ctx.store.state)[0]);
    ctx.ui.renderWalkHud(viewpointsFor(ctx.store.state), false);
  }

  function exit() {
    active = false;
    keys.clear();
    touch.f = touch.s = 0;
    if (plc.isLocked) plc.unlock();
    ctx.ui.renderWalkHud(null);
  }

  function update(dt) {
    if (!active) return false;
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + touch.f;
    const s = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + touch.s;
    let moved = false;
    if (f || s) {
      const yaw = cam.rotation.y;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mx = fx * f + rx * s, mz = fz * f + rz * s;
      const len = Math.hypot(mx, mz);
      const speed = keys.has('shift') ? 4.2 : 1.9;
      mx = (mx / len) * speed * dt;
      mz = (mz / len) * speed * dt;
      const n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.04));
      for (let i = 0; i < n; i++) if (!tryMove(mx / n, mz / n)) break;
      if (eye === SIT) eye = STAND;
      moved = true;
    }
    const target = supportHeight(feet.x, feet.z, feet.y);
    const dy = target - feet.y;
    feet.y += Math.abs(dy) < 0.002 ? dy : dy * Math.min(1, dt * 12);
    cam.position.set(feet.x, feet.y + eye, feet.z);
    return moved || Math.abs(dy) > 0.002;
  }

  window.addEventListener('keydown', (e) => {
    if (!active) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select') return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      keys.add(k);
      e.preventDefault();
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const vps = viewpointsFor(ctx.store.state);
      if (vps[n - 1]) goTo(vps[n - 1]);
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // Click to capture the mouse; if pointer lock is not available, drag to look instead.
  el.addEventListener('pointerdown', (e) => {
    if (!active || plc.isLocked) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!active || !drag || plc.isLocked) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    cam.rotation.order = 'YXZ';
    cam.rotation.y -= dx * 0.004;
    cam.rotation.x = clamp(cam.rotation.x - dy * 0.004, -1.45, 1.45);
    cam.rotation.z = 0;
    ctx.invalidate();
  });
  el.addEventListener('pointerup', (e) => {
    if (!active || !drag) return;
    const wasDrag = drag.moved;
    drag = null;
    if (!wasDrag && e.pointerType === 'mouse') {
      try {
        const r = plc.lock();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch {
        /* pointer lock refused: drag-to-look still works */
      }
    }
  });
  plc.addEventListener('change', () => ctx.invalidate());

  return {
    enter,
    exit,
    update,
    goTo,
    refreshColliders,
    setTouch(f, s) {
      touch.f = f;
      touch.s = s;
    },
    get active() { return active; },
  };
}
