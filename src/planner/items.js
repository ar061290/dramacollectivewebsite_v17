// Item types that can be placed, and the manager that keeps the 3D scene in step with the design state.
import * as THREE from 'three';
import { makeStairs, makeRiser, makeBoxSet, makeTable, makeChair, makeLocker, makeSpeaker, makeFixture, WOODS, CLOTHS } from './models.js';
import { disposeTree, DEG, clamp } from './util.js';

// Peak candela at 100 % for a 25 degree beam. Wider beams spread the same output.
const PEAK = { floor: 220, rig: 400 };

const woodOptions = Object.keys(WOODS).map((k) => [k, k[0].toUpperCase() + k.slice(1)]);
const clothOptions = Object.keys(CLOTHS).map((k) => [k, k === 'none' ? 'No cloth' : k[0].toUpperCase() + k.slice(1)]);

const TABLE_SIZES = { dining: [1.4, 0.8], round: [0.9, 0.9], desk: [1.0, 0.55], banquet: [1.8, 0.75] };
const CHAIR_SIZES = { wooden: [0.44, 0.42, 0.95], plastic: [0.46, 0.46, 0.85], armchair: [0.82, 0.8, 0.9], stool: [0.4, 0.4, 0.66], throne: [0.76, 0.65, 1.9] };

const fixtureFields = (tiltMin, tiltMax) => [
  { key: 'color', label: 'Colour', type: 'color' },
  { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'beam', label: 'Beam spread', type: 'range', min: 6, max: 60, step: 1, unit: '°' },
  { key: 'soft', label: 'Diffusion (soft edge)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'tilt', label: 'Tilt', type: 'range', min: tiltMin, max: tiltMax, step: 1, unit: '°' },
];

export const TYPES = {
  stairs: {
    label: 'Stair block', cat: 'stage', support: true, snap: 0.1,
    size: () => ({ w: 0.8, d: 0.8, h: 0.8 }),
    defaults: () => ({}),
    create: () => makeStairs(),
    fields: [],
    note: '0.8 m cube with four 0.2 m steps. The steps climb toward the back of the block.',
  },
  riser: {
    label: 'Riser', cat: 'stage', support: true, snap: 0.5,
    size: () => ({ w: 1, d: 1, h: 0.5 }),
    defaults: () => ({ top: 'black', skirt: true }),
    create: (p) => makeRiser(p),
    fields: [
      { key: 'top', label: 'Top finish', type: 'segmented', options: [['black', 'Black'], ['blue', 'Blue'], ['grey', 'Grey']] },
      { key: 'skirt', label: 'Black skirt', type: 'switch' },
    ],
    note: '1 × 1 m deck, 0.5 m high. Stack two to reach stage height.',
  },
  boxset: {
    label: 'Box set', cat: 'stage', snap: 0.1,
    size: (p) => ({ w: p.w, d: p.d, h: p.h }),
    defaults: () => ({ w: 5, d: 3, h: 3, back: 'living', left: 'living', right: 'living', frame: 'black' }),
    create: (p, ctx) => makeBoxSet(p, () => ctx.invalidate(true)),
    fields: [
      { key: 'w', label: 'Width', type: 'range', min: 2, max: 7, step: 0.1, unit: ' m' },
      { key: 'd', label: 'Depth', type: 'range', min: 1.5, max: 4, step: 0.1, unit: ' m' },
      { key: 'h', label: 'Height', type: 'range', min: 2, max: 4.5, step: 0.1, unit: ' m' },
      { key: 'back', label: 'Back wall print', type: 'image', use: 'set' },
      { key: 'left', label: 'Left wall print', type: 'image', use: 'set' },
      { key: 'right', label: 'Right wall print', type: 'image', use: 'set' },
      { key: 'frame', label: 'Frame', type: 'segmented', options: [['black', 'Black'], ['alu', 'Aluminium']] },
    ],
    note: 'Three printed flex walls, open to the audience.',
  },
  table: {
    label: 'Table', cat: 'props', snap: 0.05,
    size: (p) => ({ w: TABLE_SIZES[p.style][0], d: TABLE_SIZES[p.style][1], h: 0.76 }),
    defaults: () => ({ style: 'dining', wood: 'oak', cloth: 'none' }),
    create: (p) => makeTable(p),
    fields: [
      { key: 'style', label: 'Style', type: 'select', options: [['dining', 'Dining table 1.4 × 0.8 m'], ['round', 'Round table ⌀ 0.9 m'], ['desk', 'School desk 1.0 × 0.55 m'], ['banquet', 'Folding table 1.8 × 0.75 m']] },
      { key: 'wood', label: 'Wood finish', type: 'select', options: woodOptions },
      { key: 'cloth', label: 'Tablecloth', type: 'select', options: clothOptions },
    ],
  },
  chair: {
    label: 'Chair', cat: 'props', snap: 0.05,
    size: (p) => ({ w: CHAIR_SIZES[p.style][0], d: CHAIR_SIZES[p.style][1], h: CHAIR_SIZES[p.style][2] }),
    defaults: () => ({ style: 'wooden', wood: 'walnut', fabric: '#7a1f2b' }),
    create: (p) => makeChair(p),
    fields: [
      { key: 'style', label: 'Style', type: 'select', options: [['wooden', 'Wooden chair'], ['plastic', 'Black plastic chair'], ['armchair', 'Armchair'], ['stool', 'Stool'], ['throne', 'Throne']] },
      { key: 'wood', label: 'Wood finish', type: 'select', options: woodOptions, when: (p) => ['wooden', 'stool', 'armchair'].includes(p.style) },
      { key: 'fabric', label: 'Upholstery', type: 'swatch', options: ['#7a1f2b', '#2f5d50', '#2b3f73', '#c49a3c', '#5a4636', '#1d1d1f'], when: (p) => ['armchair', 'throne'].includes(p.style) },
    ],
  },
  locker: {
    label: 'Lockers', cat: 'props', snap: 0.05,
    size: () => ({ w: 0.9, d: 0.5, h: 1.8 }),
    defaults: () => ({ doors: '3x3' }),
    create: (p) => makeLocker(p),
    fields: [{ key: 'doors', label: 'Door layout', type: 'segmented', options: [['3x3', '9 doors'], ['3x5', '15 doors']] }],
    note: 'One welded steel unit, 0.9 × 1.8 × 0.5 m. Size and colour are fixed.',
  },
  speaker: {
    label: 'Column speaker', cat: 'sound', snap: 0.05, rotLabel: 'Facing',
    size: () => ({ w: 0.32, d: 0.3, h: 2.3 }),
    defaults: () => ({ height: 2.3, tilt: 0, finish: 'black' }),
    live: ['tilt'],
    create: (p) => makeSpeaker(p),
    pose: (obj, it) => { obj.userData.pivot.rotation.x = -it.props.tilt * DEG; },
    fields: [
      { key: 'height', label: 'Height', type: 'range', min: 2, max: 2.5, step: 0.1, unit: ' m' },
      { key: 'tilt', label: 'Tilt', type: 'range', min: -20, max: 20, step: 1, unit: '°' },
      { key: 'finish', label: 'Finish', type: 'segmented', options: [['black', 'Black'], ['white', 'White']] },
    ],
  },
  floorspot: {
    label: 'Floor spotlight', cat: 'lights', fixture: true, snap: 0.05, rotLabel: 'Pan',
    size: () => ({ w: 0.3, d: 0.25, h: 0.38 }),
    defaults: () => ({ color: '#ffd9a0', intensity: 75, beam: 25, soft: 40, tilt: 20 }),
    live: ['color', 'intensity', 'beam', 'soft', 'tilt'],
    create: () => makeFixture(false),
    fields: fixtureFields(-20, 90),
    note: 'RGB LED par on a floor stand. Works on the floor, the stage or any riser.',
  },
  rigspot: {
    label: 'Rig spotlight', cat: 'lights', fixture: true, rig: true, snap: 0, rotLabel: 'Pan',
    size: () => ({ w: 0.3, d: 0.25, h: 0.38 }),
    defaults: () => ({ color: '#fff1d6', intensity: 80, beam: 26, soft: 35, tilt: -65 }),
    live: ['color', 'intensity', 'beam', 'soft', 'tilt'],
    create: () => makeFixture(true),
    fields: fixtureFields(-90, 30),
    note: 'Clamped to the truss. Drag it along any bar of the rig.',
  },
};

export function footprint(it) {
  const s = TYPES[it.type].size(it.props);
  const r = (it.rot || 0) * DEG;
  const c = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r));
  return { hx: (s.w * c + s.d * sn) / 2, hz: (s.w * sn + s.d * c) / 2, h: s.h };
}

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ray = new THREE.Raycaster();

export function createItems(ctx) {
  const root = new THREE.Group();
  root.name = 'Items';
  const recs = new Map();
  const tmpColor = new THREE.Color();

  const keyOf = (it) => {
    const p = { ...it.props };
    (TYPES[it.type].live || []).forEach((k) => delete p[k]);
    return JSON.stringify(p);
  };

  function applyFixture(obj, t, p, env) {
    const f = obj.userData.fixture;
    const beamDeg = clamp(p.beam, 4, 80);
    const on = obj.visible !== false;
    f.head.rotation.x = -p.tilt * DEG;
    tmpColor.set(p.color);
    f.spot.color.copy(tmpColor);
    f.spot.intensity = (t.rig ? PEAK.rig : PEAK.floor) * (p.intensity / 100) * Math.pow(25 / beamDeg, 0.8);
    f.spot.angle = (beamDeg / 2) * DEG;
    f.spot.penumbra = clamp(p.soft / 100, 0, 1);
    f.ledMat.emissive.copy(tmpColor);
    f.ledMat.emissiveIntensity = p.intensity > 0 ? 0.4 + (p.intensity / 100) * 7 : 0;
    f.beamMat.uniforms.color.value.copy(tmpColor);
    f.beamMat.uniforms.soft.value = p.soft / 100;
    f.beamMat.uniforms.opacity.value = env.haze.on ? env.haze.density * (p.intensity / 100) * 0.16 * Math.pow(18 / beamDeg, 0.7) : 0;
    f.beam.visible = on && env.haze.on && p.intensity > 0;
    f.beamDeg = beamDeg;
  }

  function sync(items, env) {
    const seen = new Set();
    let lightsChanged = false;
    for (const it of items) {
      const t = TYPES[it.type];
      if (!t) continue;
      seen.add(it.id);
      let rec = recs.get(it.id);
      const key = keyOf(it);
      if (!rec || rec.key !== key) {
        if (rec) {
          root.remove(rec.obj);
          disposeTree(rec.obj);
        }
        const obj = t.create(it.props, ctx);
        obj.traverse((o) => { o.userData.itemId = it.id; });
        root.add(obj);
        rec = { obj, key, type: it.type };
        recs.set(it.id, rec);
        if (t.fixture) lightsChanged = true;
      }
      const obj = rec.obj;
      if (t.rig) {
        const s = ctx.rig.snap(it.x, it.z);
        obj.position.set(s.x, s.y, s.z);
        if (obj.visible !== env.rigOn) lightsChanged = true;
        obj.visible = env.rigOn;
      } else {
        obj.position.set(it.x, it.y, it.z);
      }
      obj.rotation.y = (it.rot || 0) * DEG;
      if (t.fixture) applyFixture(obj, t, it.props, env);
      t.pose?.(obj, it);
    }
    for (const [id, rec] of recs) {
      if (seen.has(id)) continue;
      root.remove(rec.obj);
      disposeTree(rec.obj);
      recs.delete(id);
      if (TYPES[rec.type].fixture) lightsChanged = true;
    }
    root.updateMatrixWorld(true);
    updateBeams();
    return lightsChanged;
  }

  // Each haze beam ends where its light first hits something solid.
  function updateBeams() {
    const solids = ctx.solidMeshes();
    for (const rec of recs.values()) {
      const f = rec.obj.userData.fixture;
      if (!f || !f.beam.visible) continue;
      f.beam.getWorldPosition(_o);
      f.head.getWorldQuaternion(_q);
      _d.set(0, 0, 1).applyQuaternion(_q);
      _ray.set(_o, _d);
      _ray.far = 30;
      const hit = _ray.intersectObjects(solids.filter((m) => m.userData.itemId !== rec.obj.userData.itemId), false)[0];
      const len = hit ? Math.max(0.3, hit.distance) : 30;
      const r = len * Math.tan((f.beamDeg / 2) * DEG);
      f.beam.scale.set(r, r, len);
    }
  }

  function meshesOf(filter) {
    const out = [];
    for (const rec of recs.values()) {
      if (!rec.obj.visible || !filter(rec)) continue;
      rec.obj.traverse((o) => { if (o.isMesh && !o.userData.isBeam) out.push(o); });
    }
    return out;
  }

  return {
    root,
    sync,
    updateBeams,
    get: (id) => recs.get(id)?.obj,
    supportMeshes: (excludeId) => {
      const out = [];
      for (const [id, rec] of recs) if (id !== excludeId && TYPES[rec.type].support) out.push(...rec.obj.userData.supports);
      return out;
    },
    pickMeshes: () => meshesOf(() => true),
    solidMeshes: () => meshesOf((rec) => !TYPES[rec.type].fixture),
    spotLights: () => {
      const out = [];
      for (const rec of recs.values()) if (rec.obj.userData.fixture && rec.obj.visible) out.push(rec.obj.userData.fixture.spot);
      return out;
    },
  };
}
