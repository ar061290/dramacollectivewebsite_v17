// PNG in, PNG out, and the difference between two: enough to compare the browser's screenshots
// pixel by pixel with nothing installed. Reads 8-bit RGB/RGBA (what Chrome writes), writes RGBA.
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let pos = 8; let width = 0, height = 0, depth = 0, type = 0, interlace = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const kind = buf.toString('ascii', pos + 4, pos + 8); const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace})`);
  const channels = { 2: 3, 6: 4, 0: 1, 4: 2 }[type];
  if (!channels) throw new Error(`unsupported PNG colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride); let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]; const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0; const b = prev[i]; const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4; const s = x * channels;
      if (channels >= 3) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = channels === 4 ? line[s + 3] : 255; }
      else { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = channels === 2 ? line[s + 1] : 255; }
    }
    prev = line;
  }
  return { width, height, data: out };
}

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (kind, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const kd = Buffer.concat([Buffer.from(kind, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(kd)); return Buffer.concat([len, kd, crc]); };

export function encode({ width, height, data }) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Compare two images of the same size. A pixel counts as different when any channel differs by more
 * than `threshold` (0–255). Returns the counts and a diff image (red where different, the first
 * image dimmed elsewhere).
 */
export function diff(a, b, { threshold = 8 } = {}) {
  if (a.width !== b.width || a.height !== b.height) return { same: false, sizeMismatch: true, a: [a.width, a.height], b: [b.width, b.height] };
  const n = a.width * a.height; let different = 0, maxDelta = 0, sum = 0;
  const out = Buffer.alloc(n * 4);
  let minX = a.width, minY = a.height, maxX = -1, maxY = -1;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
    sum += d; if (d > maxDelta) maxDelta = d;
    if (d > threshold) {
      different++; out[o] = 255; out[o + 1] = 40; out[o + 2] = 40; out[o + 3] = 255;
      const x = i % a.width, y = (i / a.width) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    } else { out[o] = a.data[o] >> 2; out[o + 1] = a.data[o + 1] >> 2; out[o + 2] = a.data[o + 2] >> 2; out[o + 3] = 255; }
  }
  return { same: different === 0, different, share: different / n, maxDelta, meanDelta: sum / n, box: maxX < 0 ? null : [minX, minY, maxX, maxY], image: { width: a.width, height: a.height, data: out } };
}
