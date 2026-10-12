// Audience seating: black shell chairs with chrome legs (hall photo 5), laid out from a few parameters.
// Chairs are instanced so a full house of several hundred seats stays fast.
import * as THREE from 'three';
import { M } from './materials.js';
import { audienceChairGeos } from './models.js';
import { HALL, STAGE } from './hall.js';

export const SEAT_LIMITS = { xMax: HALL.W / 2 - 0.35, zMax: HALL.zBack - 0.4 };

// Seat positions for a layout. Each seat: {key, x, z, yaw}.
export function layoutSeats(s) {
  const seats = [];
  let outside = 0;
  const push = (key, x, z, yaw) => {
    if (Math.abs(x) > SEAT_LIMITS.xMax || z > SEAT_LIMITS.zMax || z < 0.3) {
      outside++;
      return;
    }
    seats.push({ key, x, z, yaw });
  };
  if (!s.rows || !s.seatsPerRow || !s.blocks) return { seats, outside, aisles: [] };
  const aisles = [];
  if (s.layout === 'curved') {
    const cz = (STAGE.zBack + STAGE.zFront) / 2;
    const r0 = -cz + s.frontGap + 0.25;
    const blockAngle = (s.seatsPerRow * s.seatSpacing) / r0;
    for (let r = 0; r < s.rows; r++) {
      const R = r0 + r * s.rowSpacing;
      const aisleA = s.aisle / R;
      const total = s.blocks * blockAngle + (s.blocks - 1) * aisleA;
      const n = Math.max(1, Math.floor((blockAngle * R) / s.seatSpacing));
      const step = s.seatSpacing / R;
      for (let b = 0; b < s.blocks; b++) {
        const a0 = -total / 2 + b * (blockAngle + aisleA) + (blockAngle - n * step) / 2;
        for (let k = 0; k < n; k++) {
          const a = a0 + (k + 0.5) * step;
          push(`${b}-${r}-${k}`, s.offsetX + Math.sin(a) * R, cz + Math.cos(a) * R, a + Math.PI);
        }
      }
    }
    const Rm = r0 + ((s.rows - 1) * s.rowSpacing) / 2;
    const aisleA = s.aisle / Rm;
    const total = s.blocks * blockAngle + (s.blocks - 1) * aisleA;
    for (let b = 0; b < s.blocks - 1; b++) {
      const a = -total / 2 + (b + 1) * blockAngle + b * aisleA + aisleA / 2;
      aisles.push({ curved: true, a, cx: s.offsetX, cz, r0: r0 - 0.6, r1: r0 + (s.rows - 1) * s.rowSpacing + 0.6 });
    }
  } else {
    const bw = s.seatsPerRow * s.seatSpacing;
    const W = s.blocks * bw + (s.blocks - 1) * s.aisle;
    for (let b = 0; b < s.blocks; b++) {
      const x0 = s.offsetX - W / 2 + b * (bw + s.aisle);
      for (let r = 0; r < s.rows; r++)
        for (let k = 0; k < s.seatsPerRow; k++) push(`${b}-${r}-${k}`, x0 + (k + 0.5) * s.seatSpacing, s.frontGap + 0.25 + r * s.rowSpacing, Math.PI);
      if (b < s.blocks - 1) aisles.push({ x: x0 + bw + s.aisle / 2, w: s.aisle });
    }
  }
  return { seats, outside, aisles };
}

export function buildSeating(ctx) {
  const group = new THREE.Group();
  group.name = 'Audience seating';
  const geos = audienceChairGeos();
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff6a5a, transparent: true, opacity: 0.35, depthWrite: false });
  let shell = null, frame = null, ghost = null, carpets = [];
  let liveKeys = [], ghostKeys = [];
  let key = '';
  let editMode = false;
  let last = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);

  function clear() {
    for (const o of [shell, frame, ghost, ...carpets]) {
      if (!o) continue;
      group.remove(o);
      if (o.isInstancedMesh) o.dispose();
      else o.geometry.dispose();
    }
    shell = frame = ghost = null;
    carpets = [];
  }

  function instanced(geo, mat, list) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((s, i) => {
      q.setFromAxisAngle(up, s.yaw);
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(s.x, 0, s.z), q, one));
    });
    im.count = list.length;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.computeBoundingBox();
    return im;
  }

  function carpetStrip(w, len) {
    const g = new THREE.PlaneGeometry(w, len);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / HALL.W, (uv.getY(i) * len) / (HALL.zBack - HALL.zFront));
    g.rotateX(-Math.PI / 2);
    return g;
  }

  function build(s) {
    clear();
    const removed = new Set(s.removed || []);
    const { seats, outside, aisles } = layoutSeats(s);
    const live = seats.filter((x) => !removed.has(x.key));
    const gone = seats.filter((x) => removed.has(x.key));
    liveKeys = live.map((x) => x.key);
    ghostKeys = gone.map((x) => x.key);
    shell = instanced(geos.shell, M.plastic, live);
    frame = instanced(geos.frame, M.chrome, live);
    shell.castShadow = shell.receiveShadow = frame.castShadow = true;
    shell.name = 'Audience chairs';
    ghost = instanced(geos.shell, ghostMat, gone);
    ghost.visible = editMode && gone.length > 0;
    group.add(shell, frame, ghost);
    if (s.carpet) {
      for (const a of aisles) {
        let m;
        if (a.curved) {
          const len = a.r1 - a.r0;
          m = new THREE.Mesh(carpetStrip(s.aisle * 0.92, len), M.aisle);
          const rm = (a.r0 + a.r1) / 2;
          m.position.set(a.cx + Math.sin(a.a) * rm, 0.004, a.cz + Math.cos(a.a) * rm);
          m.rotation.y = a.a;
        } else {
          const z0 = STAGE.zFront + 0.15, z1 = HALL.zBack - 0.3;
          m = new THREE.Mesh(carpetStrip(a.w * 0.92, z1 - z0), M.aisle);
          m.position.set(a.x, 0.004, (z0 + z1) / 2);
        }
        m.receiveShadow = true;
        carpets.push(m);
        group.add(m);
      }
    }
    last = { total: seats.length, live: live.length, removed: gone.length, outside };
  }

  function setState(s) {
    const k = JSON.stringify(s);
    if (k === key) return false;
    key = k;
    build(s);
    return true;
  }

  // Seat key under a ray (live or removed ghost seats).
  function pick(raycaster) {
    const targets = [shell, ...(editMode && ghost && ghost.count ? [ghost] : [])].filter(Boolean);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    return hit.object === ghost ? ghostKeys[hit.instanceId] : liveKeys[hit.instanceId];
  }

  return {
    group,
    setState,
    pick,
    get stats() { return last; },
    get chairMesh() { return shell; },
    setEditMode(on) {
      editMode = on;
      if (ghost) ghost.visible = on && ghost.count > 0;
      ctx.invalidate();
    },
  };
}
