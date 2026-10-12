// Design state with undo/redo. The 3D scene is rebuilt from this state after every change.
import { exportUploads, importUploads } from './images.js';
import { TYPES } from './items.js';
import { baseState, SEAT } from './presets.js';

const LIMIT = 80;
const STORAGE_KEY = 'dc-stage-planner-v1';

export function createStore(initial) {
  const listeners = { change: new Set(), commit: new Set() };
  const store = {
    state: initial,
    undoStack: [],
    redoStack: [],
    pending: null,
    on(evt, fn) {
      listeners[evt].add(fn);
      return () => listeners[evt].delete(fn);
    },
    emit(evt, info) {
      listeners[evt].forEach((fn) => fn(info));
    },
    snapshot() {
      return JSON.stringify(store.state);
    },
    // Start a change that may span many updates (a drag, a slider). Undo returns to this point.
    begin() {
      if (!store.pending) store.pending = store.snapshot();
    },
    // Apply an update without closing the undo step.
    update(fn) {
      store.begin();
      fn(store.state);
      store.emit('change');
    },
    end() {
      if (!store.pending) return;
      const before = store.pending;
      store.pending = null;
      if (before !== store.snapshot()) {
        store.undoStack.push(before);
        if (store.undoStack.length > LIMIT) store.undoStack.shift();
        store.redoStack = [];
      }
      store.emit('commit');
      save(store.state);
    },
    commit(fn) {
      store.update(fn);
      store.end();
    },
    cancel() {
      if (!store.pending) return;
      store.state = JSON.parse(store.pending);
      store.pending = null;
      store.emit('change');
      store.emit('commit');
    },
    undo() {
      store.end();
      if (!store.undoStack.length) return false;
      store.redoStack.push(store.snapshot());
      store.state = JSON.parse(store.undoStack.pop());
      store.emit('change');
      store.emit('commit');
      save(store.state);
      return true;
    },
    redo() {
      store.end();
      if (!store.redoStack.length) return false;
      store.undoStack.push(store.snapshot());
      store.state = JSON.parse(store.redoStack.pop());
      store.emit('change');
      store.emit('commit');
      save(store.state);
      return true;
    },
    replace(next, { keepHistory = true } = {}) {
      store.end();
      if (keepHistory) {
        store.undoStack.push(store.snapshot());
        store.redoStack = [];
      }
      store.state = next;
      store.emit('change');
      store.emit('commit');
      save(store.state);
    },
  };
  return store;
}

// Bring a loaded design up to the current shape and drop anything unknown.
export function normalise(raw) {
  const b = baseState();
  if (!raw || typeof raw !== 'object') return b;
  const s = {
    version: 1,
    house: { ...b.house, ...(raw.house || {}) },
    haze: { ...b.haze, ...(raw.haze || {}) },
    led: { ...b.led, ...(raw.led || {}) },
    rig: { ...b.rig, ...(raw.rig || {}) },
    seating: SEAT(raw.seating || {}),
    items: [],
    camera: raw.camera && Array.isArray(raw.camera.p) ? raw.camera : null,
  };
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const t = TYPES[it && it.type];
    if (!t) continue;
    const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
    s.items.push({
      id: String(it.id || Math.random().toString(36).slice(2)),
      type: it.type,
      x: num(it.x), y: num(it.y), z: num(it.z), rot: num(it.rot),
      props: { ...t.defaults(), ...(it.props || {}) },
    });
  }
  if (!Array.isArray(s.seating.removed)) s.seating.removed = [];
  return s;
}

export function serialise(state) {
  return JSON.stringify({ app: 'dc-stage-planner', ...state, uploads: exportUploads() }, null, 1);
}

export function parseDesign(text) {
  const raw = JSON.parse(text);
  if (raw.uploads) importUploads(raw.uploads);
  return normalise(raw);
}

let saveTimer = 0;
function save(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, uploads: exportUploads() }));
    } catch {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* storage unavailable */
      }
    }
  }, 400);
}

export function loadSaved() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t ? parseDesign(t) : null;
  } catch {
    return null;
  }
}
