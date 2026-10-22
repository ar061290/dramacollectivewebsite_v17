// The room the home stage's marble and the theme switch's earrings reflect: three's RoomEnvironment,
// pre-filtered (a PMREM, blurred 0.04) into a render target.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BLUR = 0.04;

/** The room made now, its programs compiled on the spot (a context given back, where nothing waits on it). */
export function makeRoom(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  try {
    return pmrem.fromScene(room, BLUR);
  } finally {
    room.dispose();
    pmrem.dispose();
  }
}

/**
 * The same room, made without holding the page. Making it compiles five programs (the room's two stone
 * materials and its lamps, the backdrop, the blur), and made at once the page's thread waited for each
 * to link: about half a second on a mid-range phone. They are compiled first where the browser compiles
 * in parallel (compileAsync), each by a stand-in that three.js keys as the real draw (drawn into a
 * target, so linear and untouched by tone mapping; the room's own light; the backdrop's back faces; the
 * blur's own material); then the room is made exactly as before and finds them ready. A compile that
 * has not ended in 5 s is left to finish as before. Resolves the target, or null if `skip()` says,
 * once the programs are ready, that it is no longer wanted (the context lost or the scene gone
 * meanwhile, or the room made by other means).
 */
export async function makeRoomSoon(renderer, skip = () => false) {
  const r = renderer;
  const pmrem = new THREE.PMREMGenerator(r);
  const room = new RoomEnvironment();
  const made = [];
  try {
    const target = new THREE.WebGLRenderTarget(1, 1);
    made.push(target);
    const eye = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    const backdrop = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false }));
    made.push(backdrop.geometry, backdrop.material);
    const compiling = [];
    r.setRenderTarget(target);
    compiling.push(r.compileAsync(room, eye), r.compileAsync(backdrop, eye));
    // the blur's material, as fromScene makes it (three.js 0.170's PMREMGenerator: where that differs,
    // the blur compiles in fromScene, as before)
    if (typeof pmrem._setSize === 'function' && typeof pmrem._allocateTargets === 'function') {
      pmrem._setSize(256);
      made.push(pmrem._allocateTargets());
      if (pmrem._blurMaterial && pmrem._lodPlanes?.[0]) compiling.push(r.compileAsync(new THREE.Mesh(pmrem._lodPlanes[0], pmrem._blurMaterial), new THREE.OrthographicCamera()));
    }
    r.setRenderTarget(null);
    await Promise.race([Promise.all(compiling), new Promise((res) => setTimeout(res, 5000))]);
  } catch { /* made as before, its programs compiled on the spot */ }
  try {
    if (skip()) return null;
    return pmrem.fromScene(room, BLUR);
  } finally {
    for (const m of made) m.dispose();
    room.dispose();
    pmrem.dispose();
  }
}
