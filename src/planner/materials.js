// Shared PBR materials and the procedural textures they use.
import * as THREE from 'three';
import { fbm, greyCanvas, normalCanvas, canvasTexture, makeCanvas } from './util.js';

export const M = {};
export const T = {};
let aniso = 8;

function tex(c, opts) {
  const t = canvasTexture(c, { aniso, ...opts });
  t.userData.own = false;
  return t;
}

function tilesHeight(size) {
  // 0.6 m square = 2 x 2 sports tiles with perforated tops and grooves between tiles.
  const half = size / 2;
  return (x, y) => {
    const tx = x % half, ty = y % half;
    if (tx < 3 || ty < 3 || tx > half - 3 || ty > half - 3) return 0.15;
    const px = (tx - 10) % 20, py = (ty - 10) % 20;
    if (tx > 10 && ty > 10 && tx < half - 10 && ty < half - 10 && px < 7 && py < 7) return 0.45;
    return 0.95 + (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1) * 0.03;
  };
}

export function initMaterials(renderer) {
  aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ----- textures -----
  const carpet = greyCanvas(256, (x, y) => 0.8 + 0.2 * fbm(x / 4, y / 4, 64, 3) + ((x * 7 + y * 13) % 5) * 0.01);
  T.carpet = tex(carpet, { repeat: [6, 3.5] });
  T.carpetN = tex(normalCanvas(256, (x, y) => fbm(x / 2, y / 2, 128, 2, 5), 3), { srgb: false, repeat: [6, 3.5] });

  const th = tilesHeight(512);
  const tileCol = greyCanvas(512, (x, y) => 0.35 + th(x, y) * 0.65);
  T.tiles = tex(tileCol, { repeat: [30, 43.3] });
  T.tilesN = tex(normalCanvas(512, th, 4), { srgb: false, repeat: [30, 43.3] });

  const wood = greyCanvas(512, (x, y) => {
    const n = fbm(x / 32, y / 32, 16, 4, 9);
    const rings = Math.sin((y / 512) * Math.PI * 2 * 14 + n * 9);
    return 0.74 + 0.12 * rings + 0.14 * (n - 0.5);
  });
  T.wood = tex(wood);

  T.powderN = tex(normalCanvas(256, (x, y) => fbm(x / 8, y / 8, 32, 3, 3), 1.2), { srgb: false, repeat: [4, 8] });

  const g = makeCanvas(64, 64);
  const gc = g.getContext('2d');
  gc.fillStyle = '#5a5a5a';
  gc.fillRect(0, 0, 64, 64);
  gc.fillStyle = '#0b0b0b';
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      gc.beginPath();
      gc.arc(x * 16 + 8 + (y % 2) * 8, y * 16 + 8, 5.2, 0, Math.PI * 2);
      gc.fill();
    }
  T.grille = tex(g);

  const velvet = greyCanvas(128, (x, y) => 0.85 + 0.15 * fbm(x / 2, y / 8, 64, 3, 11));
  T.velvet = tex(velvet, { repeat: [20, 4] });

  // ----- materials -----
  M.stageTop = new THREE.MeshStandardMaterial({
    color: 0x2f52d4, map: T.carpet, roughness: 0.95, normalMap: T.carpetN, normalScale: new THREE.Vector2(0.5, 0.5),
  });
  M.black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.92 });
  M.skirt = new THREE.MeshPhysicalMaterial({
    color: 0x0c0c0e, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0x3a3a44), sheenRoughness: 0.55, side: THREE.DoubleSide,
  });
  M.curtain = new THREE.MeshPhysicalMaterial({
    color: 0x040405, map: T.velvet, roughness: 0.95, sheen: 0.35, sheenColor: new THREE.Color(0x16171c), sheenRoughness: 0.5,
  });
  M.floor = new THREE.MeshStandardMaterial({
    color: 0x3453c2, map: T.tiles, normalMap: T.tilesN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.72,
  });
  M.aisle = new THREE.MeshStandardMaterial({
    color: 0xd23a33, map: T.tiles, normalMap: T.tilesN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.7,
  });
  M.ceiling = new THREE.MeshStandardMaterial({ color: 0xd9d8d4, roughness: 0.96 });
  M.ceilingPanel = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, emissive: 0xffffff, emissiveIntensity: 3, roughness: 0.4 });
  M.stairWood = new THREE.MeshStandardMaterial({ color: 0x8f4526, map: T.wood, roughness: 0.48 });
  M.stairEdge = new THREE.MeshStandardMaterial({ color: 0xb8714a, map: T.wood, roughness: 0.4 });
  M.truss = new THREE.MeshStandardMaterial({ color: 0xd2d2ce, roughness: 0.5, metalness: 0.25 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xdfe1e3, metalness: 1, roughness: 0.2 });
  M.alu = new THREE.MeshStandardMaterial({ color: 0x9fa3a8, metalness: 0.6, roughness: 0.55 });
  M.steelDark = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, metalness: 0.7, roughness: 0.45 });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.42 });
  M.fixture = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.45, metalness: 0.6 });
  M.lens = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.08, metalness: 0.2 });
  M.locker = new THREE.MeshPhysicalMaterial({
    color: 0x707e6c, roughness: 0.4, metalness: 0.25, clearcoat: 0.65, clearcoatRoughness: 0.22,
    normalMap: T.powderN, normalScale: new THREE.Vector2(0.35, 0.35),
  });
  M.lockerGap = new THREE.MeshStandardMaterial({ color: 0x2e352c, roughness: 0.7, metalness: 0.2 });
  M.lockerSlit = new THREE.MeshStandardMaterial({ color: 0x070807, roughness: 0.95 });
  M.speaker = new THREE.MeshStandardMaterial({ color: 0x161617, roughness: 0.55, metalness: 0.2 });
  M.speakerWhite = new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.5, metalness: 0.1 });
  M.grille = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, map: T.grille, roughness: 0.6, metalness: 0.5 });
  M.grilleWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.grille, roughness: 0.55, metalness: 0.3 });
  M.backing = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.85 });
  M.riserTop = new THREE.MeshStandardMaterial({ color: 0x222226, map: T.carpet, roughness: 0.95 });
  M.exitSign = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  for (const m of Object.values(M)) m.userData.shared = true;
}

const woodCache = new Map();
export function woodMat(hex) {
  if (!woodCache.has(hex))
    woodCache.set(hex, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), map: T.wood, roughness: 0.5 }));
  return woodCache.get(hex);
}

const fabricCache = new Map();
export function fabricMat(hex) {
  if (!fabricCache.has(hex))
    fabricCache.set(
      hex,
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(hex), map: T.carpet, roughness: 0.9, sheen: 0.45,
        sheenColor: new THREE.Color(hex), sheenRoughness: 0.6,
      })
    );
  return fabricCache.get(hex);
}

const paintCache = new Map();
export function paintMat(hex, rough = 0.6) {
  const k = hex + rough;
  if (!paintCache.has(k)) paintCache.set(k, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough }));
  return paintCache.get(k);
}

export const RISER_TOPS = { black: 0x1e1e22, blue: 0x2f52d4, grey: 0x6d6f74 };
const riserCache = new Map();
export function riserTopMat(key) {
  if (!riserCache.has(key))
    riserCache.set(key, new THREE.MeshStandardMaterial({ color: RISER_TOPS[key] ?? RISER_TOPS.black, map: T.carpet, roughness: 0.95 }));
  return riserCache.get(key);
}
