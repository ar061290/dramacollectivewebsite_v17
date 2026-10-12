// The fixed hall: floor, ceiling with panel lights, black curtains and the 7 x 4 x 1 m stage.
// Units are metres. x runs across the hall, y is up, +z points from the stage toward the audience.
// The stage front edge sits on z = 0.
import * as THREE from 'three';
import { M } from './materials.js';
import { boxG, mesh, pleatG, kelvinToRGB, makeCanvas, canvasTexture } from './util.js';

export const HALL = { W: 18, H: 6.5, zFront: -6, zBack: 20 };
export const STAGE = { W: 7, D: 4, H: 1, zBack: -4, zFront: 0 };

const RECT_K = 3.6; // ceiling light output at 100 %

export function buildHall() {
  const group = new THREE.Group();
  group.name = 'Hall';
  const L = HALL.zBack - HALL.zFront;
  const cz = (HALL.zBack + HALL.zFront) / 2;

  const floor = mesh(new THREE.PlaneGeometry(HALL.W, L), M.floor, { cast: false, name: 'Floor' });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, cz);
  group.add(floor);

  const ceiling = mesh(new THREE.PlaneGeometry(HALL.W, L), M.ceiling, { cast: false, name: 'Ceiling' });
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, HALL.H, cz);
  group.add(ceiling);

  // Black pleated curtains on all four walls.
  const walls = [];
  const addCurtain = (width, x, z, ry) => {
    const m = mesh(pleatG(width, HALL.H, 0.32, 0.09), M.curtain, { cast: false, name: 'Curtain' });
    m.position.set(x, HALL.H / 2, z);
    m.rotation.y = ry;
    group.add(m);
    walls.push(m);
  };
  addCurtain(HALL.W, 0, HALL.zFront + 0.06, 0);
  addCurtain(HALL.W, 0, HALL.zBack - 0.06, Math.PI);
  addCurtain(L, -HALL.W / 2 + 0.06, cz, Math.PI / 2);
  addCurtain(L, HALL.W / 2 - 0.06, cz, -Math.PI / 2);
  // Curtain track pelmet along the top of each wall.
  const pelmet = new THREE.Group();
  pelmet.add(mesh(boxG(HALL.W, 0.18, 0.1, 0, HALL.H - 0.09, HALL.zFront + 0.13), M.black, { cast: false }));
  pelmet.add(mesh(boxG(HALL.W, 0.18, 0.1, 0, HALL.H - 0.09, HALL.zBack - 0.13), M.black, { cast: false }));
  pelmet.add(mesh(boxG(0.1, 0.18, L, -HALL.W / 2 + 0.13, HALL.H - 0.09, cz), M.black, { cast: false }));
  pelmet.add(mesh(boxG(0.1, 0.18, L, HALL.W / 2 - 0.13, HALL.H - 0.09, cz), M.black, { cast: false }));
  group.add(pelmet);

  // Stage: blue carpet top, black pleated skirt on the front and sides.
  const stage = new THREE.Group();
  stage.name = 'Stage';
  const sz = (STAGE.zBack + STAGE.zFront) / 2;
  const stageTop = mesh(boxG(STAGE.W, 0.04, STAGE.D, 0, STAGE.H - 0.02, sz), M.stageTop, { name: 'Stage top' });
  const core = mesh(boxG(STAGE.W - 0.06, STAGE.H - 0.04, STAGE.D - 0.06, 0, (STAGE.H - 0.04) / 2, sz), M.black);
  stage.add(stageTop, core);
  const skirtH = STAGE.H - 0.04;
  const front = mesh(pleatG(STAGE.W + 0.04, skirtH, 0.11, 0.035), M.skirt);
  front.position.set(0, skirtH / 2, STAGE.zFront + 0.03);
  const left = mesh(pleatG(STAGE.D + 0.04, skirtH, 0.11, 0.035), M.skirt);
  left.position.set(-STAGE.W / 2 - 0.03, skirtH / 2, sz);
  left.rotation.y = -Math.PI / 2;
  const right = left.clone();
  right.position.x = STAGE.W / 2 + 0.03;
  right.rotation.y = Math.PI / 2;
  stage.add(front, left, right);
  group.add(stage);

  // Ceiling panel lights: a 6 x 8 grid of square diffusers, as in the hall photos.
  const xs = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
  const zs = Array.from({ length: 8 }, (_, i) => -4.5 + i * 3);
  const panelGeo = boxG(0.62, 0.03, 0.62);
  const panels = new THREE.InstancedMesh(panelGeo, M.ceilingPanel, xs.length * zs.length);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (const x of xs) for (const z of zs) panels.setMatrixAt(k++, m4.makeTranslation(x, HALL.H - 0.016, z));
  panels.computeBoundingSphere();
  panels.name = 'Ceiling lights';
  group.add(panels);

  const rects = [];
  for (const x of [-6, 0, 6])
    for (const z of [-3, 3, 9, 15]) {
      const l = new THREE.RectAreaLight(0xffffff, 0, 5.4, 5.4);
      l.position.set(x, HALL.H - 0.04, z);
      l.rotation.x = -Math.PI / 2;
      group.add(l);
      rects.push(l);
    }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x1a2244, 0);
  group.add(hemi);

  // Illuminated exit signs: real halls keep these on during shows.
  const sc = makeCanvas(256, 104);
  const sx = sc.getContext('2d');
  sx.fillStyle = '#0d9a49';
  sx.fillRect(0, 0, 256, 104);
  sx.fillStyle = '#ffffff';
  sx.font = "900 64px Lato, Arial, sans-serif";
  sx.textAlign = 'center';
  sx.textBaseline = 'middle';
  sx.fillText('EXIT', 128, 56);
  const signTex = canvasTexture(sc, { wrap: false });
  const signMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.6 });
  const signGeo = new THREE.PlaneGeometry(0.42, 0.17);
  [
    [-7.2, HALL.zBack - 0.2, Math.PI],
    [7.2, HALL.zBack - 0.2, Math.PI],
  ].forEach(([x, z, ry]) => {
    const s = new THREE.Mesh(signGeo, signMat);
    s.position.set(x, 2.7, z);
    s.rotation.y = ry;
    group.add(s);
  });
  [
    [-HALL.W / 2 + 0.2, 1.5, Math.PI / 2],
    [HALL.W / 2 - 0.2, 1.5, -Math.PI / 2],
  ].forEach(([x, z, ry]) => {
    const s = new THREE.Mesh(signGeo, signMat);
    s.position.set(x, 2.7, z);
    s.rotation.y = ry;
    group.add(s);
  });

  const col = new THREE.Color();
  function setHouseLights({ on, level, temp }) {
    const [r, g, b] = kelvinToRGB(temp);
    col.setRGB(r, g, b, THREE.SRGBColorSpace);
    const lv = on ? level : 0;
    for (const l of rects) {
      l.color.copy(col);
      l.intensity = lv * RECT_K;
    }
    M.ceilingPanel.emissive.copy(col);
    M.ceilingPanel.emissiveIntensity = on ? 1.5 + level * 5 : 0;
    M.ceilingPanel.color.setScalar(on ? 0.95 : 0.55);
    hemi.color.copy(col);
    hemi.intensity = lv * 0.45;
    return lv;
  }

  return {
    group,
    floor,
    stageTop,
    stage,
    supports: [floor, stageTop],
    solids: [floor, ceiling, stageTop, core, front, left, right, ...walls],
    setHouseLights,
  };
}
