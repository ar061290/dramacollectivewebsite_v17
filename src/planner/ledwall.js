// LED wall behind the stage: a fixed 8 x 4.5 m (16:9) screen built from 0.5 m modules.
// The picture is shown as emissive light, and three area lights carry its colours onto the stage.
import * as THREE from 'three';
import { M } from './materials.js';
import { boxG, mesh, makeCanvas, rodG } from './util.js';
import { getImage } from './images.js';

export const LED = { W: 8, H: 4.5, y0: 1.0, z: -4.45 };
const LIGHT_K = 14;

export function buildLedWall() {
  const group = new THREE.Group();
  group.name = 'LED wall';
  group.position.z = LED.z;

  const canvas = makeCanvas(1920, 1080);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x040405, roughness: 0.32, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1,
  });
  const screen = mesh(new THREE.PlaneGeometry(LED.W, LED.H), mat, { cast: false, name: 'LED screen' });
  screen.position.set(0, LED.y0 + LED.H / 2, 0.07);
  group.add(screen);

  // Cabinet frame and ground-stack supports.
  const cy = LED.y0 + LED.H / 2;
  group.add(mesh(boxG(LED.W + 0.08, LED.H + 0.08, 0.12, 0, cy, 0), M.black));
  const sup = [];
  for (const x of [-LED.W / 2 + 0.6, 0, LED.W / 2 - 0.6]) {
    sup.push(rodG(new THREE.Vector3(x, 0, -0.25), new THREE.Vector3(x, LED.y0 + LED.H, -0.25), 0.04, 8));
    sup.push(rodG(new THREE.Vector3(x, 0, -1.0), new THREE.Vector3(x, LED.y0 + LED.H * 0.7, -0.25), 0.03, 8));
    sup.push(boxG(0.5, 0.04, 1.2, x, 0.02, -0.55));
  }
  sup.forEach((g) => group.add(mesh(g, M.steelDark)));

  const lights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.RectAreaLight(0xffffff, 0, LED.W / 3, LED.H);
    l.position.set(-LED.W / 2 + (LED.W / 3) * (i + 0.5), cy, 0.1);
    l.rotation.y = Math.PI; // face the audience (+z)
    group.add(l);
    lights.push(l);
  }

  let key = '';
  let token = 0;
  const avg = [new THREE.Color(), new THREE.Color(), new THREE.Color()];

  function compose(src) {
    const c = canvas.getContext('2d');
    c.fillStyle = '#000';
    c.fillRect(0, 0, 1920, 1080);
    const ia = src.width / src.height, ta = 1920 / 1080;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (ia > ta) {
      sw = sh * ta;
      sx = (src.width - sw) / 2;
    } else {
      sh = sw / ta;
      sy = (src.height - sh) / 2;
    }
    c.drawImage(src, sx, sy, sw, sh, 0, 0, 1920, 1080);
    // Module seams every 0.5 m (16 x 9 cabinets).
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 1; i < 16; i++) c.fillRect(i * 120 - 1, 0, 2, 1080);
    for (let j = 1; j < 9; j++) c.fillRect(0, j * 120 - 1, 1920, 2);
    tex.needsUpdate = true;
    // Average colour of each third, used to tint the light the screen throws.
    const s = makeCanvas(96, 54);
    const sc = s.getContext('2d', { willReadFrequently: true });
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(canvas, 0, 0, 96, 54);
    const d = sc.getImageData(0, 0, 96, 54).data;
    for (let t = 0; t < 3; t++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < 54; y++)
        for (let x = t * 32; x < (t + 1) * 32; x++) {
          const i = (y * 96 + x) * 4;
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          n++;
        }
      avg[t].setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
    }
  }

  function applyLevels(s) {
    const on = s.on;
    mat.emissiveIntensity = on ? 0.15 + s.brightness * 1.0 : 0;
    lights.forEach((l, i) => {
      l.color.copy(avg[i]);
      l.intensity = on ? s.brightness * LIGHT_K : 0;
    });
  }

  function setState(s, onDone) {
    const k = JSON.stringify(s);
    if (k === key) return;
    const imageChanged = !key || JSON.parse(key).image !== s.image;
    key = k;
    if (imageChanged) {
      const my = ++token;
      const rec = getImage(s.image);
      rec.ready.then((cv) => {
        if (my !== token) return;
        compose(cv);
        applyLevels(s);
        onDone?.();
      });
    } else {
      applyLevels(s);
    }
  }

  return { group, screen, setState, solids: [screen] };
}
