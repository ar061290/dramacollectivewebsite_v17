// White box-truss lighting rig hung above the stage on chain hoists (hall photo 4).
// Rig spotlights clamp onto any bar of the truss.
import * as THREE from 'three';
import { M } from './materials.js';
import { boxG, rodG, merge, mesh, disposeTree, clamp } from './util.js';
import { HALL } from './hall.js';

export const RIG = { x0: -4.2, x1: 4.2, z0: -3.7, z1: 0.6, section: 0.29 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// One straight run of box truss from a to b (horizontal).
function trussGeos(a, b, s) {
  const out = [];
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const h = s / 2;
  const corner = (t, u, v) => a.clone().addScaledVector(dir, t).addScaledVector(side, u).add(V(0, v, 0));
  for (const [u, v] of [[-h, -h], [h, -h], [-h, h], [h, h]]) out.push(rodG(corner(0, u, v), corner(len, u, v), 0.024, 8));
  const n = Math.max(1, Math.round(len / s));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const t0 = i * step, t1 = (i + 1) * step;
    const flip = i % 2 ? -1 : 1;
    out.push(rodG(corner(t0, -h * flip, h), corner(t1, h * flip, h), 0.009, 4)); // top
    out.push(rodG(corner(t0, -h * flip, -h), corner(t1, h * flip, -h), 0.009, 4)); // bottom
    out.push(rodG(corner(t0, -h, -h * flip), corner(t1, -h, h * flip), 0.009, 4)); // side
    out.push(rodG(corner(t0, h, -h * flip), corner(t1, h, h * flip), 0.009, 4)); // side
  }
  return out;
}

export function buildRig() {
  const group = new THREE.Group();
  group.name = 'Lighting rig';
  let key = '';
  let bars = [];
  let hitMeshes = [];
  let height = 5.2;

  function build(s) {
    disposeTree(group);
    group.clear();
    height = s.height;
    const y = s.height;
    const { x0, x1, z0, z1, section } = RIG;
    const zm = (z0 + z1) / 2;
    bars = [
      { a: V(x0, y, z1), b: V(x1, y, z1), name: 'Front bar' },
      { a: V(x0, y, z0), b: V(x1, y, z0), name: 'Back bar' },
      { a: V(x0, y, z0), b: V(x0, y, z1), name: 'Left bar' },
      { a: V(x1, y, z0), b: V(x1, y, z1), name: 'Right bar' },
    ];
    if (s.midBar) bars.push({ a: V(x0, y, zm), b: V(x1, y, zm), name: 'Middle bar' });
    const geos = [];
    for (const bar of bars) {
      const inset = section / 2 + 0.01;
      const d = new THREE.Vector3().subVectors(bar.b, bar.a).normalize();
      geos.push(...trussGeos(bar.a.clone().addScaledVector(d, inset), bar.b.clone().addScaledVector(d, -inset), section));
    }
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) geos.push(boxG(section + 0.04, section + 0.04, section + 0.04, x, y, z));
    if (s.midBar) for (const x of [x0, x1]) geos.push(boxG(section + 0.02, section + 0.02, section + 0.02, x, y, zm));
    group.add(mesh(merge(geos), M.truss, { name: 'Truss' }));

    // Chain hoists from the ceiling to each corner.
    const hoist = [];
    const chain = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const top = HALL.H - 0.05;
      chain.push(rodG(V(x, y + section / 2 + 0.02, z), V(x, top - 0.45, z), 0.008, 5));
      chain.push(rodG(V(x, top - 0.2, z), V(x, top, z), 0.012, 5));
      hoist.push(boxG(0.26, 0.3, 0.22, x, top - 0.33, z));
    }
    group.add(mesh(merge(chain), M.steelDark, { cast: false }));
    group.add(mesh(merge(hoist), M.fixture));

    // Invisible hit volumes used to place and drag rig lights.
    hitMeshes = bars.map((bar, i) => {
      const len = bar.a.distanceTo(bar.b);
      const along = Math.abs(bar.b.x - bar.a.x) > 0.01;
      const m = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.6, 0.6, along ? 0.6 : len), new THREE.MeshBasicMaterial());
      m.position.copy(bar.a).add(bar.b).multiplyScalar(0.5);
      m.visible = false;
      m.material.userData.own = true;
      m.userData.rigBar = i;
      group.add(m);
      return m;
    });
  }

  function setState(s) {
    const k = JSON.stringify(s);
    if (k !== key) {
      key = k;
      build(s);
    }
    group.visible = s.on;
  }

  // Closest clamp position on the truss to (x, z). Lights hang from the bottom chords.
  function snap(x, z) {
    let best = null;
    const p = V(x, height, z);
    for (const bar of bars) {
      const ab = new THREE.Vector3().subVectors(bar.b, bar.a);
      const len = ab.length();
      const t = clamp(new THREE.Vector3().subVectors(p, bar.a).dot(ab) / (len * len), 0.25 / len, 1 - 0.25 / len);
      const q = bar.a.clone().addScaledVector(ab, t);
      const d = q.distanceToSquared(p);
      if (!best || d < best.d) best = { d, x: q.x, z: q.z, bar: bar.name };
    }
    return { x: best.x, y: height - RIG.section / 2 - 0.02, z: best.z, bar: best.bar };
  }

  return {
    group,
    setState,
    snap,
    get hitMeshes() { return hitMeshes; },
    get height() { return height; },
  };
}
