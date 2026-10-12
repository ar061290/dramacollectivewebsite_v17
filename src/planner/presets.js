// Presets for every part of the design, plus whole-scene presets.
// Category presets replace only their own kind of item and leave the rest of the design alone.
import { TYPES } from './items.js';
import { uid, aimAngles } from './util.js';
import { RIG } from './rig.js';

const RIG_H = 5.2;
const RIG_CLAMP_Y = RIG_H - RIG.section / 2 - 0.02;

export function mk(type, x, y, z, rot = 0, props = {}) {
  return { id: uid(type), type, x, y, z, rot, props: { ...TYPES[type].defaults(), ...props } };
}
const P = (x, y, z) => ({ x, y, z });

function floorSpot(x, y, z, target, props) {
  const a = aimAngles(P(x, y + 0.26, z), target);
  return mk('floorspot', x, y, z, a.pan, { ...props, tilt: a.tilt });
}
function rigSpot(x, z, target, props) {
  const a = aimAngles(P(x, RIG_CLAMP_Y - 0.25, z), target);
  return mk('rigspot', x, RIG_CLAMP_Y, z, a.pan, { ...props, tilt: a.tilt });
}
function replace(state, types, items) {
  state.items = state.items.filter((it) => !types.includes(it.type)).concat(items);
}
const range = (a, b, step) => {
  const out = [];
  for (let v = a; v <= b + 1e-6; v += step) out.push(Math.round(v * 100) / 100);
  return out;
};

export const SEAT = (o = {}) => ({
  layout: 'straight', blocks: 2, rows: 10, seatsPerRow: 10, seatSpacing: 0.55, rowSpacing: 0.95,
  aisle: 2.4, frontGap: 2.5, offsetX: 0, carpet: true, removed: [], ...o,
});

// ---------- item sets used by several presets ----------
const SETS = {
  stairsCentre: () => [mk('stairs', -0.4, 0, 0.4), mk('stairs', 0.4, 0, 0.4)],
  stairsCorners: () => [mk('stairs', -3.0, 0, 0.4), mk('stairs', 3.0, 0, 0.4)],
  stairsSides: () => [mk('stairs', -3.9, 0, -1.0, -90), mk('stairs', 3.9, 0, -1.0, 90)],
  stairsRunway: () => [mk('stairs', -0.4, 0, 7.4), mk('stairs', 0.4, 0, 7.4)],
  runway: () => range(0.5, 6.5, 1).flatMap((z) => [-0.5, 0.5].flatMap((x) => [mk('riser', x, 0, z), mk('riser', x, 0.5, z)])),
  thrust: () => range(-3, 3, 1).flatMap((x) => [0.5, 1.5].map((z) => mk('riser', x, 0, z))),
  levels: () => [
    ...range(-3, 3, 1).flatMap((x) => [mk('riser', x, 1, -3.5), mk('riser', x, 1.5, -3.5)]),
    ...range(-3, 3, 1).map((x) => mk('riser', x, 1, -2.5)),
  ],
  wings: () => [-5, -4, 4, 5].flatMap((x) => [-3.5, -2.5, -1.5].flatMap((z) => [mk('riser', x, 0, z), mk('riser', x, 0.5, z)])),
  band: () => [
    mk('riser', -0.5, 1, -3.5), mk('riser', 0.5, 1, -3.5), mk('riser', -0.5, 1, -2.5), mk('riser', 0.5, 1, -2.5),
    mk('riser', 2.5, 1, -3.5), mk('riser', 2.5, 1, -2.5),
  ],
  frontWash: () => [-3.5, -2.1, -0.7, 0.7, 2.1, 3.5].map((x) => rigSpot(x, RIG.z1, P(x * 0.8, 2.0, -1.9), { color: '#ffe2b8', intensity: 85, beam: 32, soft: 55 })),
  backlight: () => [-3.2, -1.6, 0, 1.6, 3.2].map((x) => rigSpot(x, RIG.z0, P(x * 0.9, 1, -0.8), { color: '#2f6bff', intensity: 75, beam: 30, soft: 45 })),
  special: () => [rigSpot(0, RIG.z1, P(0, 1, -1.8), { color: '#ffffff', intensity: 100, beam: 12, soft: 15 })],
  colourWash: () => {
    const cols = ['#ff3344', '#3366ff', '#ffaa33', '#33ff99', '#cc44ff'];
    return [
      ...[-3.2, -1.6, 0, 1.6, 3.2].map((x, i) => rigSpot(x, RIG.z1, P(x, 1, -1.8), { color: cols[i], intensity: 85, beam: 30, soft: 50 })),
      ...[-3.2, -1.6, 0, 1.6, 3.2].map((x, i) => rigSpot(x, RIG.z0, P(x * 0.8, 1, -1.2), { color: cols[(i + 2) % 5], intensity: 80, beam: 30, soft: 50 })),
    ];
  },
  runwayRig: () => [1.5, 3, 4.5, 6].map((z, i) => rigSpot([-2.1, -0.7, 0.7, 2.1][i], RIG.z1, P(0, 1, z), { color: '#f4f7ff', intensity: 100, beam: 20, soft: 40 })),
  floorFront: () => [[-3, 1.7], [-1, 1.9], [1, 1.9], [3, 1.7]].map(([x, z]) => floorSpot(x, 0, z, P(x * 0.8, 1.7, -1.6), { color: '#ffd9a0', intensity: 80, beam: 30, soft: 50 })),
  floorUp: () => range(-3, 3, 1.2).map((x) => floorSpot(x, 1, -3.6, P(x * 1.4, 6.5, 0.5), { color: '#3a5bff', intensity: 90, beam: 14, soft: 30 })),
  footlights: () => range(-3, 3, 1).map((x) => floorSpot(x, 1, -0.2, P(x, 2.2, -2.6), { color: '#ffb54a', intensity: 55, beam: 40, soft: 70 })),
  floorCross: () => [
    floorSpot(-5.5, 0, -0.5, P(0, 1.6, -2), { color: '#ff3fb4', intensity: 90, beam: 28, soft: 45 }),
    floorSpot(5.5, 0, -0.5, P(0, 1.6, -2), { color: '#3fd5ff', intensity: 90, beam: 28, soft: 45 }),
  ],
  speakersStereo: () => [mk('speaker', -4.3, 0, 0.6, 8), mk('speaker', 4.3, 0, 0.6, -8)],
  speakersRear: () => [mk('speaker', -8.2, 0, 18.8, 140), mk('speaker', 8.2, 0, 18.8, -140)],
  speakersDelay: () => [mk('speaker', -8.4, 0, 9, 45), mk('speaker', 8.4, 0, 9, -45)],
  boxset: (img, w, d, h, side = img) => [mk('boxset', 0, 1, -3.9 + d / 2, 0, { w, d, h, back: img, left: side, right: side })],
  dinner: () => [
    mk('table', 0, 1, -1.8, 0, { style: 'dining', wood: 'walnut' }),
    mk('chair', -0.35, 1, -2.4, 0), mk('chair', 0.35, 1, -2.4, 0),
    mk('chair', -0.95, 1, -1.8, 90), mk('chair', 0.95, 1, -1.8, -90),
  ],
  classroom: () =>
    [-2, 0, 2].flatMap((x) => [-1.3, -2.7].flatMap((z) => [mk('table', x, 1, z, 0, { style: 'desk', wood: 'oak' }), mk('chair', x, 1, z - 0.5, 0, { style: 'plastic' })])),
  panel: () => [
    mk('table', 0, 1, -1.5, 0, { style: 'banquet', cloth: 'white' }),
    ...[-0.6, 0, 0.6].map((x) => mk('chair', x, 1, -2.1, 0, { style: 'plastic' })),
  ],
  cafe: () => [
    mk('table', -1.6, 1, -1.8, 0, { style: 'round', wood: 'teak' }),
    mk('chair', -2.25, 1, -1.8, 90, { wood: 'teak' }), mk('chair', -0.95, 1, -1.8, -90, { wood: 'teak' }),
    mk('table', 1.6, 1, -2.3, 0, { style: 'round', wood: 'teak', cloth: 'red' }),
    mk('chair', 0.95, 1, -2.3, 90, { wood: 'teak' }), mk('chair', 2.25, 1, -2.3, -90, { wood: 'teak' }),
  ],
  livingFurniture: () => [
    mk('table', 0, 1, -1.9, 0, { style: 'round', wood: 'walnut', cloth: 'gold' }),
    mk('chair', -1.3, 1, -2.1, 35, { style: 'armchair', fabric: '#7a1f2b' }),
    mk('chair', 1.3, 1, -2.1, -35, { style: 'armchair', fabric: '#7a1f2b' }),
    mk('chair', 0, 1, -2.9, 0, { style: 'wooden', wood: 'walnut' }),
  ],
};

export const PRESETS = {
  seating: [
    { id: 'centre', name: 'Centre aisle', desc: 'Two blocks either side of a red carpet aisle, like the hall photo.', apply: (s) => { s.seating = SEAT(); } },
    { id: 'runway', name: 'Runway sides', desc: 'Two blocks with a wide gap for a catwalk.', apply: (s) => { s.seating = SEAT({ rows: 8, seatsPerRow: 9, aisle: 3.2, frontGap: 0.6, carpet: false }); } },
    { id: 'three', name: 'Three blocks', desc: 'Three blocks and two aisles.', apply: (s) => { s.seating = SEAT({ blocks: 3, rows: 12, seatsPerRow: 8, aisle: 1.3 }); } },
    { id: 'curved', name: 'Curved rows', desc: 'Rows bend around the stage.', apply: (s) => { s.seating = SEAT({ layout: 'curved', blocks: 3, rows: 9, seatsPerRow: 5, aisle: 1.2, frontGap: 3 }); } },
    { id: 'studio', name: 'Studio, 60 seats', desc: 'A small audience close to the stage.', apply: (s) => { s.seating = SEAT({ rows: 5, seatsPerRow: 6, aisle: 1.6, frontGap: 3 }); } },
    { id: 'full', name: 'Full house', desc: 'Fill the hall wall to wall.', apply: (s) => { s.seating = SEAT({ rows: 17, seatsPerRow: 13, aisle: 1.8, frontGap: 2 }); } },
    { id: 'none', name: 'No seating', desc: 'An open floor.', apply: (s) => { s.seating = SEAT({ rows: 0 }); } },
  ],
  risers: [
    { id: 'runway', name: 'T-runway', desc: '2 m wide catwalk, 7 m long, two risers high to match the stage.', apply: (s) => replace(s, ['riser'], SETS.runway()) },
    { id: 'thrust', name: 'Low thrust', desc: '7 × 2 m apron in front of the stage at 0.5 m.', apply: (s) => replace(s, ['riser'], SETS.thrust()) },
    { id: 'levels', name: 'Stepped levels', desc: 'Two tiers across the back of the stage.', apply: (s) => replace(s, ['riser'], SETS.levels()) },
    { id: 'wings', name: 'Side wings', desc: '2 × 3 m extensions on both sides at stage height.', apply: (s) => replace(s, ['riser'], SETS.wings()) },
    { id: 'band', name: 'Band risers', desc: 'Drum and keyboard platforms on the stage.', apply: (s) => replace(s, ['riser'], SETS.band()) },
    { id: 'none', name: 'Remove risers', desc: '', apply: (s) => replace(s, ['riser'], []) },
  ],
  stairs: [
    { id: 'centre', name: 'Centre pair', desc: 'Two blocks at the front centre.', apply: (s) => replace(s, ['stairs'], SETS.stairsCentre()) },
    { id: 'corners', name: 'Front corners', desc: 'One block at each front corner.', apply: (s) => replace(s, ['stairs'], SETS.stairsCorners()) },
    { id: 'sides', name: 'Both sides', desc: 'Climb onto the stage from the wings.', apply: (s) => replace(s, ['stairs'], SETS.stairsSides()) },
    { id: 'runway', name: 'Runway end', desc: 'Steps down from the end of a T-runway.', apply: (s) => replace(s, ['stairs'], SETS.stairsRunway()) },
    { id: 'none', name: 'Remove stairs', desc: '', apply: (s) => replace(s, ['stairs'], []) },
  ],
  led: [
    { id: 'founders', name: "Founder's Day", desc: '', apply: (s) => { s.led = { on: true, image: 'founders', brightness: 0.8 }; } },
    { id: 'welcome', name: 'Welcome slide', desc: '', apply: (s) => { s.led = { on: true, image: 'welcome', brightness: 0.75 }; } },
    { id: 'night', name: 'Starry night', desc: '', apply: (s) => { s.led = { on: true, image: 'night', brightness: 0.6 }; } },
    { id: 'sunset', name: 'Sunset', desc: '', apply: (s) => { s.led = { on: true, image: 'sunset', brightness: 0.75 }; } },
    { id: 'forest', name: 'Forest', desc: '', apply: (s) => { s.led = { on: true, image: 'forest', brightness: 0.7 }; } },
    { id: 'city', name: 'City at night', desc: '', apply: (s) => { s.led = { on: true, image: 'city', brightness: 0.8 }; } },
    { id: 'palace', name: 'Palace', desc: '', apply: (s) => { s.led = { on: true, image: 'palace', brightness: 0.7 }; } },
    { id: 'drapes', name: 'Red drapes', desc: '', apply: (s) => { s.led = { on: true, image: 'drapes', brightness: 0.7 }; } },
    { id: 'waves', name: 'Colour waves', desc: '', apply: (s) => { s.led = { on: true, image: 'waves', brightness: 0.9 }; } },
    { id: 'off', name: 'Screen off', desc: '', apply: (s) => { s.led = { ...s.led, on: false }; } },
  ],
  boxsets: [
    { id: 'living', name: 'Living room', desc: '5.4 × 3.2 m, 3.2 m high.', apply: (s) => replace(s, ['boxset'], SETS.boxset('living', 5.4, 3.2, 3.2)) },
    { id: 'classroom', name: 'Classroom', desc: '6.2 × 3.4 m, 3.2 m high.', apply: (s) => replace(s, ['boxset'], SETS.boxset('classroom', 6.2, 3.4, 3.2, 'paintwall')) },
    { id: 'palace', name: 'Palace hall', desc: '6.6 × 3.6 m, 4 m high.', apply: (s) => replace(s, ['boxset'], SETS.boxset('palace', 6.6, 3.6, 4)) },
    { id: 'library', name: 'Library', desc: '5 × 3 m, 3.5 m high.', apply: (s) => replace(s, ['boxset'], SETS.boxset('library', 5, 3, 3.5)) },
    { id: 'village', name: 'Village home', desc: '4.2 × 2.8 m, 2.8 m high.', apply: (s) => replace(s, ['boxset'], SETS.boxset('village', 4.2, 2.8, 2.8)) },
    { id: 'castle', name: 'Castle', desc: '6 × 3.4 m, 3.6 m high.', apply: (s) => replace(s, ['boxset'], SETS.boxset('stone', 6, 3.4, 3.6)) },
    { id: 'none', name: 'Remove box sets', desc: '', apply: (s) => replace(s, ['boxset'], []) },
  ],
  tables: [
    { id: 'dinner', name: 'Dinner for four', desc: 'Dining table with four chairs.', apply: (s) => replace(s, ['table', 'chair'], SETS.dinner()) },
    { id: 'classroom', name: 'Classroom desks', desc: 'Six desks with chairs.', apply: (s) => replace(s, ['table', 'chair'], SETS.classroom()) },
    { id: 'panel', name: 'Panel discussion', desc: 'Clothed table with three chairs.', apply: (s) => replace(s, ['table', 'chair'], SETS.panel()) },
    { id: 'cafe', name: 'Café', desc: 'Two round tables for two.', apply: (s) => replace(s, ['table', 'chair'], SETS.cafe()) },
    { id: 'none', name: 'Remove tables', desc: '', apply: (s) => replace(s, ['table'], []) },
  ],
  chairs: [
    { id: 'row', name: 'Row of five', desc: '', apply: (s) => replace(s, ['chair'], range(-2, 2, 1).map((x) => mk('chair', x, 1, -1.5, 0))) },
    {
      id: 'semi', name: 'Semicircle of seven', desc: '',
      apply: (s) => replace(s, ['chair'], range(-72, 72, 24).map((d) => {
        const a = (d * Math.PI) / 180;
        return mk('chair', Math.sin(a) * 2, 1, -1.2 - Math.cos(a) * 2, -d);
      })),
    },
    { id: 'interview', name: 'Interview pair', desc: '', apply: (s) => replace(s, ['chair'], [mk('chair', -0.9, 1, -1.6, 30, { style: 'armchair', fabric: '#2f5d50' }), mk('chair', 0.9, 1, -1.6, -30, { style: 'armchair', fabric: '#2f5d50' })]) },
    { id: 'court', name: 'Royal court', desc: '', apply: (s) => replace(s, ['chair'], [mk('chair', 0, 1, -3.2, 0, { style: 'throne', fabric: '#7a1f2b' }), mk('chair', -2, 1, -2.2, 60), mk('chair', 2, 1, -2.2, -60)]) },
    { id: 'none', name: 'Remove chairs', desc: '', apply: (s) => replace(s, ['chair'], []) },
  ],
  lockers: [
    { id: 'corridor', name: 'School corridor', desc: 'Four 15-door units along the back.', apply: (s) => replace(s, ['locker'], [-1.35, -0.45, 0.45, 1.35].map((x) => mk('locker', x, 1, -3.6, 0, { doors: '3x5' }))) },
    { id: 'changing', name: 'Changing room', desc: 'Two units facing in from each side.', apply: (s) => replace(s, ['locker'], [-2.6, -1.7].flatMap((z) => [mk('locker', -3.2, 1, z, 90), mk('locker', 3.2, 1, z, -90)])) },
    { id: 'single', name: 'Single unit', desc: 'One 9-door unit upstage left.', apply: (s) => replace(s, ['locker'], [mk('locker', -2.6, 1, -3.5)]) },
    { id: 'none', name: 'Remove lockers', desc: '', apply: (s) => replace(s, ['locker'], []) },
  ],
  speakers: [
    { id: 'stereo', name: 'Stereo pair', desc: 'Either side of the stage front.', apply: (s) => replace(s, ['speaker'], SETS.speakersStereo()) },
    { id: 'four', name: 'Four corners', desc: 'Stereo pair plus two at the back.', apply: (s) => replace(s, ['speaker'], [...SETS.speakersStereo(), ...SETS.speakersRear()]) },
    { id: 'delay', name: 'With delay pair', desc: 'Stereo pair plus two halfway down the hall.', apply: (s) => replace(s, ['speaker'], [...SETS.speakersStereo(), ...SETS.speakersDelay()]) },
    { id: 'none', name: 'Remove speakers', desc: '', apply: (s) => replace(s, ['speaker'], []) },
  ],
  floorspots: [
    { id: 'front', name: 'Front wash', desc: 'Four warm spots on the floor, aimed at the stage.', apply: (s) => replace(s, ['floorspot'], SETS.floorFront()) },
    { id: 'up', name: 'Stage uplights', desc: 'Six narrow blue beams rising from the back of the stage.', apply: (s) => replace(s, ['floorspot'], SETS.floorUp()) },
    { id: 'foot', name: 'Footlights', desc: 'Seven amber lights along the stage edge.', apply: (s) => replace(s, ['floorspot'], SETS.footlights()) },
    { id: 'cross', name: 'Side cross', desc: 'Magenta and cyan from the sides.', apply: (s) => replace(s, ['floorspot'], SETS.floorCross()) },
    { id: 'none', name: 'Remove floor spots', desc: '', apply: (s) => replace(s, ['floorspot'], []) },
  ],
  rigspots: [
    { id: 'wash', name: 'Warm front wash', desc: 'Six lights on the front bar covering the stage.', apply: (s) => { s.rig.on = true; replace(s, ['rigspot'], SETS.frontWash()); } },
    { id: 'colour', name: 'Colour wash', desc: 'Ten coloured lights on the front and back bars.', apply: (s) => { s.rig.on = true; replace(s, ['rigspot'], SETS.colourWash()); } },
    { id: 'special', name: 'Centre special', desc: 'One tight white beam on centre stage.', apply: (s) => { s.rig.on = true; replace(s, ['rigspot'], SETS.special()); } },
    { id: 'back', name: 'Blue backlight', desc: 'Five lights on the back bar.', apply: (s) => { s.rig.on = true; replace(s, ['rigspot'], SETS.backlight()); } },
    { id: 'full', name: 'Full rig', desc: 'Front wash, blue backlight and a centre special.', apply: (s) => { s.rig.on = true; replace(s, ['rigspot'], [...SETS.frontWash(), ...SETS.backlight(), ...SETS.special()]); } },
    { id: 'none', name: 'Remove rig lights', desc: '', apply: (s) => replace(s, ['rigspot'], []) },
  ],
  house: [
    { id: 'full', name: 'Full', desc: '', apply: (s) => { s.house = { on: true, level: 1, temp: 4200 }; } },
    { id: 'preshow', name: 'Pre-show 40 %', desc: '', apply: (s) => { s.house = { on: true, level: 0.4, temp: 3500 }; } },
    { id: 'show', name: 'Show (off)', desc: '', apply: (s) => { s.house = { ...s.house, on: false }; } },
    { id: 'warm', name: 'Warm 3000 K', desc: '', apply: (s) => { s.house = { on: true, level: 0.8, temp: 3000 }; } },
    { id: 'cool', name: 'Daylight 6000 K', desc: '', apply: (s) => { s.house = { on: true, level: 0.9, temp: 6000 }; } },
  ],
};

export function baseState() {
  return {
    version: 1,
    house: { on: true, level: 0.8, temp: 4200 },
    haze: { on: false, density: 0.6 },
    led: { on: true, image: 'founders', brightness: 0.8 },
    rig: { on: true, height: RIG_H, midBar: false },
    seating: SEAT(),
    items: [],
    camera: null,
  };
}

const scene = (id, name, desc, build) => ({
  id, name, desc,
  apply: (s) => {
    const b = baseState();
    build(b);
    Object.assign(s, b);
  },
});

PRESETS.scenes = [
  scene('founders', "Founder's Day", 'Title on the LED wall, warm front wash, centre stairs and a full centre-aisle audience.', (s) => {
    s.house = { on: true, level: 0.55, temp: 4000 };
    s.items = [...SETS.stairsCentre(), ...SETS.frontWash(), ...SETS.backlight().slice(1, 4), ...SETS.speakersStereo()];
  }),
  scene('runway', 'Fashion show', 'T-runway at stage height with seats on both sides, haze and cool runway light.', (s) => {
    s.led = { on: true, image: 'waves', brightness: 0.9 };
    s.house = { on: true, level: 0.25, temp: 5000 };
    s.haze = { on: true, density: 0.5 };
    s.seating = SEAT({ rows: 8, seatsPerRow: 9, aisle: 3.2, frontGap: 0.6, carpet: false });
    s.items = [...SETS.runway(), ...SETS.stairsRunway(), ...SETS.runwayRig(), ...SETS.backlight(), ...SETS.speakersStereo(),
      ...[-0.6, 0, 0.6].map((x) => mk('chair', x, 0, 8.6, 180, { style: 'plastic' }))];
  }),
  scene('seminar', 'Talk or seminar', 'Welcome slide, panel table and house lights up, like the hall photos.', (s) => {
    s.led = { on: true, image: 'welcome', brightness: 0.75 };
    s.house = { on: true, level: 1, temp: 4200 };
    s.seating = SEAT({ rows: 12 });
    s.items = [...SETS.panel(), ...SETS.frontWash(), ...SETS.stairsCorners(), ...SETS.speakersStereo()];
  }),
  scene('living', 'Drawing-room drama', 'Box set living room, armchairs, warm front light and blue backlight.', (s) => {
    s.led = { on: false, image: 'night', brightness: 0.6 };
    s.house = { on: false, level: 0.6, temp: 3500 };
    s.seating = SEAT({ layout: 'curved', blocks: 3, rows: 9, seatsPerRow: 5, aisle: 1.2, frontGap: 3 });
    s.items = [...SETS.boxset('living', 5.4, 3.2, 3.2), ...SETS.livingFurniture(), ...SETS.frontWash(), ...SETS.backlight(), ...SETS.floorCross(), ...SETS.stairsSides(), ...SETS.speakersStereo()];
  }),
  scene('school', 'School play', 'Classroom box set with desks, chairs and lockers.', (s) => {
    s.led = { on: false, image: 'clouds', brightness: 0.7 };
    s.house = { on: false, level: 0.6, temp: 4000 };
    s.seating = SEAT({ blocks: 3, rows: 12, seatsPerRow: 8, aisle: 1.3 });
    s.items = [...SETS.boxset('classroom', 6.2, 3.4, 3.2, 'paintwall'), ...SETS.classroom(),
      mk('locker', -2.75, 1, -3.0, 90, { doors: '3x5' }), mk('locker', -2.75, 1, -2.1, 90, { doors: '3x5' }),
      ...SETS.frontWash(), ...SETS.floorFront(), ...SETS.special(), ...SETS.stairsCentre(), ...SETS.speakersStereo()];
  }),
  scene('concert', 'Concert night', 'Band risers, colour wash, uplight beams in haze and four speakers.', (s) => {
    s.led = { on: true, image: 'city', brightness: 0.85 };
    s.house = { on: false, level: 0.6, temp: 4000 };
    s.haze = { on: true, density: 0.7 };
    s.seating = SEAT({ rows: 0 });
    s.items = [...SETS.band(), ...SETS.colourWash(), ...SETS.floorUp(), ...SETS.speakersStereo(), ...SETS.speakersRear(), ...SETS.stairsCorners()];
  }),
  scene('empty', 'Empty hall', 'Just the stage, the house lights and a centre-aisle audience.', (s) => {
    s.led = { on: false, image: 'founders', brightness: 0.8 };
    s.rig = { on: false, height: RIG_H, midBar: false };
    s.house = { on: true, level: 1, temp: 4200 };
  }),
];

export function defaultState() {
  const s = baseState();
  PRESETS.scenes[0].apply(s);
  return s;
}
