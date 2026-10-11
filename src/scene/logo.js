// The Collective's mark as a 3D object: assets/brand/mark.svg (potrace's trace of mark-gold.png,
// see tools/logo/trace_logo.ps1) extruded with a bevel. Built at load time, in turntable space:
// centred on `center`, scaled so that every point lies within `radius` of it, front face toward -z
// (the viewer, once the statue has turned to face them).

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * @param {string} svgText
 * @param {object} o
 * @param {THREE.Vector3} o.center   where the logo's centre sits
 * @param {number} o.radius          the logo fits inside this sphere about `center`
 * @param {number} [o.depth]         extrusion depth, as a fraction of the logo's width
 * @param {number} [o.maxTriangles]  the curves are sampled as finely as this budget allows (the
 *                                   morph needs no more triangles than the statue has)
 * @returns {THREE.BufferGeometry}   non-indexed, with position and normal
 */
export function buildLogoGeometry(svgText, { center, radius, depth = 0.07, maxTriangles = Infinity }) {
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
  // SVG is y-down; the extrusion starts with the readable cap at z = 0, facing -z. Seen from -z,
  // screen right is -x: a half turn about z puts SVG right on -x and SVG down on -y, so the mark
  // reads correctly (not mirrored) for a viewer on the -z side, where the viewer is once the
  // statue has turned to face them
  geo.rotateZ(Math.PI);
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);

  // scale so the farthest point lands on `radius`
  const pos = geo.attributes.position;
  let far = 0;
  for (let i = 0; i < pos.count; i++) far = Math.max(far, Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
  geo.scale(radius / far, radius / far, radius / far);
  geo.translate(center.x, center.y, center.z);

  // flat caps and walls, smooth across the bevel
  geo.deleteAttribute('uv');
  const creased = toCreasedNormals(geo, THREE.MathUtils.degToRad(35));
  geo.dispose();
  geo = creased;
  return geo;
}
