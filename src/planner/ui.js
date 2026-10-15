// Panels and controls: top bar, parts library (tabs), inspector, hints and the walk-through HUD.
import { TYPES } from './items.js';
import { PRESETS } from './presets.js';
import { listImages, getThumb, addUpload } from './images.js';
import { hexToRgb, rgbToHex, fmt, clamp } from './util.js';

const ICONS = {
  scenes: '<path d="M3 4h18"/><path d="M5 4v16c2.5-1.5 3.5-5 3.5-9.5"/><path d="M19 4v16c-2.5-1.5-3.5-5-3.5-9.5"/><path d="M3 20h18"/>',
  stage: '<path d="M3 20h4v-4h4v-4h4V8h4V4h2"/><path d="M3 20h18"/>',
  props: '<path d="M7 3v18"/><path d="M7 13h10v8"/><path d="M7 8h7"/>',
  lights: '<path d="M4 20h7"/><path d="M7.5 20v-3.5"/><path d="M4.5 13.5l6-6 4 4-6 6z"/><path d="M14.5 7.5l2.5-2.5"/><path d="M17 10.5l3.5.8M12.5 6l-.8-3.5M16 8l3-3"/>',
  audience: '<path d="M3 9h5v4H3zM9.5 9h5v4h-5zM16 9h5v4h-5z"/><path d="M3 13v4M8 13v4M9.5 13v4M14.5 13v4M16 13v4M21 13v4"/>',
  sound: '<rect x="8" y="2.5" width="8" height="19" rx="1.5"/><circle cx="12" cy="7.5" r="1.7"/><circle cx="12" cy="12.5" r="1.7"/><circle cx="12" cy="17.5" r="1.7"/>',
  stairs: '<path d="M3 20h4v-4h4v-4h4V8h4V4h2"/><path d="M3 20h18"/>',
  riser: '<path d="M4 9l8-4 8 4-8 4z"/><path d="M4 9v6l8 4 8-4V9"/><path d="M12 13v6"/>',
  boxset: '<path d="M4 7l4-3h8l4 3v12H4z"/><path d="M8 4v11h8V4"/><path d="M4 19l4-4M20 19l-4-4"/>',
  table: '<path d="M3 9h18"/><path d="M3 9l2-3h14l2 3"/><path d="M5.5 9v11M18.5 9v11"/>',
  chair: '<path d="M7 3v18"/><path d="M7 13h10v8"/><path d="M7 8h7"/>',
  locker: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9.7 3v18M14.3 3v18M5 9h14M5 15h14"/>',
  speaker: '<rect x="8" y="2.5" width="8" height="19" rx="1.5"/><circle cx="12" cy="7.5" r="1.7"/><circle cx="12" cy="12.5" r="1.7"/><circle cx="12" cy="17.5" r="1.7"/>',
  floorspot: '<path d="M4 20h7"/><path d="M7.5 20v-3.5"/><path d="M4.5 13.5l6-6 4 4-6 6z"/><path d="M14.5 7.5l2.5-2.5"/><path d="M17 10.5l3.5.8M12.5 6l-.8-3.5M16 8l3-3"/>',
  rigspot: '<path d="M3 4h18"/><path d="M12 4v3"/><path d="M8.5 7h7l-1 5h-5z"/><path d="M9.5 12L6 21M14.5 12L18 21"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  dots: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  aim: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  panels: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/>',
  back: '<path d="M15 5l-7 7 7 7"/><path d="M8 12h12"/>',
};
// the Collective's gold mark, for the top bar
const MARK = new URL('../../assets/brand/mark-gold.png', import.meta.url).href;

const GELS = [
  ['#fff1d6', 'Warm white'], ['#f4f7ff', 'Cool white'], ['#ffb54a', 'Amber'], ['#ff3344', 'Red'], ['#ff3fb4', 'Magenta'],
  ['#9b4dff', 'Purple'], ['#2f6bff', 'Blue'], ['#3fd5ff', 'Cyan'], ['#33ff99', 'Green'],
];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export function icon(name) {
  const s = document.createElement('span');
  s.className = 'ic';
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return s;
}

const TABS = [
  ['scenes', 'Scenes'], ['stage', 'Stage'], ['props', 'Props'], ['lights', 'Lighting'], ['audience', 'Audience'], ['sound', 'Sound'],
];

export function createUI(ctx) {
  const $ = (id) => document.getElementById(id);
  const topbar = $('topbar'), library = $('library'), inspector = $('inspector'), hintEl = $('modehint'), toastEl = $('toast'), walkHud = $('walkhud');
  const store = ctx.store;
  const S = () => store.state;
  let tab = 'scenes';
  let editSeats = false;
  let toastTimer = 0;
  let idSeq = 0;
  const nid = (p) => `${p}-${++idSeq}`;

  const findItem = (s, id) => s.items.find((i) => i.id === id);

  // ---------- generic controls ----------
  function sec(title, note, ...body) {
    return h('section', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('h3', { class: 'sec-title' }, title), typeof note === 'string' && note.length < 40 ? h('span', { class: 'stat' }, note) : null),
      typeof note === 'string' && note.length >= 40 ? h('p', { class: 'sec-note' }, note) : null,
      ...body);
  }

  function rangeField({ label, value, min, max, step = 1, unit = '', digits, onInput, onCommit }) {
    const id = nid('rng');
    const d = digits ?? (step < 0.1 ? 2 : step < 1 ? 1 : 0);
    const out = h('span', { class: 'field-val' }, fmt(value, d) + unit);
    const pct = (v) => (((v - min) / (max - min)) * 100).toFixed(1) + '%';
    const input = h('input', { type: 'range', id, min, max, step, value, style: `--pct:${pct(value)}` });
    input.addEventListener('input', () => {
      const v = +input.value;
      out.textContent = fmt(v, d) + unit;
      input.style.setProperty('--pct', pct(v));
      onInput?.(v);
    });
    input.addEventListener('change', () => onCommit?.(+input.value));
    return h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('label', { class: 'field-label', for: id }, label), out), input);
  }

  // Slider bound to a path in the state, with live preview and one undo step per drag.
  function boundRange(label, get, set, opts) {
    return rangeField({
      label, value: get(S()), ...opts,
      onInput: (v) => store.update((s) => set(s, v)),
      onCommit: () => store.end(),
    });
  }

  function switchField(label, checked, onChange, id = nid('sw')) {
    const input = h('input', { type: 'checkbox', role: 'switch', id, checked });
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'switch', for: id }, input, h('span', {}, label));
  }

  function segmented(options, value, onChange, label) {
    return h('div', { class: 'seg seg-full', role: 'group', 'aria-label': label },
      options.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, l)));
  }

  function selectField(label, options, value, onChange) {
    const id = nid('sel');
    const sel = h('select', { class: 'sel', id }, options.map(([v, l]) => h('option', { value: v }, l)));
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, label), sel);
  }

  function chips(list, onApply = applyPreset) {
    return h('div', { class: 'chips' }, list.map((p) =>
      h('button', { type: 'button', class: 'chip' + (p.id === 'none' || p.id === 'off' ? ' muted' : ''), title: p.desc || p.name, onclick: () => onApply(p) }, p.name)));
  }

  function colorField(label, value, onInput, onCommit) {
    const [r, g, b] = hexToRgb(value);
    const picker = h('input', { type: 'color', value, 'aria-label': label + ' picker' });
    const nums = [r, g, b].map((v, i) => h('input', { type: 'number', min: 0, max: 255, step: 1, value: v, 'aria-label': 'RGB'[i] }));
    const setAll = (hex, commit) => {
      picker.value = hex;
      hexToRgb(hex).forEach((v, i) => { nums[i].value = v; });
      commit ? onCommit(hex) : onInput(hex);
    };
    picker.addEventListener('input', () => setAll(picker.value, false));
    picker.addEventListener('change', () => setAll(picker.value, true));
    nums.forEach((n) => n.addEventListener('change', () => setAll(rgbToHex(+nums[0].value, +nums[1].value, +nums[2].value), true)));
    const gels = h('div', { class: 'gels' }, GELS.map(([hex, name]) =>
      h('button', { type: 'button', class: 'gel', title: name, 'aria-label': name, 'aria-pressed': String(hex === value.toLowerCase()), style: `background:${hex}`, onclick: () => setAll(hex, true) })));
    return h('div', { class: 'field' },
      h('div', { class: 'field-row' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-val' }, value.toUpperCase())),
      h('div', { class: 'color-row' }, picker, ...nums.map((n, i) => h('label', { class: 'num rgb' }, h('span', {}, 'RGB'[i]), n))),
      gels);
  }

  function imagePicker(use, value, onPick) {
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const id = await addUpload(f);
        onPick(id);
        toast('Picture added');
      } catch (e) {
        toast(e.message);
      }
    });
    return h('div', { class: 'thumbs' },
      h('button', { type: 'button', class: 'thumb upload', onclick: () => file.click() }, icon('upload'), 'Upload'),
      file,
      listImages(use).map((im) => h('button', { type: 'button', class: 'thumb', 'aria-pressed': String(im.id === value), title: im.name, onclick: () => onPick(im.id) },
        h('img', { src: getThumb(im.id), alt: '' }), h('span', { class: 'cap' }, im.name))));
  }

  function addGrid(types) {
    return h('div', { class: 'add-grid' }, types.map(([type, label, props]) =>
      h('button', { type: 'button', class: 'add-btn', onclick: () => ctx.interact.startPlacing(type, props) }, icon(type), label)));
  }

  function bulkColour(type, label) {
    const n = S().items.filter((i) => i.type === type).length;
    if (!n) return null;
    return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label),
      h('div', { class: 'gels' }, GELS.map(([hex, name]) => h('button', {
        type: 'button', class: 'gel', title: name, 'aria-label': name, style: `background:${hex}`,
        onclick: () => store.commit((s) => s.items.forEach((i) => { if (i.type === type) i.props.color = hex; })),
      }))));
  }

  function applyPreset(p) {
    store.commit((s) => p.apply(s));
    toast(p.name);
  }

  // ---------- tabs ----------
  const count = (type) => S().items.filter((i) => i.type === type).length;

  function tabScenes() {
    const s = S();
    const names = { stairs: 'stair block', riser: 'riser', boxset: 'box set', table: 'table', chair: 'chair', locker: 'locker unit', speaker: 'speaker', floorspot: 'floor spot', rigspot: 'rig light' };
    const parts = Object.entries(names).map(([t, n]) => [count(t), n]).filter(([c]) => c).map(([c, n]) => `${c} ${n}${c > 1 ? 's' : ''}`);
    const seats = ctx.seating.stats;
    return [
      sec('Start from a scene', 'Each scene replaces the whole design. Undo brings your last design back.',
        h('div', { class: 'scene-list' }, PRESETS.scenes.map((p) => h('button', {
          type: 'button', class: 'scene-card',
          onclick: () => { ctx.select(null); store.commit((st) => p.apply(st)); ctx.setView?.('audience'); toast(p.name); },
        }, h('strong', {}, p.name), h('span', {}, p.desc))))),
      sec('In this design', null,
        h('p', { class: 'summary' }, parts.length ? parts.join(' · ') : 'Nothing placed yet.'),
        h('p', { class: 'summary' }, `${seats ? seats.live : 0} audience seats · LED wall ${s.led.on ? 'on' : 'off'} · rig ${s.rig.on ? 'up' : 'hidden'} · general lights ${s.house.on ? Math.round(s.house.level * 100) + ' %' : 'off'}`)),
      sec('Controls', null, h('ul', { class: 'keys' },
        h('li', {}, h('b', {}, 'Drag'), ' an item to move it. Items sit on the floor, the stage or a riser.'),
        h('li', {}, h('b', {}, 'R'), ' rotate 90°, ', h('b', {}, 'Shift + R'), ' rotate back'),
        h('li', {}, h('b', {}, 'Arrows'), ' nudge, ', h('b', {}, 'Page Up / Down'), ' raise or lower'),
        h('li', {}, h('b', {}, 'Ctrl + D'), ' duplicate, ', h('b', {}, 'Delete'), ' remove'),
        h('li', {}, h('b', {}, 'Ctrl + Z'), ' undo, ', h('b', {}, 'Ctrl + Shift + Z'), ' redo'),
        h('li', {}, 'Right-drag to pan, scroll to zoom.'))),
    ];
  }

  function tabStage() {
    const s = S();
    return [
      sec('Add to the stage', 'Pick a part, then click where it goes. Hold Shift while clicking to place several.',
        addGrid([['stairs', 'Stair block'], ['riser', 'Riser 1 × 1'], ['boxset', 'Box set']])),
      sec('Stairs', `${count('stairs')} placed`, chips(PRESETS.stairs)),
      sec('Risers', `${count('riser')} placed`, chips(PRESETS.risers)),
      sec('Box sets', `${count('boxset')} placed`, chips(PRESETS.boxsets),
        h('p', { class: 'sec-note' }, 'Select a box set to change its size or the print on each wall.')),
      sec('LED wall', '8 × 4.5 m behind the stage. Its picture lights the stage in matching colours.',
        switchField('Screen on', s.led.on, (v) => store.commit((st) => { st.led.on = v; })),
        boundRange('Brightness', (st) => Math.round(st.led.brightness * 100), (st, v) => { st.led.brightness = v / 100; }, { min: 5, max: 100, unit: ' %' }),
        imagePicker('led', s.led.image, (id) => store.commit((st) => { st.led.image = id; st.led.on = true; })),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Presets'), chips(PRESETS.led))),
    ];
  }

  function tabProps() {
    return [
      sec('Add props', 'Pick a prop, then click where it goes.',
        addGrid([['table', 'Table'], ['chair', 'Chair'], ['locker', 'Lockers']])),
      sec('Table setups', 'These replace the tables and chairs already placed.', chips(PRESETS.tables)),
      sec('Chair layouts', `${count('chair')} placed`, chips(PRESETS.chairs)),
      sec('Lockers', `${count('locker')} placed`, chips(PRESETS.lockers),
        h('p', { class: 'sec-note' }, 'Select a locker unit to switch between 9 and 15 doors.')),
    ];
  }

  function tabLights() {
    const s = S();
    const shadow = ctx.shadowInfo?.();
    return [
      sec('General lights', 'The panel lights in the ceiling. The same switch is in the top bar.',
        switchField('Ceiling lights on', s.house.on, (v) => store.commit((st) => { st.house.on = v; })),
        boundRange('Dimmer', (st) => Math.round(st.house.level * 100), (st, v) => { st.house.level = v / 100; }, { min: 5, max: 100, unit: ' %' }),
        boundRange('Colour temperature', (st) => st.house.temp, (st, v) => { st.house.temp = v; }, { min: 2700, max: 6500, step: 100, unit: ' K' }),
        chips(PRESETS.house)),
      sec('Floor spotlights', `${count('floorspot')} placed`,
        addGrid([['floorspot', 'Floor spotlight']]),
        chips(PRESETS.floorspots),
        bulkColour('floorspot', 'Set every floor spot to')),
      sec('Lighting rig', 'White truss above the stage. Rig lights clamp to any bar.',
        switchField('Show the rig', s.rig.on, (v) => store.commit((st) => { st.rig.on = v; })),
        boundRange('Rig height', (st) => st.rig.height, (st, v) => { st.rig.height = v; }, { min: 4.4, max: 6.0, step: 0.1, unit: ' m' }),
        switchField('Middle bar', s.rig.midBar, (v) => store.commit((st) => { st.rig.midBar = v; })),
        addGrid([['rigspot', 'Rig spotlight']]),
        chips(PRESETS.rigspots),
        bulkColour('rigspot', 'Set every rig light to')),
      sec('Haze', 'Fills the air so beams show, as in a real show with a hazer.',
        switchField('Haze on', s.haze.on, (v) => store.commit((st) => { st.haze.on = v; })),
        boundRange('Density', (st) => Math.round(st.haze.density * 100), (st, v) => { st.haze.density = v / 100; }, { min: 5, max: 100, unit: ' %' })),
      shadow ? h('p', { class: 'stat' }, shadow) : null,
    ];
  }

  function tabAudience() {
    const s = S().seating;
    const st = ctx.seating.stats || { live: 0, removed: 0, outside: 0 };
    const set = (key) => (state, v) => { state.seating[key] = v; };
    return [
      sec('Seating presets', `${st.live} seats`, chips(PRESETS.seating)),
      sec('Layout', null,
        segmented([['straight', 'Straight rows'], ['curved', 'Curved rows']], s.layout, (v) => store.commit((x) => { x.seating.layout = v; }), 'Row shape'),
        boundRange('Blocks', (x) => x.seating.blocks, set('blocks'), { min: 1, max: 4 }),
        boundRange('Rows', (x) => x.seating.rows, set('rows'), { min: 0, max: 20 }),
        boundRange(s.layout === 'curved' ? 'Seats per block (front row)' : 'Seats per row in each block', (x) => x.seating.seatsPerRow, set('seatsPerRow'), { min: 1, max: 20 }),
        boundRange('Aisle width', (x) => x.seating.aisle, set('aisle'), { min: 0.8, max: 4, step: 0.1, unit: ' m' }),
        boundRange('Distance from stage', (x) => x.seating.frontGap, set('frontGap'), { min: 0.5, max: 8, step: 0.1, unit: ' m' }),
        boundRange('Seat spacing', (x) => x.seating.seatSpacing, set('seatSpacing'), { min: 0.46, max: 0.8, step: 0.01, unit: ' m' }),
        boundRange('Row spacing', (x) => x.seating.rowSpacing, set('rowSpacing'), { min: 0.8, max: 1.4, step: 0.05, unit: ' m' }),
        boundRange('Shift sideways', (x) => x.seating.offsetX, set('offsetX'), { min: -4, max: 4, step: 0.1, unit: ' m' }),
        switchField('Red carpet in the aisles', s.carpet, (v) => store.commit((x) => { x.seating.carpet = v; })),
        st.outside ? h('p', { class: 'warn' }, `${st.outside} seats do not fit inside the hall and are left out.`) : null),
      sec('Single seats', 'Turn this on, then click chairs to remove them. Removed seats show in red; click one to bring it back.',
        switchField('Edit single seats', editSeats, (v) => setSeatEdit(v), 'seat-edit'),
        st.removed ? h('button', { type: 'button', class: 'btn', onclick: () => store.commit((x) => { x.seating.removed = []; }) }, `Restore ${st.removed} removed seat${st.removed > 1 ? 's' : ''}`) : null),
    ];
  }

  function tabSound() {
    return [
      sec('Add speakers', 'Tall column speakers. Turn them to face any direction and tilt them up or down.',
        addGrid([['speaker', 'Column speaker']])),
      sec('Speaker layouts', `${count('speaker')} placed`, chips(PRESETS.speakers)),
    ];
  }

  const TAB_FNS = { scenes: tabScenes, stage: tabStage, props: tabProps, lights: tabLights, audience: tabAudience, sound: tabSound };

  function renderLibrary() {
    const body = library.querySelector('.panel-body');
    const scroll = body ? body.scrollTop : 0;
    const prevTab = library.dataset.tab;
    library.dataset.tab = tab;
    library.replaceChildren(
      h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Parts library' }, TABS.map(([id, label]) =>
        h('button', { type: 'button', role: 'tab', class: 'tab', id: 'tab-' + id, 'aria-selected': String(id === tab), onclick: () => setTab(id) }, icon(id), label))),
      h('div', { class: 'panel-body', role: 'tabpanel', 'aria-labelledby': 'tab-' + tab }, TAB_FNS[tab]()));
    if (prevTab === tab) library.querySelector('.panel-body').scrollTop = scroll;
  }

  function setTab(id) {
    if (id !== 'audience' && editSeats) setSeatEdit(false);
    tab = id;
    renderLibrary();
    document.getElementById('app').classList.add('show-library');
  }

  function setSeatEdit(on) {
    editSeats = on;
    ctx.interact.setSeatMode(on);
    if (tab === 'audience') renderLibrary();
  }

  // ---------- inspector ----------
  function renderInspector() {
    const id = ctx.selectedId;
    const it = id && findItem(S(), id);
    if (!it || ctx.mode !== 'design') {
      inspector.hidden = true;
      return;
    }
    const t = TYPES[it.type];
    inspector.hidden = false;
    const upd = (fn) => store.update((s) => { const x = findItem(s, id); if (x) fn(x); });
    const com = (fn) => store.commit((s) => { const x = findItem(s, id); if (x) fn(x); });
    const numIn = (axis, val, apply) => {
      const input = h('input', { type: 'number', step: 0.05, value: fmt(val, 2), 'aria-label': axis });
      input.addEventListener('change', () => { const v = parseFloat(input.value); if (Number.isFinite(v)) com((x) => apply(x, v)); });
      return h('label', { class: 'num' }, h('span', {}, axis), input);
    };
    const rows = [];
    if (t.note) rows.push(h('p', { class: 'sec-note' }, t.note));
    if (t.rig) {
      rows.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Position on the rig (snaps to the nearest bar)'),
        h('div', { class: 'xyz two' }, numIn('X', it.x, (x, v) => { x.x = v; }), numIn('Z', it.z, (x, v) => { x.z = v; }))));
    } else {
      rows.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Position (metres)'),
        h('div', { class: 'xyz' }, numIn('X', it.x, (x, v) => { x.x = v; }), numIn('Y', it.y, (x, v) => { x.y = Math.max(0, v); }), numIn('Z', it.z, (x, v) => { x.z = v; }))));
    }
    const rotLabel = t.rotLabel || 'Rotation';
    rows.push(h('div', { class: 'rot-row' },
      rangeField({
        label: rotLabel, value: Math.round(((it.rot % 360) + 540) % 360 - 180), min: -180, max: 180, step: 1, unit: '°',
        onInput: (v) => upd((x) => { x.rot = v; }), onCommit: () => store.end(),
      }),
      h('div', { class: 'row-btns' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => com((x) => { x.rot = (x.rot || 0) - 90; }) }, '−90°'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => com((x) => { x.rot = (x.rot || 0) + 90; }) }, '+90°'))));
    for (const f of t.fields) {
      if (f.when && !f.when(it.props)) continue;
      const v = it.props[f.key];
      if (f.type === 'range') {
        rows.push(rangeField({ label: f.label, value: v, min: f.min, max: f.max, step: f.step, unit: f.unit,
          onInput: (nv) => upd((x) => { x.props[f.key] = nv; }), onCommit: () => store.end() }));
      } else if (f.type === 'segmented') {
        rows.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, f.label), segmented(f.options, v, (nv) => com((x) => { x.props[f.key] = nv; }), f.label)));
      } else if (f.type === 'switch') {
        rows.push(switchField(f.label, v, (nv) => com((x) => { x.props[f.key] = nv; })));
      } else if (f.type === 'select') {
        rows.push(selectField(f.label, f.options, v, (nv) => com((x) => { x.props[f.key] = nv; })));
      } else if (f.type === 'color') {
        rows.push(colorField(f.label, v, (hex) => upd((x) => { x.props.color = hex; }), (hex) => com((x) => { x.props.color = hex; })));
      } else if (f.type === 'swatch') {
        rows.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, f.label), h('div', { class: 'gels' }, f.options.map((hex) =>
          h('button', { type: 'button', class: 'gel', 'aria-label': hex, 'aria-pressed': String(hex === v), style: `background:${hex}`, onclick: () => com((x) => { x.props[f.key] = hex; }) })))));
      } else if (f.type === 'image') {
        rows.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, f.label), imagePicker(f.use, v, (nid2) => com((x) => { x.props[f.key] = nid2; }))));
      }
    }
    if (t.fixture) {
      rows.push(h('div', { class: 'row-btns' },
        h('button', { type: 'button', class: 'btn', onclick: () => ctx.interact.startAim() }, icon('aim'), 'Aim at a point'),
        h('button', { type: 'button', class: 'btn', onclick: () => ctx.interact.aimAt({ x: 0, y: 1.0, z: -2 }) }, 'Aim at centre stage')));
    }
    const scroll = inspector.querySelector('.panel-body')?.scrollTop || 0;
    const same = inspector.dataset.item === id;
    inspector.dataset.item = id;
    inspector.replaceChildren(
      h('div', { class: 'insp-head' },
        h('div', {}, h('div', { class: 'insp-kicker' }, 'Selected'), h('div', { class: 'insp-title' }, t.label)),
        h('div', { class: 'row-btns' },
          h('button', { type: 'button', class: 'btn icon', title: 'Duplicate (Ctrl + D)', 'aria-label': 'Duplicate', onclick: () => ctx.interact.duplicate() }, icon('copy')),
          h('button', { type: 'button', class: 'btn icon danger', title: 'Delete (Del)', 'aria-label': 'Delete', onclick: () => ctx.interact.remove() }, icon('trash')),
          h('button', { type: 'button', class: 'btn icon', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => ctx.select(null) }, icon('close')))),
      h('div', { class: 'panel-body' }, rows));
    if (same) inspector.querySelector('.panel-body').scrollTop = scroll;
  }

  // ---------- top bar ----------
  const refs = {};
  function buildTopbar() {
    const modeBtn = (m, label) => h('button', { type: 'button', 'data-mode': m, onclick: () => ctx.setMode(m) }, label);
    refs.mode = h('div', { class: 'seg', role: 'group', 'aria-label': 'Mode' }, modeBtn('design', 'Design'), modeBtn('walk', 'Walk through'));
    refs.undo = h('button', { type: 'button', class: 'btn icon', title: 'Undo (Ctrl + Z)', 'aria-label': 'Undo', onclick: () => store.undo() }, icon('undo'));
    refs.redo = h('button', { type: 'button', class: 'btn icon', title: 'Redo (Ctrl + Shift + Z)', 'aria-label': 'Redo', onclick: () => store.redo() }, icon('redo'));
    refs.house = h('input', { type: 'checkbox', role: 'switch', id: 'tb-house' });
    refs.house.addEventListener('change', () => store.commit((s) => { s.house.on = refs.house.checked; }));
    refs.haze = h('input', { type: 'checkbox', role: 'switch', id: 'tb-haze' });
    refs.haze.addEventListener('change', () => store.commit((s) => { s.haze.on = refs.haze.checked; }));
    refs.view = h('select', { class: 'sel', id: 'tb-view', 'aria-label': 'Camera view' },
      [['', 'Camera…'], ['audience', 'Audience corner'], ['front', 'Front of house'], ['stage', 'Stage close-up'], ['side', 'Side'], ['top', 'Top-down plan']].map(([v, l]) => h('option', { value: v }, l)));
    refs.view.addEventListener('change', () => { if (refs.view.value) ctx.setView(refs.view.value); refs.view.value = ''; });
    refs.snap = h('select', { class: 'sel', id: 'tb-snap', 'aria-label': 'Snapping', title: 'Snapping' },
      [['auto', 'Snap: auto'], ['0.1', 'Snap: 10 cm'], ['0.5', 'Snap: 50 cm'], ['0', 'Snap: off']].map(([v, l]) => h('option', { value: v }, l)));
    refs.snap.addEventListener('change', () => { ctx.snapMode = refs.snap.value; });
    refs.quality = h('select', { class: 'sel', id: 'tb-quality', 'aria-label': 'Render quality', title: 'Render quality' },
      [['low', 'Quality: fast'], ['medium', 'Quality: balanced'], ['high', 'Quality: best']].map(([v, l]) => h('option', { value: v }, l)));
    refs.quality.value = ctx.quality;
    refs.quality.addEventListener('change', () => ctx.setQuality(refs.quality.value));
    refs.menu = buildMenu();
    refs.shot = buildShotMenu();
    const tools = h('div', { class: 'tb-group' });
    topbar.replaceChildren(
      h('a', { class: 'btn back', href: './production.html', title: 'Back to The production' }, icon('back'), h('span', {}, 'The production')),
      h('a', { class: 'brand', href: './index.html', 'aria-label': 'The Drama Collective, home' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
        h('div', { class: 'brand-text' }, h('div', { class: 'brand-sub' }, 'The Drama Collective'), h('div', { class: 'brand-name' }, 'Stage planner'))),
      refs.mode,
      h('button', { type: 'button', class: 'btn icon panels-toggle', title: 'Show or hide panels', 'aria-label': 'Show or hide panels', onclick: () => document.getElementById('app').classList.toggle('show-library') }, icon('panels')),
      h('div', { class: 'tb-group' }, refs.undo, refs.redo),
      h('div', { class: 'tb-group' },
        h('label', { class: 'switch', for: 'tb-house', title: 'Ceiling lights' }, refs.house, h('span', {}, 'General lights')),
        h('label', { class: 'switch', for: 'tb-haze' }, refs.haze, h('span', {}, 'Haze'))),
      tools,
      h('div', { class: 'tb-group push' }, refs.shot.wrap, refs.menu.wrap));
    topbar.querySelector('.brand-mark').innerHTML = `<img src="${MARK}" alt="">`;

    // The bar keeps to one line, and Snapshot and File at its end stay in sight. Where the camera,
    // snapping and quality menus would push it past the window's edge (on most laptop windows),
    // they move into the File menu, as the conditions page says, so quality and the camera views
    // can always be reached; moved, not copied, so each keeps one value. Where the bar is still too
    // long, the brand and the way back keep only their marks (.is-tight). Measured rather than set
    // at a fixed width, as the bar's length follows its type.
    const fit = () => {
      topbar.classList.remove('is-tight');
      tools.append(refs.view, refs.snap, refs.quality);
      if (topbar.scrollWidth <= topbar.clientWidth) return;
      refs.menu.tools.append(refs.view, refs.snap, refs.quality);
      topbar.classList.toggle('is-tight', topbar.scrollWidth > topbar.clientWidth);
    };
    let fitting = 0;
    window.addEventListener('resize', () => { if (!fitting) fitting = requestAnimationFrame(() => { fitting = 0; fit(); }); });
    document.fonts.ready.then(fit);
    fit();
  }

  function popover(trigger, content) {
    const pop = h('div', { class: 'pop', hidden: true }, content);
    const wrap = h('div', { class: 'pop-wrap' }, trigger, pop);
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = pop.hidden;
      document.querySelectorAll('.pop').forEach((p) => { p.hidden = true; });
      pop.hidden = !open;
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
    return { wrap, pop };
  }
  document.addEventListener('click', () => document.querySelectorAll('.pop').forEach((p) => { p.hidden = true; }));

  function buildMenu() {
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (f) ctx.io.openDesign(await f.text());
    });
    const item = (label, fn, sub) => h('button', { type: 'button', class: 'menu-item', onclick: () => { document.querySelectorAll('.pop').forEach((p) => { p.hidden = true; }); fn(); } }, h('span', {}, label), sub ? h('small', {}, sub) : null);
    // the camera, snapping and quality menus, when the bar is too narrow for them (buildTopbar)
    const tools = h('div', { class: 'menu-tools', role: 'group', 'aria-label': 'View and quality' });
    const menu = popover(
      h('button', { type: 'button', class: 'btn', 'aria-label': 'File menu' }, 'File', icon('dots')),
      h('div', { class: 'menu' },
        item('Save design', () => ctx.io.saveDesign(), '.json file you can open again'),
        item('Open design…', () => file.click(), 'Load a saved .json file'),
        item('Export 3D model', () => ctx.io.exportGLB(), '.glb for Blender, SketchUp and web viewers'),
        item('Start over', () => { ctx.select(null); store.commit((s) => PRESETS.scenes[0].apply(s)); toast('Back to the starting scene'); }, 'Undo brings your design back'),
        tools,
        file));
    return { ...menu, tools };
  }

  function buildShotMenu() {
    const sizeSel = h('select', { class: 'sel', id: 'shot-size' },
      [['1920x1080', '1920 × 1080 (HD)'], ['2560x1440', '2560 × 1440'], ['3840x2160', '3840 × 2160 (4K)'], ['1080x1350', '1080 × 1350 (portrait post)']].map(([v, l]) => h('option', { value: v }, l)));
    const go = h('button', { type: 'button', class: 'btn primary wide', onclick: async () => {
      const [w, hh] = sizeSel.value.split('x').map(Number);
      go.disabled = true;
      go.textContent = 'Rendering…';
      try {
        await ctx.io.snapshot(w, hh);
      } finally {
        go.disabled = false;
        go.textContent = 'Save picture';
      }
    } }, 'Save picture');
    return popover(
      h('button', { type: 'button', class: 'btn primary', 'aria-label': 'Snapshot' }, icon('camera'), h('span', { class: 'hide-xs' }, 'Snapshot')),
      h('div', { class: 'menu shot' },
        h('p', { class: 'sec-note' }, 'Renders the current view with the best shadows, whatever the quality, without selection outlines. The first picture takes longest.'),
        h('label', { class: 'field-label', for: 'shot-size' }, 'Size'), sizeSel, go));
  }

  function refreshTopbar() {
    const s = S();
    refs.undo.disabled = !store.undoStack.length;
    refs.redo.disabled = !store.redoStack.length;
    refs.house.checked = s.house.on;
    refs.haze.checked = s.haze.on;
    refs.mode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === ctx.mode)));
  }

  // ---------- walk HUD ----------
  function renderWalkHud(viewpoints, locked) {
    if (!viewpoints || ctx.mode !== 'walk') {
      walkHud.hidden = true;
      return;
    }
    walkHud.hidden = false;
    const pad = (label, f, s2, aria) => {
      const b = h('button', { type: 'button', class: 'pad-btn', 'aria-label': aria }, label);
      const on = (e) => { e.preventDefault(); ctx.walk.setTouch(f, s2); };
      const off = () => ctx.walk.setTouch(0, 0);
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('pointercancel', off);
      return b;
    };
    walkHud.replaceChildren(
      h('div', { class: 'crosshair' }),
      locked ? null : h('div', { class: 'walk-prompt' },
        h('strong', {}, 'Click the hall to look around'),
        h('span', {}, 'W A S D or arrow keys to walk · Shift to hurry · Esc to free the mouse'),
        h('span', {}, 'Or drag to look. Stairs and risers can be climbed.')),
      h('div', { class: 'walk-bar' },
        viewpoints.map((v, i) => h('button', { type: 'button', class: 'chip', title: `Key ${i + 1}`, onclick: () => ctx.walk.goTo(v) }, v.name)),
        h('button', { type: 'button', class: 'chip muted', onclick: () => ctx.setMode('design') }, 'Back to design')),
      h('div', { class: 'walk-pad' },
        h('span'), pad('▲', 1, 0, 'Walk forward'), h('span'),
        pad('◀', 0, -1, 'Step left'), pad('▼', -1, 0, 'Walk back'), pad('▶', 0, 1, 'Step right')));
  }

  // ---------- misc ----------
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function setHint(text) {
    hintEl.textContent = text || '';
  }

  function render() {
    refreshTopbar();
    if (ctx.mode === 'design') renderLibrary();
    renderInspector();
  }

  buildTopbar();
  document.getElementById('app').classList.toggle('show-library', window.innerWidth > 760);

  return {
    render,
    renderInspector,
    renderLibrary,
    refreshTopbar,
    renderWalkHud,
    setTab,
    toast,
    setHint,
    get seatEdit() { return editSeats; },
    setSeatEdit,
  };
}
