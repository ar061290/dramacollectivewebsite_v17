// The cherry blossom tree beside the To do list (todo.html, laptops only): drawn once from a fixed
// seed into assets/todo/cherry-tree.svg, so it is the same tree every time and costs the page
// nothing to make. `node tools/art/cherry-tree.mjs [seed]` draws it again.
//
// A trunk rises from the foot of the box near its right edge and leans in; its boughs branch in
// twos and threes, thinning and shortening as they go, spreading up and to the left (the free space
// beside the list); clusters of five-petalled blossoms gather at the branch tips over soft clouds of
// colour (a canopy in full bloom), some behind the boughs and most in front. The colours are classes
// (ct-*), set per theme by src/styles/todo.css; the petals' hearts follow `color`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'assets', 'todo', 'cherry-tree.svg');
const W = 520, H = 700;
const seed = Number(process.argv[2] ?? 1426);

// mulberry32: a small seeded generator, so the tree comes out the same each time
let s = seed >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (a, b) => a + (b - a) * rand();
const r1 = (n) => Math.round(n * 10) / 10;
const DEG = Math.PI / 180;

const bark = [];   // tapered bough shapes
const tips = [];   // where blossoms gather: { x, y, depth }

/** A bough from (x, y), heading `angle`, `len` long, `w0` wide at its start: a curved, tapered ribbon. */
function bough(x, y, angle, len, w0, depth) {
  const w1 = w0 * between(0.62, 0.72);
  const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
  // a gentle bend, to one side or the other
  const bend = between(-0.16, 0.16) * len;
  const cx = (x + x2) / 2 - Math.sin(angle) * bend, cy = (y + y2) / 2 + Math.cos(angle) * bend;
  const left = [], right = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const px = u * u * x + 2 * u * t * cx + t * t * x2, py = u * u * y + 2 * u * t * cy + t * t * y2;
    const dx = 2 * u * (cx - x) + 2 * t * (x2 - cx), dy = 2 * u * (cy - y) + 2 * t * (y2 - cy);
    const d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const w = (w0 + (w1 - w0) * t) / 2;
    left.push(`${r1(px + nx * w)} ${r1(py + ny * w)}`);
    right.push(`${r1(px - nx * w)} ${r1(py - ny * w)}`);
  }
  bark.push(`<path d="M${left.join(' L')} L${right.reverse().join(' L')}Z"/>`);
  bark.push(`<circle cx="${r1(x2)}" cy="${r1(y2)}" r="${r1(w1 / 2)}"/>`);
  if (depth >= 5 && rand() < 0.3) tips.push({ x: (x + x2) / 2, y: (y + y2) / 2, depth: depth - 0.5 });
  if (depth >= 4) tips.push({ x: x2, y: y2, depth });
  if (depth >= 6 || w1 < 1.2) return;
  // twos and threes low in the crown; out at the ends a bough often just carries on
  const n = depth <= 3 ? (depth >= 1 && rand() < 0.2 ? 3 : 2) : rand() < 0.6 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    // fan out round the parent's heading, leaning up and to the left (toward the free space), and
    // never back down toward the ground or out past the right edge
    let a = angle + (n === 1 ? between(-14, 14) : n === 2 ? (i ? 1 : -1) * between(16, 36) : (i - 1) * between(24, 38)) * DEG;
    a += (-128 * DEG - a) * 0.12;
    a = Math.max(-176 * DEG, Math.min(-14 * DEG, a));
    if (x2 > W - 60 && Math.cos(a) > 0) a = -95 * DEG - between(0, 40) * DEG;
    bough(x2, y2, a, len * between(0.7, 0.84), w1, depth + 1);
  }
}

// the trunk, then a second bough low on it so the crown is wide
bough(438, H + 4, -99 * DEG, 168, 36, 0);
bough(436, H - 150, -142 * DEG, 104, 15, 2);

// blossoms: a cloud of colour behind each cluster, then the flowers, a few behind the boughs
const clouds = [], back = [], front = [];
for (const t of tips) {
  if (t.y > H - 170) continue; // no blossom low on the trunk
  const k = Math.min(1, (t.depth - 2) / 5);
  if (rand() < 0.45) clouds.push(`<circle class="ct-cloud" cx="${r1(t.x + between(-8, 8))}" cy="${r1(t.y + between(-6, 6))}" r="${r1(between(14, 30) * (0.6 + k * 0.5))}"/>`);
  const count = Math.round(between(2, 6) * (0.6 + k * 0.6));
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * between(8, 24);
    const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d * 0.85;
    if (x < 6 || x > W - 6 || y < 6) continue;
    const tone = rand();
    const cls = tone < 0.16 ? 'ct-p1' : tone < 0.5 ? 'ct-p2' : tone < 0.82 ? 'ct-p3' : 'ct-p4';
    const use = `<use href="#ct-f" class="${cls}" transform="translate(${r1(x)} ${r1(y)}) rotate(${Math.round(rand() * 72)}) scale(${r1(between(0.5, 1.05) * 10) / 10})"/>`;
    (rand() < 0.22 ? back : front).push(use);
  }
  // a bud or two at the very tips
  if (t.depth >= 6 && rand() < 0.5) front.push(`<circle class="ct-bud" cx="${r1(t.x + between(-5, 5))}" cy="${r1(t.y + between(-5, 5))}" r="${r1(between(1.6, 2.6))}"/>`);
}

// one flower: five rounded petals with a notch at the tip, and a small heart
const petal = 'M0 0C-2.6-1.8-3.6-5.4-1.4-7.6Q-.7-7-.1-7.9Q.6-7 1.4-7.6C3.6-5.4 2.6-1.8 0 0Z';
const flower = `<g id="ct-f">${[0, 72, 144, 216, 288].map((r) => `<path d="${petal}" transform="rotate(${r})"/>`).join('')}<circle r="1.5" fill="currentColor"/></g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
<defs>${flower}</defs>
<g class="ct-clouds">${clouds.join('')}</g>
<g class="ct-back">${back.join('')}</g>
<g class="ct-bark">${bark.join('')}</g>
<g class="ct-front">${front.join('')}</g>
</svg>
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log(`wrote ${OUT}: ${bark.length / 2} boughs, ${back.length + front.length} blossoms, ${clouds.length} clouds, ${(svg.length / 1024).toFixed(1)} KB`);
