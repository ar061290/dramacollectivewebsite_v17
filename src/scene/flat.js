// The 3D logo going flat, so that it becomes its vector stand-in (src/scene/vectorLogo.js) rather
// than being covered by it. Driven by one number, uFlat (0 the lit stone .. 1 flat), set by the
// stage from the sequence's vector track:
//   - the relief sinks into the plane of the logo's front face (the vertex shaders, morph.js and the
//     star below), so its outline on screen becomes the vector's (the vector is stroked by the bevel's
//     flare, which the sunk bevel leaves on that plane);
//   - its light settles into the vector's own gradient, in the colours the canvas shows (written after
//     the colour-space conversion, the same sRGB values the vector is filled with);
// both sweeping down the mark from the top, a soft band a third of its height deep.

import * as THREE from 'three';

/** GLSL for the vertex and fragment shaders alike. */
export const FLAT_HEAD = /* glsl */`
  uniform float uFlat;
  uniform vec2 uFlatY;    // the gradient's top and foot, as y in the logo's own space
  uniform vec3 uFlatTop;  // the vector's colours (sRGB, 0..1)
  uniform vec3 uFlatFoot;
  varying float vFlatT;
  float flatT(float y) { return clamp((y - uFlatY.x) / (uFlatY.y - uFlatY.x), 0.0, 1.0); }
  float flatK(float t) { return smoothstep(0.0, 1.0, uFlat * 1.5 - 0.5 * t); }
`;

/** After <colorspace_fragment>: the fragment's colour, settling into the vector's gradient. */
export const FLAT_FRAGMENT = /* glsl */`
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(uFlatTop, uFlatFoot, vFlatT), flatK(vFlatT));
`;

export function flatUniforms() {
  return {
    uFlat: { value: 0 },
    uFlatY: { value: new THREE.Vector2(1, 0) },
    uFlatTop: { value: new THREE.Vector3(0.6, 0.585, 0.55) },
    uFlatFoot: { value: new THREE.Vector3(0.467, 0.451, 0.42) },
  };
}

/** '#rrggbb' to a 0..1 vector (no colour management: these are the canvas' own values). */
export function hexToVec3(hex, out = new THREE.Vector3()) {
  const n = parseInt(hex.slice(1), 16);
  return out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * The star beside the mask is a mesh of its own (src/scene/star.js), centred on its place on the
 * logo (`home`, logo space): it goes flat with the rest, sharing the logo's flat uniforms.
 * @param {THREE.Material} material
 * @param {object} shared       the morph's uniforms (uFlat, uFlatY, uFlatTop, uFlatFoot, uFlatZ)
 * @param {THREE.Vector3} home  the star's centre on the logo, logo space
 */
export function flattenStar(material, shared, home) {
  const uniforms = { ...shared, uStarHome: { value: home.clone() } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform vec3 uStarHome;\nuniform float uFlatZ;\n${FLAT_HEAD}\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vFlatT = flatT(position.y + uStarHome.y);
  transformed.z = mix(transformed.z, uFlatZ - uStarHome.z, flatK(vFlatT));`);
    shader.fragmentShader = `${FLAT_HEAD}\n${shader.fragmentShader}`
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${FLAT_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => 'dc-star-flat';
  material.needsUpdate = true;
}
