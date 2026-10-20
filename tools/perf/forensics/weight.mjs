// How heavy is a page on a weak phone, once it has settled? For each page: what it holds (GPU memory as
// the page asks for it: every WebGL texture, buffer and drawing buffer, tallied as they are made and
// freed; 2D canvases; decoded pictures; the JS heap after a collection; DOM nodes) and what it costs
// to keep it on screen while nothing happens (the CPU time of the page's process and of the GPU
// process over a few seconds, as Chrome reports them; the main thread's own busy time), with the
// processes' private memory as Windows counts it.
//
//   node tools/perf/forensics/weight.mjs [about.html,team.html] [--device lowend] [--dist <dir>] [--secs 3] [--query "?flags=x"]
import { execSync } from 'node:child_process';
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const ALL = 'index.html,about.html,team.html,publication.html,production.html,sponsor.html,contact.html,writers.html,write.html,piece-everything-changes.html,flash-plays.html';
const pages = (positional[0] || ALL).split(',');
const device = String(flags.device || 'lowend');
const root = String(flags.dist || DIST);
const secs = Number(flags.secs || 3);
const query = flags.query ? String(flags.query) : '';

// installed before the page's own scripts: a ledger of what each canvas context holds
const LEDGER = `(() => {
  const L = window.__weight = { gl: [], c2d: [] };
  const bpp = (gl, fmt, type) => {
    const F = { 0x8058: 4, 0x8C43: 4, 0x8051: 4, 0x881A: 8, 0x8814: 16, 0x822B: 2, 0x8229: 1, 0x822F: 4, 0x8230: 8, 0x822D: 2, 0x822E: 4, 0x8D62: 2, 0x81A5: 2, 0x81A6: 3, 0x88F0: 4, 0x8CAC: 4, 0x8CAD: 8, 0x8C3A: 4, 0x8C3D: 4, 0x8F94: 4, 0x8F97: 4 };
    if (F[fmt]) return F[fmt];
    const comps = { 0x1908: 4, 0x1907: 3, 0x1903: 1, 0x1909: 1, 0x190A: 2, 0x8227: 2, 0x1902: 4, 0x84F9: 4 }[fmt] || 4;
    const size = { 0x1401: 1, 0x1400: 1, 0x1403: 2, 0x1402: 2, 0x8D61: 2, 0x140B: 2, 0x1406: 4, 0x1405: 4, 0x1404: 4, 0x84FA: 4, 0x8033: 2, 0x8034: 2, 0x8363: 2 }[type] || 1;
    return comps * size;
  };
  const hook = (proto) => {
    const orig = {};
    const wrap = (name, fn) => { orig[name] = proto[name]; proto[name] = function (...a) { try { fn.call(this, ...a); } catch (e) {} return orig[name].apply(this, a); }; };
    const st = (gl) => gl.__w || (gl.__w = (() => { const s = { tex: new Map(), buf: new Map(), rb: new Map(), unit: 0, bound: {}, canvas: gl.canvas, gl }; L.gl.push(s); return s; })());
    const boundTex = (gl, target) => { const s = st(gl); return s.bound['t' + (target === 0x8513 || (target >= 0x8515 && target <= 0x851A) ? 0x8513 : target) + ':' + s.unit]; };
    wrap('activeTexture', function (u) { st(this).unit = u; });
    wrap('bindTexture', function (target, t) { st(this).bound['t' + target + ':' + st(this).unit] = t; });
    wrap('bindBuffer', function (target, b) { st(this).bound['b' + target] = b; });
    wrap('bindRenderbuffer', function (target, r) { st(this).bound.rb = r; });
    const setTex = (gl, target, key, bytes, dims) => { const t = boundTex(gl, target); if (!t) return; const s = st(gl); const m = s.tex.get(t) || {}; m[key] = bytes; if (dims) Object.defineProperty(m, 'dims', { value: dims, enumerable: false, configurable: true }); s.tex.set(t, m); };
    wrap('texImage2D', function (target, level, fmt, ...r) {
      let w, h, type;
      if (r.length >= 6) { w = r[0]; h = r[1]; type = r[4]; } else { const src = r[2]; type = r[1]; w = src?.naturalWidth || src?.videoWidth || src?.width || 0; h = src?.naturalHeight || src?.videoHeight || src?.height || 0; }
      setTex(this, target, target + ':' + level, w * h * bpp(this, fmt, type), level === 0 ? w + 'x' + h + (target !== 0x0DE1 ? ' cube' : '') : null);
    });
    wrap('texStorage2D', function (target, levels, fmt, w, h) { let b = 0; for (let l = 0; l < levels; l++) b += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp(this, fmt); setTex(this, target, 'storage', b * (target === 0x8513 ? 6 : 1), w + 'x' + h + ' x' + levels + (target === 0x8513 ? ' cube' : '')); });
    wrap('texStorage3D', function (target, levels, fmt, w, h, d) { let b = 0; for (let l = 0; l < levels; l++) b += Math.max(1, w >> l) * Math.max(1, h >> l) * d * bpp(this, fmt); setTex(this, target, 'storage', b); });
    wrap('texImage3D', function (target, level, fmt, w, h, d, border, f2, type) { setTex(this, target, 'l' + level, w * h * d * bpp(this, fmt, type)); });
    wrap('compressedTexImage2D', function (target, level, fmt, w, h, border, data) { setTex(this, target, target + ':' + level, data?.byteLength || 0); });
    wrap('deleteTexture', function (t) { st(this).tex.delete(t); });
    wrap('bufferData', function (target, data) { const b = st(this).bound['b' + target]; if (b) st(this).buf.set(b, typeof data === 'number' ? data : (data?.byteLength || 0)); });
    wrap('deleteBuffer', function (b) { st(this).buf.delete(b); });
    wrap('renderbufferStorage', function (target, fmt, w, h) { const r = st(this).bound.rb; if (r) st(this).rb.set(r, w * h * bpp(this, fmt)); });
    if (proto.renderbufferStorageMultisample) wrap('renderbufferStorageMultisample', function (target, samples, fmt, w, h) { const r = st(this).bound.rb; if (r) st(this).rb.set(r, w * h * bpp(this, fmt) * Math.max(1, samples)); });
    wrap('deleteRenderbuffer', function (r) { st(this).rb.delete(r); });
  };
  if (window.WebGL2RenderingContext) hook(WebGL2RenderingContext.prototype);
  if (window.WebGLRenderingContext) hook(WebGLRenderingContext.prototype);
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const c = gc.call(this, type, attrs);
    if (c && type === '2d' && !this.__w2) { this.__w2 = true; L.c2d.push(this); }
    if (c && /webgl/.test(type) && !c.__wa) { c.__wa = { antialias: c.getContextAttributes?.().antialias, type }; }
    return c;
  };
})()`;

const REPORT = `(() => {
  const L = window.__weight; const MB = (b) => Math.round(b / 104857.6) / 10;
  const gl = L.gl.filter((s) => s.canvas && s.canvas.isConnected !== false).map((s) => {
    let tex = 0; for (const m of s.tex.values()) for (const v of Object.values(m)) tex += v;
    let buf = 0; for (const v of s.buf.values()) buf += v;
    let rb = 0; for (const v of s.rb.values()) rb += v;
    const ctx = s.gl;
    const aa = !!ctx.getContextAttributes?.()?.antialias;
    const draw = s.canvas.width * s.canvas.height * (4 + 4) * (aa ? 1 + 4 : 1); // colour and depth-stencil, and a 4x multisampled copy when antialiased
    const lost = ctx?.isContextLost?.();
    const big = [...s.tex.values()].map((m) => [Object.values(m).reduce((a, v) => a + v, 0), m.dims || '?']).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([b, d]) => d + ' ' + MB(b) + ' MB').join(', ');
    return { big, canvas: (s.canvas.className || s.canvas.parentElement?.className || 'canvas').toString().split(' ')[0], size: s.canvas.width + 'x' + s.canvas.height, aa, lost, texMB: MB(tex), bufMB: MB(buf), rbMB: MB(rb), drawMB: MB(draw), totalMB: MB(lost ? 0 : tex + buf + rb + draw) };
  });
  const c2d = L.c2d.map((c) => ({ canvas: (c.className || (c.isConnected ? c.parentElement?.className : 'offscreen') || 'canvas').toString().split(' ')[0], size: c.width + 'x' + c.height, MB: MB(c.width * c.height * 4) }));
  let img = 0; for (const i of document.images) if (i.complete && i.naturalWidth) img += i.naturalWidth * i.naturalHeight * 4;
  return { gl, c2d, glMB: Math.round(gl.reduce((a, g) => a + g.totalMB, 0) * 10) / 10, c2dMB: Math.round(c2d.reduce((a, c) => a + c.MB, 0) * 10) / 10, imgMB: MB(img) };
})()`;

const procMem = (pids) => {
  if (!pids.length) return {};
  try {
    const out = execSync(`powershell -NoProfile -Command "Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { '{0} {1}' -f $_.Id, $_.PrivateMemorySize64 }"`, { encoding: 'utf8' });
    return Object.fromEntries(out.trim().split(/\r?\n/).filter(Boolean).map((l) => { const [id, b] = l.trim().split(/\s+/); return [Number(id), Math.round(Number(b) / 1048576)]; }));
  } catch { return {}; }
};

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
const rows = [];
try {
  for (const file of pages) {
    const page = await browser.newPage();
    try {
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LEDGER });
      await page.emulate({ device, network: 'none' });
      await page.goto(srv.url + file + query, { timeout: 60000 });
      await page.waitForMark(file.startsWith('index') ? 'intro-done' : 'parted', { timeout: 120000 });
      await sleep(file.startsWith('index') ? 5000 : 4000);
      await page.send('HeapProfiler.collectGarbage').catch(() => {});
      const m0 = await page.metrics();
      const p0 = (await browser.send('SystemInfo.getProcessInfo')).processInfo;
      await sleep(secs * 1000);
      const p1 = (await browser.send('SystemInfo.getProcessInfo')).processInfo;
      const m1 = await page.metrics();
      const w = await page.evaluate(REPORT);
      const cpu = (type) => { let a = 0; for (const p of p1.filter((x) => x.type === type)) { const b = p0.find((x) => x.id === p.id); a += p.cpuTime - (b ? b.cpuTime : 0); } return Math.round(a / secs * 100); };
      const renderers = p1.filter((x) => x.type === 'renderer').sort((a, b) => b.cpuTime - a.cpuTime);
      const gpu = p1.find((x) => x.type === 'GPU');
      const mem = procMem([renderers[0]?.id, gpu?.id].filter(Boolean));
      const row = { page: file.replace('.html', ''), heapMB: m1.heapMB, nodes: m1.nodes, glMB: w.glMB, c2dMB: w.c2dMB, imgMB: w.imgMB, mainBusy: Math.round((m1.taskMs - m0.taskMs) / (secs * 10)), rendererCpu: cpu('renderer'), gpuCpu: cpu('GPU'), rendererPrivMB: mem[renderers[0]?.id], gpuPrivMB: mem[gpu?.id], gl: w.gl, c2d: w.c2d };
      rows.push(row);
      console.log(`${row.page.padEnd(30)} heap ${String(row.heapMB).padStart(5)} MB | GPU (WebGL) ${String(row.glMB).padStart(6)} MB, 2D ${String(row.c2dMB).padStart(5)} MB, pictures ${String(row.imgMB).padStart(5)} MB | still: main ${String(row.mainBusy).padStart(3)}%, renderer CPU ${String(row.rendererCpu).padStart(3)}%, GPU process CPU ${String(row.gpuCpu).padStart(3)}% | private: renderer ${row.rendererPrivMB} MB, GPU ${row.gpuPrivMB} MB`);
      if (flags.detail) { for (const g of w.gl) { console.log(`     webgl ${g.canvas} ${g.size}${g.aa ? ' aa' : ''}${g.lost ? ' (lost)' : ''}: textures ${g.texMB}, buffers ${g.bufMB}, renderbuffers ${g.rbMB}, drawing buffer ${g.drawMB} MB`); if (g.big) console.log(`       largest textures: ${g.big}`); } for (const c of w.c2d) console.log(`     2d ${c.canvas} ${c.size}: ${c.MB} MB`); }
    } catch (err) {
      console.log(`${file}: FAILED ${err.message}`);
    } finally {
      await page.close();
    }
  }
  if (flags.json) (await import('node:fs')).writeFileSync(String(flags.json), JSON.stringify({ device, query, rows }, null, 1));
} finally {
  await browser.close();
  await srv.close();
}
