// The camera of Meet our writers' opening (src/writers/opening.js), as plain numbers, with no
// three.js in it: the live statue (src/scene/writerStatue.js) sets its camera from it, and where the
// statue is a still picture the page projects the book's corners with it, so both tell the same
// story. The view runs from 0, the whole statue standing in its box on the page (its slot), to 1,
// the book in its hand straight in front of the viewer, upright, in the middle of the screen.
// Between the two the camera moves and turns; the statue stays still in itself. Lengths are in
// the statue's own units (writer-statue.json: its base on y = 0, 2 high, its front toward +z).

const DEG = Math.PI / 180;
export const FOV = 20; // the lens, vertical, in degrees
const TAN = Math.tan((FOV * DEG) / 2);
// the statue's view: what the slot holds (a little room above the nib and below the plinth), the
// height it is centred on, and how far above it the camera looks down
const ROOM = { h: 2.24, w: 1.3, cy: 1.0, elev: 6 * DEG };
// the book's view: how much of the screen its cover fills at most (of the height, of the width)
export const BOOK_FILL = { h: 0.5, w: 0.62 };

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The camera for a view.
 * @param {object} o
 * @param {number} o.view     0 the statue in its slot .. 1 the book
 * @param {number} o.w, o.h   the canvas (CSS px)
 * @param {{x:number,y:number,w:number,h:number}} o.slot  the statue's box in the canvas (CSS px)
 * @param {object} o.book     writer-statue.json's book.cover
 * @param {number} [o.pitch]  the pointer's lean: the camera a little higher or lower (radians)
 * @returns {{ pos: number[], target: number[], up: number[], fov: number, aspect: number, sx: number, sy: number }}
 *   sx, sy: where the view's centre falls on the screen (-1..1), a lens shift that puts the statue
 *   in its slot without turning the camera toward it
 */
export function rig({ view, w, h, slot, book, pitch = 0 }) {
  const aspect = w / h;
  const v = Math.min(1, Math.max(0, view));
  // the statue's view: far enough for the whole statue to fit the slot's height and width
  const d0 = (Math.max(ROOM.h / slot.h, ROOM.w / slot.w) * h) / (2 * TAN);
  const e = ROOM.elev + pitch;
  const dir0 = [0, Math.sin(e), Math.cos(e)];
  const t0 = [0, ROOM.cy, 0];
  const s0 = [((slot.x + slot.w / 2) / w) * 2 - 1, 1 - ((slot.y + slot.h / 2) / h) * 2];
  // the book's view: straight on to its cover, upright, near enough to fill BOOK_FILL
  const [bw, bh] = book.size;
  const d1 = Math.max(bh / (BOOK_FILL.h * 2 * TAN), bw / (BOOK_FILL.w * 2 * TAN * aspect));
  const dir1 = norm(book.normal);
  const t1 = book.centre;
  // between: the target and the lens slide over, the camera turns, and the distance closes evenly
  // (by its logarithm, so the approach does not rush at the end)
  const target = mix(t0, t1, v);
  const dir = norm(mix(dir0, dir1, v));
  const d = Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * v);
  const up = norm(mix([0, 1, 0], book.up, v));
  return { pos: add(target, mul(dir, d)), target, up, fov: FOV, aspect, sx: s0[0] * (1 - v), sy: s0[1] * (1 - v) };
}

/**
 * Points (the statue's space, turned by `yaw` about its upright) on the screen through the camera:
 * [x, y] in CSS px from the canvas's top left.
 */
export function project(points, cam, w, h, yaw = 0) {
  const z = norm(sub(cam.pos, cam.target));
  const x = norm(cross(cam.up, z));
  const y = cross(z, x);
  const f = 1 / Math.tan((cam.fov * DEG) / 2);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return points.map((p) => {
    const q = [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
    const r = sub(q, cam.pos);
    const zc = -dot(r, z);
    const nx = (f / cam.aspect) * dot(r, x) / zc + cam.sx;
    const ny = (f * dot(r, y)) / zc + cam.sy;
    return [((nx + 1) / 2) * w, ((1 - ny) / 2) * h];
  });
}
