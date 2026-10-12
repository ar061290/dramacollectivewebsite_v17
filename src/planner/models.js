// Procedural models for everything that can be placed in the hall.
// Each model faces +z (toward the audience) at rotation 0 and stands on y = 0.
import * as THREE from 'three';
import { M, T, woodMat, fabricMat, paintMat, riserTopMat } from './materials.js';
import { boxG, cylG, rboxG, torusG, discG, rodG, merge, mesh, shared, pleatG, DEG } from './util.js';
import { coverTexture } from './images.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const geoCache = new Map();
const cached = (key, fn) => {
  if (!geoCache.has(key)) {
    const v = fn();
    Object.values(v).forEach((g) => g && g.isBufferGeometry && shared(g));
    geoCache.set(key, v);
  }
  return geoCache.get(key);
};

export const WOODS = { oak: '#b98a5a', walnut: '#6b4428', teak: '#8a5a32', white: '#e8e4dc', black: '#2a2622' };
export const CLOTHS = { none: null, white: '#d6d4cd', red: '#8e1424', black: '#121214', blue: '#1d3a8a', gold: '#b08a3c' };
const gold = () => paintMat('#d4a64a', 0.3);

function group(name, ...children) {
  const g = new THREE.Group();
  g.name = name;
  children.flat().forEach((c) => c && g.add(c));
  return g;
}

// ---------------- audience / plastic chair ----------------
export function audienceChairGeos() {
  return cached('aud-chair', () => {
    const shell = merge([
      rboxG(0.46, 0.04, 0.44, 0.015, 0, 0.45, 0.01),
      rboxG(0.44, 0.34, 0.03, 0.012, 0, 0.75, -0.205, -0.14),
      boxG(0.3, 0.12, 0.025, 0, 0.53, -0.19, -0.1),
    ]);
    const frame = merge([
      ...[-1, 1].flatMap((s) => [
        rodG(V(s * 0.205, 0, 0.215), V(s * 0.19, 0.43, 0.18), 0.011, 8),
        rodG(V(s * 0.205, 0, -0.225), V(s * 0.19, 0.43, -0.18), 0.011, 8),
        rodG(V(s * 0.19, 0.43, 0.18), V(s * 0.19, 0.43, -0.18), 0.009, 6),
        rodG(V(s * 0.16, 0.43, -0.19), V(s * 0.16, 0.6, -0.22), 0.009, 6),
      ]),
      rodG(V(-0.19, 0.43, 0.18), V(0.19, 0.43, 0.18), 0.009, 6),
      rodG(V(-0.19, 0.43, -0.18), V(0.19, 0.43, -0.18), 0.009, 6),
    ]);
    return { shell, frame };
  });
}

// ---------------- stair block 0.8 m cube, four 0.2 m steps ----------------
export function makeStairs() {
  const g = cached('stairs', () => {
    const body = [], edge = [];
    for (let i = 0; i < 4; i++) {
      const h = (i + 1) * 0.2;
      const z = 0.3 - i * 0.2;
      body.push(boxG(0.8, h - 0.012, 0.2, 0, (h - 0.012) / 2, z));
      edge.push(boxG(0.8, 0.012, 0.2, 0, h - 0.006, z));
      edge.push(boxG(0.8, 0.03, 0.012, 0, h - 0.015, z + 0.094));
    }
    return { body: merge(body), edge: merge(edge) };
  });
  const top = mesh(g.edge, M.stairEdge);
  const root = group('Stair block', mesh(g.body, M.stairWood), top);
  root.userData.supports = [top];
  return root;
}

// ---------------- mobile riser 1 x 1 x 0.5 m ----------------
export function makeRiser(p) {
  const g = cached('riser', () => ({
    frame: merge([
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => boxG(0.05, 0.46, 0.05, sx * 0.45, 0.23, sz * 0.45)),
      boxG(0.9, 0.04, 0.03, 0, 0.12, 0.45),
      boxG(0.9, 0.04, 0.03, 0, 0.12, -0.45),
      boxG(0.03, 0.04, 0.9, 0.45, 0.12, 0),
      boxG(0.03, 0.04, 0.9, -0.45, 0.12, 0),
    ]),
    trim: merge([
      boxG(1.0, 0.045, 0.012, 0, 0.4775, 0.494),
      boxG(1.0, 0.045, 0.012, 0, 0.4775, -0.494),
      boxG(0.012, 0.045, 1.0, 0.494, 0.4775, 0),
      boxG(0.012, 0.045, 1.0, -0.494, 0.4775, 0),
    ]),
    deck: boxG(0.988, 0.04, 0.988, 0, 0.48, 0),
    skirt: pleatG(1.0, 0.455, 0.1, 0.022),
  }));
  const deck = mesh(g.deck, riserTopMat(p.top));
  const root = group('Riser', deck, mesh(g.frame, M.steelDark), mesh(g.trim, M.alu));
  if (p.skirt) {
    for (let i = 0; i < 4; i++) {
      const s = mesh(g.skirt, M.skirt);
      const a = (i * Math.PI) / 2;
      s.position.set(Math.sin(a) * 0.505, 0.2275, Math.cos(a) * 0.505);
      s.rotation.y = a;
      root.add(s);
    }
  }
  root.userData.supports = [deck];
  return root;
}

// ---------------- box set: |_| room of printed flex walls ----------------
export function makeBoxSet(p, onTexture) {
  const { w, d, h } = p;
  const t = 0.06;
  const root = group('Box set');
  const backing = M.backing;
  const printMat = (id, aspect) => {
    const m = new THREE.MeshStandardMaterial({ map: coverTexture(id, aspect, onTexture), roughness: 0.62, metalness: 0 });
    m.userData.own = true;
    return m;
  };
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z. The printed face is the inside face.
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), [backing, backing, backing, backing, printMat(p.back, w / h), backing]);
  back.position.set(0, h / 2, -d / 2 + t / 2);
  const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, d - t), [printMat(p.left, (d - t) / h), backing, backing, backing, backing, backing]);
  left.position.set(-w / 2 + t / 2, h / 2, t / 2);
  const right = new THREE.Mesh(new THREE.BoxGeometry(t, h, d - t), [backing, printMat(p.right, (d - t) / h), backing, backing, backing, backing]);
  right.position.set(w / 2 - t / 2, h / 2, t / 2);
  [back, left, right].forEach((m) => {
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  });
  // Aluminium frame rails and back braces with stage weights.
  const fm = p.frame === 'black' ? M.steelDark : M.alu;
  const r = 0.022;
  const fr = [
    boxG(w + 0.02, r * 2, r * 2, 0, h + r, -d / 2 + t / 2),
    boxG(r * 2, r * 2, d, -w / 2 + t / 2, h + r, 0),
    boxG(r * 2, r * 2, d, w / 2 - t / 2, h + r, 0),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => boxG(r * 2, h + 2 * r, r * 2, sx * (w / 2 - t / 2), h / 2 + r, sz < 0 ? -d / 2 + t / 2 : d / 2 - r)),
  ];
  for (const x of [-w / 4, w / 4]) {
    fr.push(rodG(V(x, h * 0.75, -d / 2 - 0.02), V(x, 0.05, -d / 2 - Math.min(1.2, h * 0.35)), 0.02, 6));
  }
  root.add(mesh(merge(fr), fm));
  const weights = [];
  for (const x of [-w / 4, w / 4]) weights.push(rboxG(0.35, 0.12, 0.25, 0.04, x, 0.06, -d / 2 - Math.min(1.2, h * 0.35)));
  root.add(mesh(merge(weights), M.black));
  return root;
}

// ---------------- tables ----------------
export function makeTable(p) {
  const wood = woodMat(WOODS[p.wood] || WOODS.oak);
  const cloth = CLOTHS[p.cloth];
  const parts = [];
  const steel = [];
  let clothGeo = null;
  if (p.style === 'round') {
    parts.push(cylG(0.45, 0.45, 0.035, 40, 0, 0.7425, 0));
    parts.push(cylG(0.05, 0.06, 0.7, 16, 0, 0.375, 0));
    parts.push(cylG(0.26, 0.28, 0.03, 32, 0, 0.015, 0));
    if (cloth) clothGeo = cylG(0.48, 0.6, 0.75, 40, 0, 0.385, 0);
  } else if (p.style === 'desk') {
    parts.push(rboxG(1.0, 0.03, 0.55, 0.006, 0, 0.745, 0));
    parts.push(boxG(0.9, 0.3, 0.014, 0, 0.55, 0.24));
    steel.push(boxG(0.9, 0.012, 0.42, 0, 0.6, 0.02));
    for (const [x, z] of [[-0.46, -0.24], [0.46, -0.24], [-0.46, 0.24], [0.46, 0.24]]) steel.push(boxG(0.03, 0.73, 0.03, x, 0.365, z));
    if (cloth) clothGeo = boxG(1.06, 0.75, 0.61, 0, 0.385, 0);
  } else if (p.style === 'banquet') {
    parts.push(boxG(1.8, 0.03, 0.75, 0, 0.745, 0));
    for (const sx of [-1, 1]) {
      steel.push(rodG(V(sx * 0.75, 0.73, -0.3), V(sx * 0.75, 0, -0.3), 0.014, 8));
      steel.push(rodG(V(sx * 0.75, 0.73, 0.3), V(sx * 0.75, 0, 0.3), 0.014, 8));
      steel.push(rodG(V(sx * 0.75, 0.1, -0.3), V(sx * 0.75, 0.1, 0.3), 0.012, 6));
    }
    if (cloth) clothGeo = boxG(1.86, 0.75, 0.81, 0, 0.385, 0);
  } else {
    parts.push(rboxG(1.4, 0.035, 0.8, 0.008, 0, 0.7425, 0));
    parts.push(boxG(1.24, 0.08, 0.02, 0, 0.68, 0.33), boxG(1.24, 0.08, 0.02, 0, 0.68, -0.33));
    parts.push(boxG(0.02, 0.08, 0.62, 0.63, 0.68, 0), boxG(0.02, 0.08, 0.62, -0.63, 0.68, 0));
    for (const [x, z] of [[-0.64, -0.34], [0.64, -0.34], [-0.64, 0.34], [0.64, 0.34]]) parts.push(boxG(0.055, 0.725, 0.055, x, 0.3625, z));
    if (cloth) clothGeo = boxG(1.48, 0.75, 0.88, 0, 0.385, 0);
  }
  const root = group('Table', mesh(merge(parts), p.style === 'banquet' ? paintMat('#e9e6df', 0.5) : wood));
  if (steel.length) root.add(mesh(merge(steel), M.steelDark));
  if (clothGeo) root.add(mesh(clothGeo, fabricMat(cloth)));
  return root;
}

// ---------------- chairs ----------------
export function makeChair(p) {
  const wood = woodMat(WOODS[p.wood] || WOODS.oak);
  const fabric = fabricMat(p.fabric || '#7a1f2b');
  if (p.style === 'plastic') {
    const g = audienceChairGeos();
    return group('Chair', mesh(g.shell, M.plastic), mesh(g.frame, M.chrome));
  }
  if (p.style === 'armchair') {
    const up = merge([
      rboxG(0.82, 0.3, 0.78, 0.04, 0, 0.25, 0),
      rboxG(0.56, 0.12, 0.62, 0.05, 0, 0.45, 0.05),
      rboxG(0.82, 0.52, 0.18, 0.06, 0, 0.63, -0.3, -0.08),
      rboxG(0.14, 0.26, 0.78, 0.05, -0.34, 0.52, 0),
      rboxG(0.14, 0.26, 0.78, 0.05, 0.34, 0.52, 0),
    ]);
    const legs = merge([[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => cylG(0.022, 0.015, 0.1, 10, sx * 0.35, 0.05, sz * 0.32)));
    return group('Armchair', mesh(up, fabric), mesh(legs, wood));
  }
  if (p.style === 'stool') {
    const seat = cylG(0.18, 0.18, 0.04, 28, 0, 0.64, 0);
    const legs = merge([0, 1, 2, 3].map((i) => {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      return rodG(V(Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12), V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), 0.016, 8);
    }));
    const ring = torusG(0.165, 0.008, 0, 0.25, 0, Math.PI / 2);
    return group('Stool', mesh(seat, wood), mesh(legs, wood), mesh(ring, M.steelDark));
  }
  if (p.style === 'throne') {
    const frame = merge([
      boxG(0.74, 0.42, 0.62, 0, 0.21, 0),
      rboxG(0.76, 1.3, 0.12, 0.04, 0, 1.07, -0.26),
      rboxG(0.12, 0.3, 0.6, 0.03, -0.33, 0.57, 0),
      rboxG(0.12, 0.3, 0.6, 0.03, 0.33, 0.57, 0),
      cylG(0.05, 0.05, 0.1, 12, -0.33, 1.77, -0.26),
      cylG(0.05, 0.05, 0.1, 12, 0.33, 1.77, -0.26),
      new THREE.SphereGeometry(0.06, 16, 12).translate(-0.33, 1.86, -0.26),
      new THREE.SphereGeometry(0.06, 16, 12).translate(0.33, 1.86, -0.26),
      new THREE.SphereGeometry(0.09, 16, 12).translate(0, 1.8, -0.26),
    ]);
    const pad = merge([rboxG(0.52, 0.1, 0.5, 0.04, 0, 0.47, 0.03), rboxG(0.5, 1.0, 0.04, 0.02, 0, 1.05, -0.19)]);
    return group('Throne', mesh(frame, gold()), mesh(pad, fabric));
  }
  // Wooden dining chair
  const parts = [
    rboxG(0.44, 0.035, 0.42, 0.008, 0, 0.45, 0),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => boxG(0.035, 0.435, 0.035, sx * 0.19, 0.2175, sz * 0.18)),
    boxG(0.035, 0.5, 0.035, -0.19, 0.7, -0.19),
    boxG(0.035, 0.5, 0.035, 0.19, 0.7, -0.19),
    boxG(0.38, 0.07, 0.02, 0, 0.9, -0.19),
    boxG(0.38, 0.05, 0.02, 0, 0.74, -0.19),
    boxG(0.38, 0.02, 0.02, 0, 0.15, 0.18),
    boxG(0.38, 0.02, 0.02, 0, 0.15, -0.18),
  ];
  return group('Chair', mesh(merge(parts), wood));
}

// ---------------- lockers 0.9 x 1.8 x 0.5 m ----------------
export function makeLocker(p) {
  const type = p.doors === '3x5' ? '3x5' : '3x3';
  const g = cached('locker-' + type, () => {
    const W = 0.9, H = 1.8, D = 0.5;
    const sage = [], gap = [], slit = [], metal = [];
    const legH = type === '3x3' ? 0.12 : 0;
    const plinth = type === '3x5' ? 0.08 : 0;
    const y0 = legH + plinth;
    const bodyH = H - y0 - 0.015;
    sage.push(boxG(W, bodyH, D, 0, y0 + bodyH / 2, 0));
    sage.push(boxG(W + 0.012, 0.015, D + 0.012, 0, H - 0.0075, 0));
    if (legH) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        sage.push(boxG(0.045, legH, 0.045, sx * (W / 2 - 0.03), legH / 2, sz * (D / 2 - 0.03)));
        metal.push(boxG(0.06, 0.008, 0.06, sx * (W / 2 - 0.03), 0.004, sz * (D / 2 - 0.03)));
      }
    } else {
      gap.push(boxG(W - 0.03, plinth, D - 0.04, 0, plinth / 2, -0.01));
    }
    const m = 0.025, gp = 0.008, cols = 3, rows = type === '3x3' ? 3 : 5;
    const aw = W - 2 * m, ah = bodyH - 2 * m;
    gap.push(boxG(aw + 0.004, ah + 0.004, 0.002, 0, y0 + m + ah / 2, D / 2 + 0.001));
    const dw = (aw - (cols - 1) * gp) / cols, dh = (ah - (rows - 1) * gp) / rows;
    const fz = D / 2 + 0.012;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const x = -aw / 2 + dw / 2 + c * (dw + gp);
        const y = y0 + m + dh / 2 + r * (dh + gp);
        sage.push(boxG(dw, dh, 0.012, x, y, D / 2 + 0.006));
        const n = type === '3x3' ? 4 : 3;
        for (let k = 0; k < n; k++) {
          const sy = type === '3x3' ? y - dh / 2 + 0.045 + k * 0.02 : y + dh / 2 - 0.035 - k * 0.017;
          slit.push(boxG(dw * 0.46, 0.006, 0.002, x + dw * 0.12, sy, fz + 0.001));
          sage.push(boxG(dw * 0.46, 0.004, 0.006, x + dw * 0.12, sy + 0.005, fz + 0.002));
        }
        if (type === '3x3') {
          slit.push(rboxG(0.026, 0.075, 0.003, 0.006, x - dw * 0.22, y + dh * 0.22, fz + 0.001));
          metal.push(boxG(0.012, 0.03, 0.012, x - dw * 0.22, y + dh * 0.04, fz + 0.006));
          metal.push(boxG(0.07, 0.028, 0.003, x + dw * 0.1, y + dh / 2 - 0.05, fz + 0.002));
        } else {
          metal.push(cylG(0.011, 0.011, 0.012, 14, x - dw * 0.34, y - dh * 0.05, fz + 0.006, Math.PI / 2));
          metal.push(boxG(0.055, 0.02, 0.003, x + dw * 0.12, y - dh * 0.12, fz + 0.002));
        }
      }
    return { sage: merge(sage), gap: merge(gap), slit: merge(slit), metal: merge(metal) };
  });
  return group('Lockers', mesh(g.sage, M.locker), mesh(g.gap, M.lockerGap), mesh(g.slit, M.lockerSlit), mesh(g.metal, M.chrome));
}

// ---------------- tall column speaker ----------------
export function makeSpeaker(p) {
  const H = p.height;
  const white = p.finish === 'white';
  const g = cached('spk-' + H, () => ({
    body: rboxG(0.2, H - 0.025, 0.18, 0.02, 0, (H - 0.025) / 2 + 0.025, 0),
    grille: new THREE.PlaneGeometry(0.17, H - 0.12).translate(0, H / 2 + 0.02, 0.0905),
    base: rboxG(0.32, 0.025, 0.3, 0.008, 0, 0.0125, 0),
    logo: boxG(0.06, 0.014, 0.002, 0, 0.13, 0.092),
  }));
  T.grille.repeat.set(5, 70);
  const pivot = group('Speaker head', mesh(g.body, white ? M.speakerWhite : M.speaker), mesh(g.grille, white ? M.grilleWhite : M.grille), mesh(g.logo, M.chrome));
  const root = group('Speaker', mesh(g.base, M.steelDark), pivot);
  root.userData.pivot = pivot;
  return root;
}

// ---------------- LED par can (floor or rig) ----------------
const beamGeo = shared(new THREE.ConeGeometry(1, 1, 40, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2));

const BEAM_VERT = `
varying float vZ; varying vec3 vN; varying vec3 vV;
void main() {
  vZ = position.z;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = `
uniform vec3 color; uniform float opacity; uniform float soft;
varying float vZ; varying vec3 vN; varying vec3 vV;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(facing, 1.2 + soft * 2.5);
  float along = pow(clamp(1.0 - vZ, 0.0, 1.0), 1.4) * smoothstep(0.0, 0.04, vZ);
  gl_FragColor = vec4(color * opacity * edge * along, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function parGeos(hanging) {
  return cached('par-' + (hanging ? 'rig' : 'floor'), () => {
    const head = merge([
      cylG(0.105, 0.1, 0.17, 28, 0, 0, -0.005, Math.PI / 2),
      torusG(0.1, 0.012, 0, 0, 0.08),
      cylG(0.08, 0.08, 0.03, 20, 0, 0, -0.1, Math.PI / 2),
      torusG(0.104, 0.006, 0, 0, -0.035),
      torusG(0.103, 0.006, 0, 0, -0.055),
      cylG(0.02, 0.02, 0.03, 12, 0.118, 0, 0, 0, 0, Math.PI / 2),
      cylG(0.02, 0.02, 0.03, 12, -0.118, 0, 0, 0, 0, Math.PI / 2),
    ]);
    const lens = discG(0.095, 32, 0, 0, 0.079, Math.PI / 2);
    const leds = merge([[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * 0.055, Math.sin((i * Math.PI) / 3) * 0.055])].map(([x, y]) => discG(0.02, 16, x, y, 0.083, Math.PI / 2)));
    const yoke = hanging
      ? merge([
          boxG(0.07, 0.06, 0.08, 0, 0.0, 0),
          cylG(0.012, 0.012, 0.06, 8, 0, -0.05, 0),
          boxG(0.29, 0.012, 0.05, 0, -0.08, 0),
          boxG(0.012, 0.2, 0.05, -0.14, -0.18, 0),
          boxG(0.012, 0.2, 0.05, 0.14, -0.18, 0),
        ])
      : merge([
          rboxG(0.24, 0.025, 0.2, 0.008, 0, 0.0125, 0),
          cylG(0.018, 0.018, 0.065, 10, 0, 0.0575, 0),
          boxG(0.29, 0.012, 0.05, 0, 0.09, 0),
          boxG(0.012, 0.2, 0.05, -0.14, 0.185, 0),
          boxG(0.012, 0.2, 0.05, 0.14, 0.185, 0),
        ]);
    return { head, lens, leds, yoke };
  });
}

export function makeFixture(hanging) {
  const g = parGeos(hanging);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 2, roughness: 0.3 });
  ledMat.userData.own = true;
  const head = group('Head', mesh(g.head, M.fixture), mesh(g.lens, M.lens, { cast: false }), mesh(g.leds, ledMat, { cast: false }));
  head.position.y = hanging ? -0.25 : 0.26;
  const spot = new THREE.SpotLight(0xffffff, 0, 0, 0.3, 0.4, 2);
  spot.position.set(0, 0, 0.09);
  spot.target.position.set(0, 0, 1.09);
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.15;
  spot.shadow.camera.far = 35;
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.025;
  head.add(spot, spot.target);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, opacity: { value: 0 }, soft: { value: 0.4 } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  beamMat.userData.own = true;
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.z = 0.085;
  beam.userData.isBeam = true;
  beam.raycast = () => {};
  beam.castShadow = beam.receiveShadow = false;
  beam.renderOrder = 10;
  head.add(beam);
  const root = group(hanging ? 'Rig spotlight' : 'Floor spotlight', mesh(g.yoke, M.fixture), head);
  root.userData.fixture = { head, spot, ledMat, beam, beamMat };
  return root;
}

export { DEG };
