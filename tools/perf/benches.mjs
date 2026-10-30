// The benchmarks, each a user journey of the Drama Collective site, and what it measures.
//
// Every bench returns one flat sample object per run: numbers are aggregated (median and spread)
// by run.mjs; anything else (lists, the network ledger) is kept on the sample for reading.
//
// Deterministic counters (the gates): requests, bytes, recalcStyleCount, layoutCount, mutations,
// calls (V8 precise coverage, with --calls). Wall clock (the truth, but noisy): the marks, the
// frame lengths, long tasks.
import { sleep } from './lib/chrome.mjs';

/** The pages, by key, and how each one says it is ready. */
export const PAGES = {
  home: { file: 'index.html', ready: 'curtain-up', kind: 'home' },
  about: { file: 'about.html', ready: 'parted' },
  team: { file: 'team.html', ready: 'parted' },
  publication: { file: 'publication.html', ready: 'parted', kind: 'publication' },
  production: { file: 'production.html', ready: 'parted' },
  sponsor: { file: 'sponsor.html', ready: 'parted' },
  apply: { file: 'apply.html', ready: 'parted' },
  contact: { file: 'contact.html', ready: 'parted' },
  writers: { file: 'writers.html', ready: 'parted' },
  writer: { file: 'writer-aadi-ramnani.html', ready: 'parted' },
  write: { file: 'write.html', ready: 'parted' },
  pieces: { file: 'pieces.html', ready: 'parted', kind: 'reading' },
  piece: { file: 'piece-everything-changes.html', ready: 'parted', kind: 'reading' },
  'editors-note': { file: 'editors-note.html', ready: 'parted', kind: 'reading' },
  'flash-plays': { file: 'flash-plays.html', ready: 'parted' },
  workshops: { file: 'workshops.html', ready: 'parted', kind: 'soon' },
  newsletter: { file: 'newsletter.html', ready: 'parted', kind: 'soon' },
  planner: { file: 'stage-planner.html', ready: null, kind: 'planner' },
};
const ALL = Object.keys(PAGES);
const SCROLLABLE = ['home', 'about', 'team', 'publication', 'production', 'sponsor', 'writers', 'writer', 'write', 'pieces', 'piece', 'apply'];

/** Load a page and wait until it says it is ready (its own mark), or the load event for the planner. */
async function load(page, url, pageDef, { timeout = 90000 } = {}) {
  const loadMs = await page.goto(url, { timeout });
  const ready = pageDef.ready ? await page.waitForMark(pageDef.ready, { timeout }) : loadMs;
  if (pageDef.ready && !ready) throw new Error(`no '${pageDef.ready}' mark within ${timeout} ms`);
  return { loadMs, ready };
}

function longTaskStats(probe) {
  const lt = probe.longTasks;
  return { longTasks: lt.length, longTaskMs: probe.longTaskMs, blockingMs: probe.blockingMs, longestTaskMs: lt.reduce((a, b) => Math.max(a, b[1]), 0) };
}

/** Waits until the page has had no long task for quietMs (at most maxMs); returns how long it waited. */
async function waitQuiet(page, { quietMs = 1500, maxMs = 12000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const quiet = await page.evaluate(`(() => { const P = window.__dcPerf; const last = P.longTasks.length ? P.longTasks[P.longTasks.length - 1] : null; return last ? performance.now() - (last[0] + last[1]) : performance.now(); })()`);
    if (quiet >= quietMs || Date.now() - t0 >= maxMs) return Date.now() - t0;
    await sleep(Math.max(100, quietMs - quiet));
  }
}

function frameStats(frames) {
  if (!frames.length) return { frames: 0 };
  const s = [...frames].sort((a, b) => a - b);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { frames: frames.length, frameAvgMs: Math.round((frames.reduce((a, b) => a + b, 0) / frames.length) * 10) / 10, frameP95Ms: p(0.95), frameMaxMs: s[s.length - 1], framesOver20: frames.filter((f) => f > 20).length, framesOver33: frames.filter((f) => f > 33.4).length, framesOver100: frames.filter((f) => f > 100).length };
}

function netStats(net) {
  const r = { requests: net.count, bytesKB: Math.round(net.bytes / 1024) };
  for (const [t, v] of Object.entries(net.byType)) { r[`req_${t}`] = v.count; r[`kb_${t}`] = Math.round(v.bytes / 1024); }
  return r;
}

const diff = (a, b, keys) => Object.fromEntries(keys.map((k) => [k, b[k] - a[k]]));
const COUNTERS = ['recalcStyleCount', 'layoutCount', 'recalcStyleMs', 'layoutMs', 'scriptMs', 'taskMs'];

async function gc(page) { try { await page.send('HeapProfiler.enable'); await page.send('HeapProfiler.collectGarbage'); } catch { /* fine */ } }

/** On the publication, its reading pages and a writer's page the top bar waits out of sight until
 *  the pointer reaches the top of the screen (src/publication/peekbar.js): bring it down first. */
async function revealTopBar(page, device) {
  const { width, touch } = (await import('./lib/chrome.mjs')).DEVICES[device];
  const peek = await page.evaluate(`!!document.querySelector('.page--publication, .page--reading, .page--writer')`);
  if (!peek) return;
  if (touch) { await page.scrollGesture({ x: width / 2, y: 400, distance: 300, touch: true }); await sleep(300); await page.scrollGesture({ x: width / 2, y: 400, distance: -300, touch: true }); }
  else { await page.mouseMove(Math.round(width / 2), 1); }
  await sleep(600);
}

/** A pointer sweep: a slow figure of eight over the viewport, 3 s at about 120 Hz. */
async function sweep(page, device, seconds = 3) {
  const { width, height } = typeof device === 'string' ? (await import('./lib/chrome.mjs')).DEVICES[device] : device;
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    await page.mouseMove(Math.round(width / 2 + Math.sin(t) * width * 0.4), Math.round(height / 2 + Math.sin(2 * t) * height * 0.4));
    await sleep(8);
  }
}

async function scrollThrough(page, device, { screens = null, stepMs = 250 } = {}) {
  const { width, height, touch } = (await import('./lib/chrome.mjs')).DEVICES[device];
  const total = await page.evaluate('document.documentElement.scrollHeight - innerHeight');
  const step = Math.round(height * 0.5);
  const n = screens ? Math.round(screens * 2) : Math.ceil(total / step);
  const y0 = await page.evaluate('scrollY');
  for (let i = 0; i < n; i++) {
    // a finger really dragging the page (a synthesised touch scroll gesture does not scroll in headless Chrome)
    if (touch) await page.touchDrag({ x: Math.round(width / 2), y: Math.round(height * 0.75), distance: step });
    else await page.wheel(width / 2, height / 2, step);
    await sleep(stepMs);
  }
  const y1 = await page.evaluate('scrollY');
  return { steps: n, px: Math.max(1, y1 - y0) };
}

export const BENCHES = {
  /** The first visit to the home page: from navigation to the curtain lifting, the intro and the morph. */
  'home-load': {
    pages: ['home'],
    async run({ page, url, pageDef }) {
      const m0 = await page.metrics();
      const { loadMs, ready } = await load(page, url, pageDef);
      const m1 = await page.metrics();
      const intro = await page.waitForMark('intro-done', { timeout: 30000 });
      const morph = await page.waitForMark('morph-ready', { timeout: 30000 });
      await sleep(300);
      const [marks, timing, probe] = await Promise.all([page.marks(), page.timing(), page.probe()]);
      const net = page.network();
      return {
        loadEventMs: loadMs, curtainUpMs: ready, introDoneMs: intro ?? -1, morphReadyMs: morph ?? -1,
        bootMs: marks.boot, stageCodeMs: marks['stage-code'] ?? -1, statueLoadedMs: marks['statue-loaded'] ?? -1, fontsShadersMs: marks['fonts-and-loader-cycle'] ?? marks['fonts-and-shaders'] ?? -1, statueLitMs: marks['statue-lit'] ?? -1, stillShownMs: marks['still-shown'] ?? -1,
        fcpMs: timing?.fcp ?? -1, lcpMs: timing?.lcp ?? -1, cls: timing?.cls ?? 0,
        ...diff(m0, m1, COUNTERS), ...longTaskStats(probe), mutations: probe.mutations, contexts: probe.contexts.length,
        ...netStats(net), network: net.list, longTaskList: probe.longTasks, marks,
      };
    },
    summarize: (a) => `curtain ${a.curtainUpMs} ms (±${a['curtainUpMs~']}) | boot ${a.bootMs} stage ${a.stageCodeMs} statue ${a.statueLoadedMs} shaders ${a.fontsShadersMs} | intro ${a.introDoneMs} morph ${a.morphReadyMs} | long tasks ${a.longTasks} (${a.longTaskMs} ms, longest ${a.longestTaskMs}) | ${a.requests} req ${a.bytesKB} KB | recalcs ${a.recalcStyleCount} layouts ${a.layoutCount}`,
  },

  /** Every page: from navigation to its curtain parting (what the visitor waits for after a click). */
  'page-boot': {
    pages: ALL,
    async run({ page, url, pageDef }) {
      const m0 = await page.metrics();
      const { loadMs, ready } = await load(page, url, pageDef);
      const m1 = await page.metrics();
      await sleep(300);
      const [marks, timing, probe] = await Promise.all([page.marks(), page.timing(), page.probe()]);
      const net = page.network();
      return {
        loadEventMs: loadMs, readyMs: ready, bootMs: marks.boot ?? -1, fontsMs: marks.fonts ?? -1, setupMs: marks.setup ?? -1,
        fcpMs: timing?.fcp ?? -1, lcpMs: timing?.lcp ?? -1, cls: timing?.cls ?? 0, domNodes: m1.nodes,
        ...diff(m0, m1, COUNTERS), ...longTaskStats(probe), mutations: probe.mutations, contexts: probe.contexts.length,
        ...netStats(net), network: net.list, contextList: probe.contexts, marks,
      };
    },
    summarize: (a) => `ready ${a.readyMs} ms (±${a['readyMs~']}) | boot ${a.bootMs} fonts ${a.fontsMs} setup ${a.setupMs} | fcp ${a.fcpMs} | long ${a.longTasks}/${a.longTaskMs} ms | ${a.requests} req ${a.bytesKB} KB | recalcs ${a.recalcStyleCount} layouts ${a.layoutCount} nodes ${a.domNodes} ctx ${a.contexts}`,
  },

  /** What a page burns while the visitor just looks at it: 4 s still, pointer parked off the page. */
  idle: {
    pages: ALL.filter((k) => k !== 'planner'),
    async run({ page, url, pageDef }) {
      await load(page, url, pageDef);
      if (pageDef.kind === 'home') await page.waitForMark('intro-done', { timeout: 30000 });
      await sleep(800);
      // the page has settled: no long task for 1 s (a statue, a ring or a field still loading after
      // the curtain parted is the boot's tail, not the cost of a page standing still); at most 6 s
      const settledAfterMs = await waitQuiet(page, { quietMs: 1000, maxMs: 6000 });
      // no in-page frame counter here: a requestAnimationFrame loop keeps a still page's thread producing
      // frames, and in each of them Chrome refreshes the style of every running animation, composited
      // or not, so the counter added work to what it measured. Jank is read from the browser's own
      // long-animation-frame entries instead, observed passively.
      const p0 = await page.probe();
      const m0 = await page.metrics();
      await sleep(4000);
      const m1 = await page.metrics();
      const p1 = await page.probe();
      const d = diff(m0, m1, COUNTERS);
      return {
        ...d, busyPct: Math.round((d.taskMs / 4000) * 100), scriptMsPerSec: Math.round(d.scriptMs / 4), recalcsPerSec: Math.round(d.recalcStyleCount / 4), layoutsPerSec: Math.round(d.layoutCount / 4),
        mutationsPerSec: Math.round((p1.mutations - p0.mutations) / 4), longTasks: p1.longTasks.length - p0.longTasks.length,
        longFrames: p1.longFrames.length - p0.longFrames.length, settledAfterMs,
      };
    },
    summarize: (a) => `busy ${a.busyPct}% script ${a.scriptMsPerSec} ms/s | recalcs ${a.recalcsPerSec}/s layouts ${a.layoutsPerSec}/s mutations ${a.mutationsPerSec}/s | long frames ${a.longFrames}`,
  },

  /** Scrolling the page end to end, half a screen every 250 ms (wheel, or touch flicks on the phone). */
  scroll: {
    pages: SCROLLABLE,
    async run({ page, url, pageDef, device }) {
      await load(page, url, pageDef);
      if (pageDef.kind === 'home' && !(await page.evaluate("document.documentElement.classList.contains('tier-phone')"))) await page.waitForMark('morph-ready', { timeout: 30000 });
      await sleep(600);
      const p0 = await page.probe();
      const m0 = await page.metrics();
      await page.frameStart();
      const t0 = Date.now();
      const s = await scrollThrough(page, device);
      await sleep(1500); // the scrubbed sequences settle (scrub 1.2 s)
      const wall = Date.now() - t0;
      const frames = await page.frameStop();
      const m1 = await page.metrics();
      const p1 = await page.probe();
      const d = diff(m0, m1, COUNTERS);
      const screens = s.px / (await page.evaluate('innerHeight'));
      return {
        ...frameStats(frames), ...d, scrollSteps: s.steps, screens: Math.round(screens * 10) / 10, wallMs: wall, busyPct: Math.round((d.taskMs / wall) * 100),
        recalcsPerScreen: Math.round(d.recalcStyleCount / screens), layoutsPerScreen: Math.round(d.layoutCount / screens), mutationsPerScreen: Math.round((p1.mutations - p0.mutations) / screens),
        longTasks: p1.longTasks.length - p0.longTasks.length, longTaskMs: p1.longTaskMs - p0.longTaskMs, scrollY: await page.evaluate('scrollY'),
      };
    },
    summarize: (a) => `${a.screens} screens | frames ${a.frames} avg ${a.frameAvgMs} p95 ${a.frameP95Ms} max ${a.frameMaxMs} ms (>33 ms: ${a.framesOver33}) | busy ${a.busyPct}% | per screen: recalcs ${a.recalcsPerScreen} layouts ${a.layoutsPerScreen} mutations ${a.mutationsPerScreen} | long ${a.longTasks}/${a.longTaskMs} ms`,
  },

  /** The pointer sweeping over the page for 3 s: the cursor star, the sky's glow, the tilt, the lamps, the statues' lean. */
  pointer: {
    pages: ALL.filter((k) => k !== 'planner'),
    skip: (pageDef, device) => device === 'phone',
    async run({ page, url, pageDef, device }) {
      await load(page, url, pageDef);
      if (pageDef.kind === 'home') await page.waitForMark('intro-done', { timeout: 30000 });
      await sleep(600);
      const p0 = await page.probe();
      const m0 = await page.metrics();
      await page.frameStart();
      const t0 = Date.now();
      await sweep(page, device, 3);
      const secs = (Date.now() - t0) / 1000; // the sweep's own pace (each move is a round trip)
      const frames = await page.frameStop();
      const m1 = await page.metrics();
      const p1 = await page.probe();
      const d = diff(m0, m1, COUNTERS);
      return { ...frameStats(frames), ...d, sweepMs: Math.round(secs * 1000), busyPct: Math.round((d.taskMs / (secs * 1000)) * 100), recalcsPerSec: Math.round(d.recalcStyleCount / secs), layoutsPerSec: Math.round(d.layoutCount / secs), mutationsPerSec: Math.round((p1.mutations - p0.mutations) / secs), longTasks: p1.longTasks.length - p0.longTasks.length };
    },
    summarize: (a) => `frames ${a.frames} avg ${a.frameAvgMs} p95 ${a.frameP95Ms} (>33 ms: ${a.framesOver33}) | busy ${a.busyPct}% | recalcs ${a.recalcsPerSec}/s layouts ${a.layoutsPerSec}/s mutations ${a.mutationsPerSec}/s`,
  },

  /** The theme switch: the circle reveal, every canvas changing its light, and the earring dropping. */
  theme: {
    pages: ALL.filter((k) => k !== 'planner'),
    async run({ page, url, pageDef }) {
      await load(page, url, pageDef);
      if (pageDef.kind === 'home') await page.waitForMark('intro-done', { timeout: 30000 });
      await sleep(1500); // the earrings' idle prefetch, if it is going to happen, has happened
      await revealTopBar(page, device);
      const before = await page.evaluate("document.documentElement.dataset.theme || 'dark'");
      const n0 = page.network().count;
      const p0 = await page.probe();
      const m0 = await page.metrics();
      await page.frameStart();
      const t0 = Date.now();
      await page.clickSelector('[data-theme-toggle]');
      const flipped = await page.waitFor(`(document.documentElement.dataset.theme || 'dark') !== '${before}'`, { timeout: 5000 });
      const flipMs = Date.now() - t0;
      await sleep(2500); // the reveal (~0.9 s) and the earring's visit (~1.5 s)
      const frames = await page.frameStop();
      const m1 = await page.metrics();
      const p1 = await page.probe();
      const net = page.network();
      const d = diff(m0, m1, COUNTERS);
      const later = net.list.slice(n0);
      return { flipMs: flipped ? flipMs : -1, ...frameStats(frames), ...d, longTasks: p1.longTasks.length - p0.longTasks.length, longTaskMs: p1.longTaskMs - p0.longTaskMs, mutations: p1.mutations - p0.mutations, requestsAfter: later.length, kbAfter: Math.round(later.reduce((a, r) => a + (r.bytes || 0), 0) / 1024), contexts: p1.contexts.length, requestsAfterList: later.map((r) => r.url) };
    },
    summarize: (a) => `flip ${a.flipMs} ms | frames avg ${a.frameAvgMs} p95 ${a.frameP95Ms} max ${a.frameMaxMs} (>33: ${a.framesOver33}) | long ${a.longTasks}/${a.longTaskMs} ms | +${a.requestsAfter} req ${a.kbAfter} KB | recalcs ${a.recalcStyleCount} layouts ${a.layoutCount}`,
  },

  /** Following a link through the curtain: from the click to the next page's curtain parting. */
  nav: {
    pages: ALL.filter((k) => k !== 'planner'),
    async run({ page, url, pageDef, device }) {
      await load(page, url, pageDef);
      if (pageDef.kind === 'home') await page.waitForMark('intro-done', { timeout: 30000 });
      await sleep(500);
      await revealTopBar(page, device);
      // the top bar's About us (or Contact us from About) link, through the site's own curtain
      const target = pageDef.file === 'about.html' ? 'a[href="./contact.html"]' : 'a[href="./about.html"]';
      const navigated = page.waitForNavigation({ timeout: 30000 });
      const t0 = Date.now();
      await page.clickSelector(target);
      const to = await navigated;
      const navMs = Date.now() - t0;
      const parted = await page.waitForMark('parted', { timeout: 60000 });
      const totalMs = Date.now() - t0;
      const net = page.network();
      const timing = await page.timing();
      return { clickToNavMs: navMs, clickToPartedMs: totalMs, nextReadyMs: parted ?? -1, nextFcpMs: timing?.fcp ?? -1, nextTtfbMs: timing?.ttfb ?? -1, ...netStats(net), cachedRequests: net.list.filter((r) => r.cached).length, to };
    },
    summarize: (a) => `click→nav ${a.clickToNavMs} ms, click→parted ${a.clickToPartedMs} ms (±${a['clickToPartedMs~']}) | next page ready ${a.nextReadyMs} fcp ${a.nextFcpMs} | ${a.requests} req ${a.bytesKB} KB (${a.cachedRequests} cached)`,
  },

  /** How much a single DOM change costs in style recalculation: the selectors' bill. */
  recalc: {
    pages: ['home', 'publication', 'piece', 'writers', 'team'],
    async run({ page, url, pageDef }) {
      await load(page, url, pageDef);
      if (pageDef.kind === 'home') await page.waitForMark('intro-done', { timeout: 30000 });
      await sleep(500);
      const probeRecalc = async (expr, n) => {
        const m0 = await page.metrics();
        await page.evaluate(`(async () => { for (let i = 0; i < ${n}; i++) { ${expr}; getComputedStyle(document.body).opacity; } })()`);
        const m1 = await page.metrics();
        return { ms: Math.round(((m1.recalcStyleMs - m0.recalcStyleMs) / n) * 100) / 100, count: m1.recalcStyleCount - m0.recalcStyleCount };
      };
      const leaf = await probeRecalc("const el = document.querySelector('main p, main h2, main li') || document.body; el.classList.toggle('dc-probe')", 200);
      const html = await probeRecalc("document.documentElement.classList.toggle('dc-probe')", 200);
      const body = await probeRecalc("document.body.classList.toggle('dc-probe')", 200);
      const hover = await probeRecalc("const t = document.querySelector('.topbar__links a') || document.body; t.classList.toggle('dc-probe'); t.style.setProperty('--dc', Math.random())", 200);
      const m = await page.metrics();
      return { leafToggleMs: leaf.ms, htmlToggleMs: html.ms, bodyToggleMs: body.ms, linkToggleMs: hover.ms, recalcsPerToggle: Math.round((leaf.count / 200) * 100) / 100, domNodes: m.nodes, layoutObjects: m.layoutObjects };
    },
    summarize: (a) => `recalc per change: leaf ${a.leafToggleMs} ms, html ${a.htmlToggleMs} ms, body ${a.bodyToggleMs} ms, link ${a.linkToggleMs} ms | nodes ${a.domNodes} layout objects ${a.layoutObjects}`,
  },

  /** What a page holds once it is up: heap after GC, DOM, listeners, canvases, the GPU's geometry and textures. */
  memory: {
    pages: ['home', 'publication', 'writers', 'write', 'piece', 'workshops', 'about'],
    async run({ page, url, pageDef }) {
      await load(page, url, pageDef);
      if (pageDef.kind === 'home') { if (!(await page.evaluate("document.documentElement.classList.contains('tier-phone')"))) await page.waitForMark('morph-ready', { timeout: 30000 }); await page.waitForMark('intro-done', { timeout: 30000 }); }
      await sleep(1500);
      await gc(page);
      const m = await page.metrics();
      const probe = await page.probe();
      const gl = await page.evaluate(`(() => { const s = window.dramaCollective && window.dramaCollective.stage; const r = s && (s.renderer || s._renderer); const i = r && r.info; return i ? { geometries: i.memory.geometries, textures: i.memory.textures, programs: (i.programs || []).length } : null; })()`);
      const webgl = probe.contexts.filter((c) => /webgl/.test(c[0])).length;
      return { heapMB: m.heapMB, domNodes: m.nodes, listeners: m.listeners, canvases: probe.contexts.length, webglContexts: webgl, geometries: gl?.geometries ?? -1, textures: gl?.textures ?? -1, programs: gl?.programs ?? -1, contextList: probe.contexts };
    },
    summarize: (a) => `heap ${a.heapMB} MB | nodes ${a.domNodes} listeners ${a.listeners} | canvases ${a.canvases} (webgl ${a.webglContexts}) | geometries ${a.geometries} textures ${a.textures} programs ${a.programs}`,
  },
};
