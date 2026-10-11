// The Collective's mark as a 3D object: assets/brand/mark.svg (potrace's trace of mark-gold.png,
// see tools/logo/trace_logo.ps1) extruded with a bevel. Built at load time, in turntable space:
// centred on `center`, scaled so that every point lies within `radius` of it, readable from -z
// (the viewer, once the statue has turned to face them).
//
// Every triangle is labelled with the part of the mark it belongs to (assets/brand/mark-regions.json:
// the mask, the hand, the face; everything else is the body), so the morph can turn each part of the
// statue into the matching part of the logo.

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const PARTS = ['body', 'mask', 'hand', 'face'];

function insidePolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * @param {string} svgText
 * @param {object} o
 * @param {THREE.Vector3} o.center   where the logo's centre sits
 * @param {number} o.radius          the logo fits inside this sphere about `center`
 * @param {object} [o.regions]       the parsed mark-regions.json (without it, all of it is 'body')
 * @param {number} [o.depth]         extrusion depth, as a fraction of the logo's width
 * @param {number} [o.maxTriangles]  the curves are sampled as finely as this budget allows (the
 *                                   morph needs no more triangles than the statue has)
 * @returns {{ geometry: THREE.BufferGeometry, part: Uint8Array }}  non-indexed geometry with
 *          position and normal; part[t] indexes PARTS for triangle t
 */
export function buildLogoGeometry(svgText, { center, radius, regions = null, depth = 0.07, maxTriangles = Infinity }) {
  const svg = new SVGLoader().parse(svgText);
  const shapes = [];
  for (const path of svg.paths) shapes.push(...SVGLoader.createShapes(path));

  // measure in SVG units first so depth and bevel are proportional to the mark
  const flat = new THREE.ShapeGeometry(shapes, 2);
  flat.computeBoundingBox();
  const width = flat.boundingBox.max.x - flat.boundingBox.min.x;
  flat.dispose();

  let geo = null;
  for (const [curveSegments, bevelSegments] of [[5, 3], [4, 3], [3, 2], [2, 2], [1, 2], [1, 1]]) {
    geo?.dispose();
    geo = new THREE.ExtrudeGeometry(shapes, {
      depth: width * depth,
      bevelEnabled: true,
      bevelThickness: width * 0.012,
      bevelSize: width * 0.006,
      bevelSegments,
      curveSegments,
    });
    if (geo.attributes.position.count / 3 <= maxTriangles) break;
  }

  // label the triangles while they are still in SVG units (the polygons are drawn in them)
  const pos = geo.attributes.position;
  const n = pos.count / 3;
  const part = new Uint8Array(n);
  const polys = (regions?.regions ?? []).map((r) => ({ id: PARTS.indexOf(r.name), poly: r.polygon })).filter((r) => r.id > 0);
  for (let t = 0; t < n; t++) {
    const x = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3;
    const y = (pos.getY(t * 3) + pos.getY(t * 3 + 1) + pos.getY(t * 3 + 2)) / 3;
    for (const r of polys) if (insidePolygon(x, y, r.poly)) { part[t] = r.id; break; }
  }

  // SVG is y-down; the extrusion starts with the readable cap at z = 0, facing -z. Seen from -z,
  // screen right is -x: a half turn about z puts SVG right on -x and SVG down on -y, so the mark
  // reads correctly (not mirrored) for a viewer on the -z side, where the viewer is once the
  // statue has turned to face them
  geo.rotateZ(Math.PI);
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);

  // scale so the farthest point lands on `radius`
  let far = 0;
  for (let i = 0; i < pos.count; i++) far = Math.max(far, Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
  geo.scale(radius / far, radius / far, radius / far);
  geo.translate(center.x, center.y, center.z);

  // flat caps and walls, smooth across the bevel (same triangles, same order)
  geo.deleteAttribute('uv');
  geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(35));
  return { geometry: geo, part };
}
