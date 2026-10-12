// Image library for the LED wall and the printed box-set walls.
// Built-in pictures are painted with canvas code, so the app needs no image files.
// Uploaded pictures are downscaled and kept as data URLs inside the saved design.
import * as THREE from 'three';
import { makeCanvas, rng, fbm } from './util.js';

const FULL_W = 1920, FULL_H = 1080;

function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}
function rad(c, x, y, r, stops) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}
function fill(c, style, x = 0, y = 0, w = c.canvas.width, h = c.canvas.height) {
  c.fillStyle = style;
  c.fillRect(x, y, w, h);
}
function ridge(r, n = 5) {
  const waves = Array.from({ length: n }, (_, i) => ({ f: (i + 1) * (0.6 + r() * 0.9), p: r() * 6.28, a: 1 / (i + 1) }));
  return (t) => waves.reduce((s, w) => s + Math.sin(t * w.f + w.p) * w.a, 0) / 1.6;
}
function hills(c, w, h, base, amp, color, seed, freq = 6) {
  const f = ridge(rng(seed));
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += w / 160) c.lineTo(x, base + f((x / w) * freq) * amp);
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = color;
  c.fill();
}
function frame(c, x, y, w, h, t, col) {
  c.fillStyle = col;
  c.fillRect(x - t, y - t, w + 2 * t, t);
  c.fillRect(x - t, y + h, w + 2 * t, t);
  c.fillRect(x - t, y, t, h);
  c.fillRect(x + w, y, t, h);
}
function noiseLayer(c, w, h, scale, alpha, seed, tint = [0, 0, 0]) {
  const sw = Math.max(8, Math.round(w / 4)), sh = Math.max(8, Math.round(h / 4));
  const n = makeCanvas(sw, sh);
  const nc = n.getContext('2d');
  const img = nc.createImageData(sw, sh);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const v = fbm((x / sw) * scale, (y / sh) * scale * (sh / sw), 1024, 4, seed);
      const i = (y * sw + x) * 4;
      img.data[i] = tint[0];
      img.data[i + 1] = tint[1];
      img.data[i + 2] = tint[2];
      img.data[i + 3] = Math.max(0, v - 0.35) * 255 * alpha * 2;
    }
  nc.putImageData(img, 0, 0);
  c.drawImage(n, 0, 0, w, h);
}
function pineTree(c, x, base, hgt, col) {
  c.fillStyle = col;
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const tw = hgt * (0.42 - i * 0.07);
    const ty = base - hgt * (i * 0.22);
    c.beginPath();
    c.moveTo(x - tw / 2, ty);
    c.lineTo(x + tw / 2, ty);
    c.lineTo(x, ty - hgt * 0.42);
    c.closePath();
    c.fill();
  }
  c.fillRect(x - hgt * 0.02, base, hgt * 0.04, hgt * 0.06);
}
function warli(c, x, y, s, col) {
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = s * 0.08;
  c.beginPath();
  c.moveTo(x - s * 0.25, y - s * 0.55);
  c.lineTo(x + s * 0.25, y - s * 0.55);
  c.lineTo(x, y - s * 0.2);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(x - s * 0.22, y + s * 0.15);
  c.lineTo(x + s * 0.22, y + s * 0.15);
  c.lineTo(x, y - s * 0.2);
  c.closePath();
  c.fill();
  c.beginPath();
  c.arc(x, y - s * 0.7, s * 0.13, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(x - s * 0.25, y - s * 0.5);
  c.lineTo(x - s * 0.45, y - s * 0.25);
  c.moveTo(x + s * 0.25, y - s * 0.5);
  c.lineTo(x + s * 0.45, y - s * 0.25);
  c.moveTo(x - s * 0.12, y + s * 0.15);
  c.lineTo(x - s * 0.2, y + s * 0.5);
  c.moveTo(x + s * 0.12, y + s * 0.15);
  c.lineTo(x + s * 0.2, y + s * 0.5);
  c.stroke();
}

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Lato, 'Open Sans', Arial, sans-serif";
const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";

// Each generator paints into a canvas of any size (thumbnails reuse them at small sizes).
const GENERATORS = [
  {
    id: 'founders', name: "Founder's Day", use: 'both',
    draw(c, w, h) {
      fill(c, lin(c, 0, 0, w, h, [[0, '#131a4f'], [0.55, '#3b1d70'], [1, '#6e1f5c']]));
      fill(c, rad(c, w * 0.5, h * 0.42, w * 0.55, [[0, 'rgba(255,196,110,0.28)'], [1, 'rgba(255,196,110,0)']]));
      const r = rng(7);
      for (let i = 0; i < 70; i++) {
        c.fillStyle = `rgba(255,${190 + r() * 50},${110 + r() * 60},${0.05 + r() * 0.12})`;
        c.beginPath();
        c.arc(r() * w, r() * h, (4 + r() * 40) * (h / 1080), 0, Math.PI * 2);
        c.fill();
      }
      const gold = lin(c, 0, h * 0.3, 0, h * 0.66, [[0, '#fbe3a0'], [0.5, '#e2b358'], [1, '#b67f2c']]);
      c.strokeStyle = 'rgba(232,186,96,0.7)';
      c.lineWidth = Math.max(1, h * 0.003);
      c.strokeRect(w * 0.03, h * 0.05, w * 0.94, h * 0.9);
      c.strokeRect(w * 0.038, h * 0.064, w * 0.924, h * 0.872);
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.fillStyle = gold;
      c.font = `700 ${h * 0.2}px ${SERIF}`;
      c.fillText("Founder's Day", w / 2, h * 0.48);
      c.font = `italic 400 ${h * 0.1}px ${SERIF}`;
      c.fillText('Celebrations', w / 2, h * 0.64);
      c.fillStyle = 'rgba(247,226,180,0.85)';
      c.font = `500 ${h * 0.036}px ${SANS}`;
      c.fillText('CELEBRATING VISION  ·  INSPIRING PURPOSE', w / 2, h * 0.78);
      c.fillStyle = gold;
      c.fillRect(w * 0.3, h * 0.7, w * 0.4, Math.max(1, h * 0.004));
    },
  },
  {
    id: 'welcome', name: 'Welcome slide', use: 'led',
    draw(c, w, h) {
      fill(c, lin(c, 0, 0, 0, h, [[0, '#0f2a3f'], [1, '#081520']]));
      fill(c, rad(c, w * 0.8, h * 0.2, w * 0.6, [[0, 'rgba(90,190,255,0.25)'], [1, 'rgba(90,190,255,0)']]));
      c.fillStyle = '#ffb547';
      c.fillRect(w * 0.08, h * 0.3, w * 0.006, h * 0.36);
      c.textAlign = 'left';
      c.fillStyle = '#f3efe8';
      c.font = `600 ${h * 0.15}px ${SANS}`;
      c.fillText('Welcome', w * 0.11, h * 0.46);
      c.fillStyle = 'rgba(243,239,232,0.75)';
      c.font = `400 ${h * 0.055}px ${SANS}`;
      c.fillText('An evening of theatre by the Drama Collective', w * 0.11, h * 0.58);
      c.font = `500 ${h * 0.04}px ${SANS}`;
      c.fillStyle = '#6cc8ff';
      c.fillText('Please switch off your phones', w * 0.11, h * 0.66);
    },
  },
  {
    id: 'sunset', name: 'Sunset hills', use: 'both',
    draw(c, w, h) {
      fill(c, lin(c, 0, 0, 0, h, [[0, '#211a4e'], [0.42, '#9e3a79'], [0.66, '#f0744b'], [0.8, '#ffc36c']]));
      fill(c, rad(c, w * 0.5, h * 0.7, h * 0.7, [[0, 'rgba(255,220,140,0.75)'], [1, 'rgba(255,220,140,0)']]));
      c.fillStyle = '#ffe6a6';
      c.beginPath();
      c.arc(w * 0.5, h * 0.7, h * 0.08, 0, Math.PI * 2);
      c.fill();
      hills(c, w, h, h * 0.72, h * 0.06, '#6b2c63', 3, 5);
      hills(c, w, h, h * 0.79, h * 0.05, '#42204d', 5, 7);
      hills(c, w, h, h * 0.87, h * 0.04, '#1f1029', 9, 9);
    },
  },
  {
    id: 'night', name: 'Starry night', use: 'both',
    draw(c, w, h) {
      fill(c, lin(c, 0, 0, 0, h, [[0, '#01030c'], [0.6, '#0b1a3d'], [1, '#1d2f60']]));
      const r = rng(11);
      c.save();
      c.translate(w / 2, h / 2);
      c.rotate(-0.35);
      fill(c, rad(c, 0, 0, w * 0.5, [[0, 'rgba(120,140,220,0.18)'], [1, 'rgba(120,140,220,0)']]), -w, -h * 0.12, w * 2, h * 0.24);
      c.restore();
      for (let i = 0; i < 900; i++) {
        const s = r() ** 3 * 2.4 * (h / 1080) + 0.4;
        c.fillStyle = `rgba(255,255,${220 + r() * 35},${0.3 + r() * 0.7})`;
        c.beginPath();
        c.arc(r() * w, r() * h * 0.92, s, 0, Math.PI * 2);
        c.fill();
      }
      fill(c, rad(c, w * 0.78, h * 0.24, h * 0.26, [[0, 'rgba(230,236,255,0.45)'], [1, 'rgba(230,236,255,0)']]));
      c.fillStyle = '#eef1f8';
      c.beginPath();
      c.arc(w * 0.78, h * 0.24, h * 0.07, 0, Math.PI * 2);
      c.fill();
      hills(c, w, h, h * 0.9, h * 0.03, '#050814', 21, 8);
    },
  },
  {
    id: 'forest', name: 'Misty forest', use: 'both',
    draw(c, w, h) {
      fill(c, lin(c, 0, 0, 0, h, [[0, '#a9c8b7'], [0.5, '#dfe9da'], [1, '#9db6a2']]));
      c.save();
      c.globalAlpha = 0.18;
      c.fillStyle = '#fffbe6';
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(w * (0.05 + i * 0.07), 0);
        c.lineTo(w * (0.1 + i * 0.07), 0);
        c.lineTo(w * (0.55 + i * 0.12), h);
        c.lineTo(w * (0.4 + i * 0.12), h);
        c.fill();
      }
      c.restore();
      const cols = ['#8fae9c', '#6e9180', '#4b6f5c', '#2c4c3b', '#12291d'];
      cols.forEach((col, i) => {
        const r = rng(40 + i);
        const base = h * (0.56 + i * 0.1);
        for (let k = 0; k < 26 + i * 6; k++) pineTree(c, r() * w, base + r() * h * 0.04, h * (0.22 + r() * 0.2) * (1 + i * 0.25), col);
      });
      fill(c, '#0c1c13', 0, h * 0.96, w, h * 0.04);
    },
  },
  {
    id: 'city', name: 'City at night', use: 'both',
    draw(c, w, h) {
      fill(c, lin(c, 0, 0, 0, h, [[0, '#0a0f2e'], [0.55, '#3a2a6c'], [0.85, '#e0717b']]));
      const layers = [['#2a2352', 0.5, 0.0], ['#181535', 0.62, 0.35], ['#0b0a1b', 0.74, 0.6]];
      layers.forEach(([col, top, lit], li) => {
        const r = rng(60 + li);
        let x = -20;
        while (x < w) {
          const bw = w * (0.03 + r() * 0.06);
          const bh = h * (0.18 + r() * 0.35) * (1 - li * 0.15);
          const y = h * top + h * 0.3 - bh;
          c.fillStyle = col;
          c.fillRect(x, y, bw, h - y);
          if (r() < 0.3) c.fillRect(x + bw * 0.45, y - h * 0.05, bw * 0.06, h * 0.05);
          if (lit > 0) {
            const ww = Math.max(2, bw * 0.08), wh = Math.max(2, h * 0.012);
            for (let yy = y + wh * 2; yy < h - wh; yy += wh * 2.4)
              for (let xx = x + ww; xx < x + bw - ww; xx += ww * 2) {
                if (r() < lit * 0.55) {
                  c.fillStyle = r() < 0.8 ? 'rgba(255,208,122,0.9)' : 'rgba(170,220,255,0.85)';
                  c.fillRect(xx, yy, ww, wh);
                }
              }
          }
          x += bw + w * 0.004;
        }
      });
    },
  },
  {
    id: 'ocean', name: 'Ocean', use: 'both',
    draw(c, w, h) {
      const hz = h * 0.55;
      fill(c, lin(c, 0, 0, 0, hz, [[0, '#6aa9df'], [1, '#f6d8ac']]), 0, 0, w, hz);
      fill(c, rad(c, w * 0.62, hz - h * 0.06, h * 0.45, [[0, 'rgba(255,236,190,0.9)'], [1, 'rgba(255,236,190,0)']]), 0, 0, w, hz);
      c.fillStyle = '#fff4d8';
      c.beginPath();
      c.arc(w * 0.62, hz - h * 0.06, h * 0.05, 0, Math.PI * 2);
      c.fill();
      fill(c, lin(c, 0, hz, 0, h, [[0, '#2f7299'], [1, '#0b2a45']]), 0, hz, w, h - hz);
      const r = rng(5);
      for (let i = 0; i < 380; i++) {
        const y = hz + (r() ** 1.6) * (h - hz);
        const spread = (y - hz) / (h - hz);
        const nearSun = r() < 0.55;
        const x = nearSun ? w * 0.62 + (r() - 0.5) * w * (0.05 + spread * 0.25) : r() * w;
        c.fillStyle = nearSun ? `rgba(255,230,170,${0.25 + r() * 0.5})` : `rgba(200,230,255,${0.08 + r() * 0.12})`;
        c.fillRect(x, y, w * (0.01 + r() * 0.04) * (0.4 + spread), Math.max(1, h * 0.003));
      }
    },
  },
  {
    id: 'palace', name: 'Palace hall', use: 'both',
    draw(c, w, h) {
      fill(c, lin(c, 0, 0, 0, h, [[0, '#4b0c1a'], [1, '#22050c']]));
      const n = 5, aw = w / n;
      for (let i = 0; i < n; i++) {
        const x = i * aw, cx = x + aw / 2, top = h * 0.2, bot = h * 0.78, ar = aw * 0.32;
        c.fillStyle = lin(c, 0, top, 0, bot, [[0, '#15040a'], [1, '#3a0a18']]);
        c.beginPath();
        c.moveTo(cx - ar, bot);
        c.lineTo(cx - ar, top + ar);
        c.arc(cx, top + ar, ar, Math.PI, 0);
        c.lineTo(cx + ar, bot);
        c.fill();
        c.strokeStyle = '#d6a64a';
        c.lineWidth = Math.max(1, h * 0.008);
        c.stroke();
        fill(c, lin(c, x, 0, x + aw * 0.12, 0, [[0, '#8a6424'], [0.5, '#e8c16a'], [1, '#8a6424']]), x - aw * 0.06, h * 0.12, aw * 0.12, bot - h * 0.12);
        fill(c, rad(c, cx, top + ar * 0.3, ar * 1.2, [[0, 'rgba(255,200,120,0.35)'], [1, 'rgba(255,200,120,0)']]));
      }
      fill(c, lin(c, 0, 0, w, 0, [[0, '#8a6424'], [0.5, '#e8c16a'], [1, '#8a6424']]), 0, h * 0.1, w, h * 0.03);
      for (let y = 0; y < 6; y++) {
        const yy = h * 0.78 + y * (h * 0.22) / 6;
        for (let x = 0; x < 16; x++) {
          c.fillStyle = (x + y) % 2 ? '#e8dcc2' : '#2a1a14';
          c.fillRect((x * w) / 16, yy, w / 16 + 1, h * 0.22 / 6 + 1);
        }
      }
    },
  },
  {
    id: 'drapes', name: 'Red drapes', use: 'both',
    draw(c, w, h) {
      const r = rng(3);
      const waves = Array.from({ length: 4 }, (_, i) => ({ f: (i + 1) * 9 + r() * 6, p: r() * 6.28, a: 1 / (i + 1) }));
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const s = waves.reduce((a, v) => a + Math.sin(t * v.f * 6.28 / 3 + v.p) * v.a, 0) / 2.1;
        const l = 0.45 + 0.4 * s;
        c.fillStyle = `rgb(${Math.round(150 * l + 40)},${Math.round(14 * l + 6)},${Math.round(28 * l + 10)})`;
        c.fillRect(x, 0, 1, h);
      }
      fill(c, lin(c, 0, 0, 0, h, [[0, 'rgba(0,0,0,0.35)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']]));
      for (let i = 0; i < 6; i++) {
        const x0 = (i * w) / 6, x1 = ((i + 1) * w) / 6;
        c.fillStyle = '#7a0a18';
        c.beginPath();
        c.moveTo(x0, 0);
        c.quadraticCurveTo((x0 + x1) / 2, h * 0.3, x1, 0);
        c.fill();
        c.strokeStyle = '#e0b053';
        c.lineWidth = Math.max(2, h * 0.012);
        c.beginPath();
        c.moveTo(x0, 0);
        c.quadraticCurveTo((x0 + x1) / 2, h * 0.3, x1, 0);
        c.stroke();
      }
    },
  },
  {
    id: 'waves', name: 'Colour waves', use: 'led',
    draw(c, w, h) {
      fill(c, '#07061a');
      c.globalCompositeOperation = 'lighter';
      const cols = ['#ff4f9a', '#ffb547', '#4fe3ff', '#8b6bff', '#ff6b4f', '#50ffb0', '#6c8bff'];
      cols.forEach((col, i) => {
        c.strokeStyle = col;
        c.globalAlpha = 0.45;
        c.lineWidth = h * (0.03 + (i % 3) * 0.025);
        c.shadowColor = col;
        c.shadowBlur = h * 0.05;
        c.beginPath();
        for (let x = 0; x <= w; x += w / 120) {
          const y = h * 0.5 + Math.sin((x / w) * 6.28 * (1 + i * 0.3) + i) * h * (0.18 + i * 0.03) + Math.sin((x / w) * 20 + i * 2) * h * 0.02;
          x ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      });
      c.globalAlpha = 1;
      c.shadowBlur = 0;
      c.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'clouds', name: 'Daytime sky', use: 'both',
    draw(c, w, h) {
      fill(c, lin(c, 0, 0, 0, h, [[0, '#3c83d4'], [1, '#b5dbf6']]));
      const r = rng(21);
      for (let k = 0; k < 7; k++) {
        const cx = r() * w, cy = h * (0.15 + r() * 0.6), s = h * (0.06 + r() * 0.08);
        for (let i = 0; i < 14; i++) {
          const x = cx + (r() - 0.5) * s * 5, y = cy + (r() - 0.5) * s * 1.2, rr = s * (0.6 + r() * 0.9);
          fill(c, rad(c, x, y, rr, [[0, 'rgba(255,255,255,0.85)'], [0.6, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]));
        }
      }
    },
  },
  {
    id: 'brick', name: 'Brick wall', use: 'set',
    draw(c, w, h) {
      fill(c, '#b3a797');
      const r = rng(8);
      const rowH = h / 22, bw = rowH * 3.3, gap = Math.max(1, rowH * 0.12);
      const pal = ['#8e3b26', '#a24a2f', '#7a3322', '#b35a3a', '#94442d', '#6d2d1e'];
      for (let row = 0; row < 23; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -off; x < w; x += bw) {
          c.fillStyle = pal[Math.floor(r() * pal.length)];
          c.fillRect(x + gap / 2, row * rowH + gap / 2, bw - gap, rowH - gap);
          c.fillStyle = `rgba(0,0,0,${r() * 0.15})`;
          c.fillRect(x + gap / 2, row * rowH + rowH * 0.6, bw - gap, rowH * 0.4 - gap / 2);
        }
      }
      noiseLayer(c, w, h, 10, 0.4, 4);
    },
  },
  {
    id: 'living', name: 'Living room', use: 'set',
    draw(c, w, h) {
      fill(c, '#e6d5b3');
      const s = h / 14;
      c.fillStyle = '#d4bd90';
      for (let y = 0; y < h * 0.66; y += s)
        for (let x = ((y / s) % 2) * s * 0.5; x < w; x += s) {
          c.beginPath();
          c.moveTo(x, y - s * 0.22);
          c.lineTo(x + s * 0.14, y);
          c.lineTo(x, y + s * 0.22);
          c.lineTo(x - s * 0.14, y);
          c.fill();
        }
      fill(c, '#f1ebdf', 0, h * 0.66, w, h * 0.34);
      c.strokeStyle = '#d2c6b1';
      c.lineWidth = Math.max(1, h * 0.006);
      for (let x = w * 0.02; x < w; x += w / 8) c.strokeRect(x, h * 0.7, w / 8 - w * 0.04, h * 0.22);
      fill(c, '#fbf8f2', 0, h * 0.65, w, h * 0.015);
      fill(c, '#5a3a24', 0, h * 0.96, w, h * 0.04);
      const wx = w * 0.4, wy = h * 0.14, ww = w * 0.2, wh = h * 0.42;
      fill(c, lin(c, 0, wy, 0, wy + wh, [[0, '#8fc3ea'], [1, '#dcefff']]), wx, wy, ww, wh);
      frame(c, wx, wy, ww, wh, h * 0.014, '#fbfaf6');
      fill(c, '#fbfaf6', wx + ww / 2 - h * 0.006, wy, h * 0.012, wh);
      fill(c, '#fbfaf6', wx, wy + wh / 2 - h * 0.006, ww, h * 0.012);
      [-1, 1].forEach((d) => {
        const cx = d < 0 ? wx - w * 0.05 : wx + ww;
        fill(c, lin(c, cx, 0, cx + w * 0.05, 0, [[0, '#6e1426'], [0.5, '#a3263c'], [1, '#6e1426']]), cx, wy - h * 0.04, w * 0.05, wh + h * 0.12);
      });
      fill(c, '#3b2616', wx - w * 0.07, wy - h * 0.05, ww + w * 0.14, h * 0.015);
      [[0.1, 0.2], [0.76, 0.24]].forEach(([fx, fy], i) => {
        const x = w * fx, y = h * fy, fw = w * 0.12, fh = h * 0.24;
        fill(c, lin(c, 0, y, 0, y + fh, i ? [[0, '#e9a15a'], [1, '#6d4a7a']] : [[0, '#86b6c9'], [1, '#4d7d4b']]), x, y, fw, fh);
        c.save();
        c.beginPath();
        c.rect(x, y, fw, fh);
        c.clip();
        c.translate(x, y);
        hills(c, fw, fh, fh * 0.68, fh * 0.07, 'rgba(28,46,30,0.65)', 2 + i, 4);
        c.restore();
        frame(c, x, y, fw, fh, h * 0.016, '#b58a3a');
      });
    },
  },
  {
    id: 'classroom', name: 'Classroom', use: 'set',
    draw(c, w, h) {
      fill(c, '#ebe5c8');
      fill(c, '#b8c7a2', 0, h * 0.72, w, h * 0.28);
      fill(c, '#8a9a75', 0, h * 0.715, w, h * 0.012);
      const bx = w * 0.22, by = h * 0.18, bw = w * 0.5, bh = h * 0.42;
      fill(c, '#23473a', bx, by, bw, bh);
      c.save();
      c.beginPath();
      c.rect(bx, by, bw, bh);
      c.clip();
      noiseLayer(c, w, h, 8, 0.12, 2, [255, 255, 255]);
      c.restore();
      frame(c, bx, by, bw, bh, h * 0.018, '#7a5230');
      fill(c, '#7a5230', bx - h * 0.02, by + bh + h * 0.012, bw + h * 0.04, h * 0.02);
      c.fillStyle = 'rgba(245,245,235,0.9)';
      c.font = `600 ${h * 0.07}px ${HAND}`;
      c.textAlign = 'left';
      c.fillText('Act I, Scene 2', bx + bw * 0.08, by + bh * 0.32);
      c.font = `400 ${h * 0.045}px ${HAND}`;
      c.fillText('Homework: learn your lines!', bx + bw * 0.08, by + bh * 0.55);
      c.fillText('2 + 2 = 4', bx + bw * 0.08, by + bh * 0.78);
      const px = w * 0.78, py = h * 0.2, pw = w * 0.16, ph = h * 0.3;
      fill(c, '#c49a67', px, py, pw, ph);
      frame(c, px, py, pw, ph, h * 0.01, '#8a6238');
      const r = rng(4);
      const notes = ['#fff27a', '#ff9ec4', '#9fe0ff', '#b6f59a', '#ffffff'];
      for (let i = 0; i < 7; i++) {
        c.save();
        c.translate(px + pw * (0.15 + r() * 0.6), py + ph * (0.12 + r() * 0.6));
        c.rotate((r() - 0.5) * 0.3);
        fill(c, notes[i % notes.length], 0, 0, pw * 0.26, ph * 0.22);
        c.restore();
      }
      const cx = w * 0.1, cy = h * 0.22, cr = h * 0.06;
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(cx, cy, cr, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#222';
      c.lineWidth = h * 0.006;
      c.stroke();
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx, cy - cr * 0.75);
      c.moveTo(cx, cy);
      c.lineTo(cx + cr * 0.5, cy + cr * 0.1);
      c.stroke();
    },
  },
  {
    id: 'paintwall', name: 'Painted wall', use: 'set',
    draw(c, w, h) {
      fill(c, '#ebe5c8');
      noiseLayer(c, w, h, 5, 0.12, 14, [120, 110, 80]);
      fill(c, '#b8c7a2', 0, h * 0.72, w, h * 0.28);
      fill(c, '#8a9a75', 0, h * 0.715, w, h * 0.012);
      fill(c, '#6f7d5c', 0, h * 0.965, w, h * 0.035);
      const px = w * 0.35, py = h * 0.22, pw = w * 0.3, ph = h * 0.3;
      fill(c, '#f6f2e6', px, py, pw, ph);
      frame(c, px, py, pw, ph, h * 0.01, '#3b5a8a');
      c.fillStyle = '#3b5a8a';
      c.textAlign = 'center';
      c.font = `700 ${h * 0.05}px ${SANS}`;
      c.fillText('OUR SCHOOL RULES', px + pw / 2, py + ph * 0.25);
      c.fillStyle = '#555';
      c.font = `400 ${h * 0.03}px ${SANS}`;
      ['Be kind', 'Be on time', 'Always do your best'].forEach((t, i) => c.fillText(t, px + pw / 2, py + ph * (0.48 + i * 0.17)));
    },
  },
  {
    id: 'library', name: 'Library shelves', use: 'set',
    draw(c, w, h) {
      fill(c, '#2e1b0f');
      const r = rng(12);
      const shelves = 5, sh = h / shelves;
      const pal = ['#7b1e22', '#1e3f66', '#2f5a36', '#8a6a2a', '#4a2a55', '#b24a2a', '#243b3f', '#c9b48a', '#5c3a1e'];
      for (let s = 0; s < shelves; s++) {
        const y0 = s * sh + sh * 0.08, y1 = (s + 1) * sh - sh * 0.08;
        let x = w * 0.01;
        while (x < w * 0.99) {
          const bw = w * (0.008 + r() * 0.014);
          const bh = (y1 - y0) * (0.7 + r() * 0.28);
          const col = pal[Math.floor(r() * pal.length)];
          c.fillStyle = col;
          c.fillRect(x, y1 - bh, bw, bh);
          c.fillStyle = 'rgba(230,190,90,0.7)';
          c.fillRect(x, y1 - bh * 0.85, bw, Math.max(1, bh * 0.02));
          c.fillRect(x, y1 - bh * 0.2, bw, Math.max(1, bh * 0.02));
          fill(c, lin(c, x, 0, x + bw, 0, [[0, 'rgba(0,0,0,0.35)'], [0.4, 'rgba(255,255,255,0.08)'], [1, 'rgba(0,0,0,0.35)']]), x, y1 - bh, bw, bh);
          x += bw + (r() < 0.08 ? w * 0.02 : w * 0.0015);
        }
        fill(c, lin(c, 0, y1, 0, y1 + sh * 0.16, [[0, '#7a4d27'], [1, '#4a2c14']]), 0, y1, w, sh * 0.16);
      }
      for (let i = 0; i <= 4; i++) fill(c, '#5a361a', (i * w) / 4 - w * 0.008, 0, w * 0.016, h);
    },
  },
  {
    id: 'kitchen', name: 'Kitchen', use: 'set',
    draw(c, w, h) {
      fill(c, '#f3f1ec');
      const tw = w / 40, tl = tw / 2;
      c.strokeStyle = '#cfcac0';
      c.lineWidth = Math.max(1, h * 0.002);
      for (let y = h * 0.3; y < h * 0.6; y += tl)
        for (let x = ((y / tl) % 2) * tw * 0.5 - tw; x < w; x += tw) c.strokeRect(x, y, tw, tl);
      const wood = (x, y, ww, hh) => {
        fill(c, '#9b6b3e', x, y, ww, hh);
        c.strokeStyle = '#6e4623';
        c.lineWidth = h * 0.006;
        c.strokeRect(x + ww * 0.08, y + hh * 0.08, ww * 0.84, hh * 0.84);
        fill(c, '#c9c9c9', x + ww * 0.45, y + hh * (y < h * 0.5 ? 0.78 : 0.12), ww * 0.1, h * 0.01);
      };
      for (let i = 0; i < 6; i++) wood(w * 0.02 + (i * w * 0.96) / 6, h * 0.04, (w * 0.96) / 6 - w * 0.01, h * 0.24);
      fill(c, '#2b2b2e', 0, h * 0.6, w, h * 0.04);
      for (let i = 0; i < 8; i++) wood(w * 0.01 + (i * w * 0.98) / 8, h * 0.66, (w * 0.98) / 8 - w * 0.01, h * 0.3);
      fill(c, '#3b3b3f', 0, h * 0.96, w, h * 0.04);
    },
  },
  {
    id: 'stone', name: 'Castle stone', use: 'set',
    draw(c, w, h) {
      fill(c, '#2c2a28');
      const r = rng(31);
      const rows = 9, rh = h / rows;
      for (let row = 0; row < rows; row++) {
        let x = -r() * w * 0.08;
        while (x < w) {
          const bw = w * (0.07 + r() * 0.08), g = h * 0.008;
          const v = 90 + r() * 50;
          c.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
          c.fillRect(x + g, row * rh + g, bw - 2 * g, rh - 2 * g);
          fill(c, lin(c, 0, row * rh, 0, (row + 1) * rh, [[0, 'rgba(255,255,255,0.1)'], [1, 'rgba(0,0,0,0.25)']]), x + g, row * rh + g, bw - 2 * g, rh - 2 * g);
          x += bw;
        }
      }
      noiseLayer(c, w, h, 14, 0.5, 8);
      [0.2, 0.8].forEach((fx) => {
        fill(c, rad(c, w * fx, h * 0.35, h * 0.35, [[0, 'rgba(255,160,60,0.55)'], [1, 'rgba(255,160,60,0)']]));
        fill(c, '#3b2616', w * fx - h * 0.01, h * 0.36, h * 0.02, h * 0.12);
        c.fillStyle = '#ffcf6a';
        c.beginPath();
        c.ellipse(w * fx, h * 0.33, h * 0.018, h * 0.04, 0, 0, Math.PI * 2);
        c.fill();
      });
    },
  },
  {
    id: 'village', name: 'Village home (Warli)', use: 'set',
    draw(c, w, h) {
      fill(c, '#b8743e');
      noiseLayer(c, w, h, 6, 0.45, 5, [120, 60, 20]);
      noiseLayer(c, w, h, 20, 0.25, 6, [240, 200, 150]);
      fill(c, '#7c3c1c', 0, h * 0.82, w, h * 0.18);
      const wx = w * 0.42, wy = h * 0.2, ww = w * 0.16, wh = h * 0.3;
      fill(c, '#1d120a', wx, wy, ww, wh);
      for (let i = 1; i < 5; i++) fill(c, '#5a3a1e', wx + (i * ww) / 5 - h * 0.006, wy, h * 0.012, wh);
      frame(c, wx, wy, ww, wh, h * 0.02, '#6b4523');
      fill(c, '#6b4523', wx - ww * 0.55, wy - h * 0.01, ww * 0.5, wh + h * 0.02);
      fill(c, '#6b4523', wx + ww * 1.05, wy - h * 0.01, ww * 0.5, wh + h * 0.02);
      const col = 'rgba(250,244,230,0.92)';
      for (let i = 0; i < 12; i++) warli(c, w * 0.06 + (i * w * 0.2) / 12, h * 0.68, h * 0.09, col);
      for (let i = 0; i < 12; i++) warli(c, w * 0.72 + (i * w * 0.2) / 12, h * 0.68, h * 0.09, col);
      c.strokeStyle = col;
      c.lineWidth = h * 0.006;
      for (let x = 0; x < w; x += h * 0.05) {
        c.beginPath();
        c.moveTo(x, h * 0.8);
        c.lineTo(x + h * 0.025, h * 0.77);
        c.lineTo(x + h * 0.05, h * 0.8);
        c.stroke();
      }
    },
  },
  {
    id: 'office', name: 'Office', use: 'set',
    draw(c, w, h) {
      fill(c, '#dfe3e6');
      fill(c, '#bfc6cc', 0, h * 0.9, w, h * 0.1);
      const wx = w * 0.12, wy = h * 0.16, ww = w * 0.3, wh = h * 0.5;
      fill(c, lin(c, 0, wy, 0, wy + wh, [[0, '#9ccbee'], [1, '#e3f1fb']]), wx, wy, ww, wh);
      for (let y = wy; y < wy + wh; y += h * 0.02) fill(c, 'rgba(245,245,240,0.85)', wx, y, ww, h * 0.012);
      frame(c, wx, wy, ww, wh, h * 0.012, '#9aa3aa');
      const bx = w * 0.55, by = h * 0.2, bw = w * 0.3, bh = h * 0.34;
      fill(c, '#fbfbfb', bx, by, bw, bh);
      frame(c, bx, by, bw, bh, h * 0.01, '#b9bec3');
      c.strokeStyle = '#2a64c4';
      c.lineWidth = h * 0.006;
      c.beginPath();
      c.moveTo(bx + bw * 0.1, by + bh * 0.8);
      c.lineTo(bx + bw * 0.3, by + bh * 0.55);
      c.lineTo(bx + bw * 0.5, by + bh * 0.65);
      c.lineTo(bx + bw * 0.8, by + bh * 0.25);
      c.stroke();
      fill(c, '#f4efe0', w * 0.88, h * 0.26, w * 0.07, h * 0.12);
      frame(c, w * 0.88, h * 0.26, w * 0.07, h * 0.12, h * 0.008, '#8a6a3a');
    },
  },
  { id: 'white', name: 'Plain white', use: 'both', draw(c) { fill(c, '#f2f2ef'); } },
  { id: 'black', name: 'Black', use: 'both', draw(c) { fill(c, '#050505'); } },
];

const byId = new Map(GENERATORS.map((g) => [g.id, g]));
const cache = new Map(); // id -> {canvas, ready:Promise}
const thumbs = new Map();
const uploads = new Map(); // id -> {name, dataURL}

export function listImages(use) {
  const built = GENERATORS.filter((g) => !use || g.use === 'both' || g.use === use).map((g) => ({ id: g.id, name: g.name }));
  const up = [...uploads.entries()].map(([id, u]) => ({ id, name: u.name, upload: true }));
  return [...up, ...built];
}

export function imageName(id) {
  return byId.get(id)?.name ?? uploads.get(id)?.name ?? 'Picture';
}

export function hasImage(id) {
  return byId.has(id) || uploads.has(id);
}

// Returns {canvas, ready}. Built-in images are ready at once; uploads resolve after decoding.
export function getImage(id) {
  if (cache.has(id)) return cache.get(id);
  let rec;
  if (byId.has(id)) {
    const canvas = makeCanvas(FULL_W, FULL_H);
    byId.get(id).draw(canvas.getContext('2d'), FULL_W, FULL_H);
    rec = { canvas, ready: Promise.resolve(canvas) };
  } else if (uploads.has(id)) {
    const canvas = makeCanvas(16, 9);
    rec = { canvas, ready: null };
    rec.ready = new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        res(canvas);
      };
      img.onerror = () => res(canvas);
      img.src = uploads.get(id).dataURL;
    });
  } else {
    return getImage('black');
  }
  cache.set(id, rec);
  return rec;
}

// Texture fitted to a target aspect ratio (cover fit), for walls and screens.
export function coverTexture(id, aspect, onReady) {
  const rec = getImage(id);
  const tex = new THREE.CanvasTexture(rec.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData.own = true;
  rec.ready.then((cv) => {
    const ia = cv.width / cv.height;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    if (ia > aspect) {
      tex.repeat.x = aspect / ia;
      tex.offset.x = (1 - tex.repeat.x) / 2;
    } else {
      tex.repeat.y = ia / aspect;
      tex.offset.y = (1 - tex.repeat.y) / 2;
    }
    tex.needsUpdate = true;
    onReady?.(tex);
  });
  return tex;
}

export function getThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  let url;
  if (byId.has(id)) {
    const c = makeCanvas(192, 108);
    byId.get(id).draw(c.getContext('2d'), 192, 108);
    url = c.toDataURL('image/jpeg', 0.85);
  } else if (uploads.has(id)) {
    url = uploads.get(id).dataURL;
  } else url = '';
  thumbs.set(id, url);
  return url;
}

// Downscale an uploaded file and register it. Resolves to the new image id.
export function addUpload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a picture this browser can open.'));
      img.onload = () => {
        const max = 2048;
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = makeCanvas(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const id = 'up_' + Math.random().toString(36).slice(2, 9);
        uploads.set(id, { name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My picture', dataURL: c.toDataURL('image/jpeg', 0.88) });
        resolve(id);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function exportUploads() {
  return Object.fromEntries(uploads);
}

export function importUploads(obj) {
  for (const [id, u] of Object.entries(obj || {})) {
    if (!uploads.has(id) && u && typeof u.dataURL === 'string' && u.dataURL.startsWith('data:image/')) {
      uploads.set(id, { name: String(u.name || 'My picture'), dataURL: u.dataURL });
      cache.delete(id);
      thumbs.delete(id);
    }
  }
}
