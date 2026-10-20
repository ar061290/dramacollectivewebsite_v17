// A Chrome DevTools Protocol driver with no dependencies (Node 22+: the global WebSocket).
// Launches the installed Chrome with a fresh profile, opens pages, emulates devices, networks and
// slower CPUs, and reads the browser's own counters (style recalcs, layouts, script time, heap).
// On this machine headless Chrome draws with the real GPU (ANGLE over Direct3D 11), so the site's
// live WebGL path runs in the lab exactly as it does for visitors.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findChrome() {
  for (const p of CANDIDATES) if (existsSync(p)) return p;
  throw new Error('No Chrome found. Set CHROME=<path to chrome.exe>.');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Device presets: what the site sees. The phone keeps this machine's cores and memory, so the
 *  WebGL gate (src/util/env.js) lets it through, as it does on most real phones. */
export const DEVICES = {
  laptop: { width: 1366, height: 768, dpr: 1, mobile: false, touch: false, cpu: 1 },
  'laptop-slow': { width: 1366, height: 768, dpr: 1, mobile: false, touch: false, cpu: 4 },
  phone: {
    width: 390, height: 844, dpr: 3, mobile: true, touch: true, cpu: 4,
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
  },
  // a budget Android phone (a Galaxy A12 or a Redmi 9 class: 3 GB, eight slow cores, a PowerVR or Mali
  // GPU): what the page reads of it (navigator.deviceMemory, hardwareConcurrency) is set too. The GPU
  // cannot be slowed: the lab's own (Intel UHD 620) draws, so GPU work is measured, not felt.
  lowend: {
    width: 360, height: 800, dpr: 2, mobile: true, touch: true, cpu: 6, memory: 2, cores: 4,
    ua: 'Mozilla/5.0 (Linux; Android 11; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
  },
  // a mid-range Android phone (a Galaxy A5x class: 4-6 GB, which the page reads as 4; DPR 2.75): the
  // commonest phone that gets the live 3D (devices reading 2 GB or less get the still pictures)
  midphone: {
    width: 393, height: 851, dpr: 2.75, mobile: true, touch: true, cpu: 5, memory: 4, cores: 8,
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
  },
};

/** Network presets (bytes per second, ms). 4g is WebPageTest's 4G; slow4g is Lighthouse's mobile default. */
export const NETWORKS = {
  none: null,
  '4g': { latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (9 * 1024 * 1024) / 8 },
  slow4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  '3g': { latency: 300, downloadThroughput: (780 * 1024) / 8, uploadThroughput: (330 * 1024) / 8 },
};

export async function launch({ headless = true, flags = [], windowSize = '1366,768' } = {}) {
  const exe = findChrome();
  const dir = mkdtempSync(join(tmpdir(), 'dc-perf-'));
  const args = [
    '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--disable-background-networking', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-features=TranslateUI,MediaRouter,CalculateNativeWinOcclusion',
    '--autoplay-policy=no-user-gesture-required', '--disable-component-update', '--disable-sync', '--no-pings',
    '--password-store=basic', '--hide-scrollbars', `--window-size=${windowSize}`,
    '--ignore-certificate-errors', // the lab's HTTP/2 server uses a self-signed certificate
    ...(headless ? ['--headless=new'] : []), ...flags, ...(process.env.CHROME_FLAGS ? process.env.CHROME_FLAGS.split(/\s+/).filter(Boolean) : []), 'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: 'ignore' });
  const portFile = join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 300 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) { proc.kill(); throw new Error('Chrome did not expose DevToolsActivePort'); }
  await sleep(150);
  const [port, path] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP websocket failed')); });
  return new Browser({ proc, dir, ws, exe });
}

class Browser {
  constructor({ proc, dir, ws, exe }) {
    this.proc = proc; this.dir = dir; this.ws = ws; this.exe = exe;
    this._id = 0; this._pending = new Map(); this._listeners = new Map(); this.pages = new Set();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this._pending.has(m.id)) {
        const { res, rej } = this._pending.get(m.id);
        this._pending.delete(m.id);
        if (m.error) rej(new Error(`${m.error.message} (${m.error.code})`)); else res(m.result);
        return;
      }
      if (m.method) {
        for (const fn of this._listeners.get(`${m.sessionId || ''}:${m.method}`) || []) { try { fn(m.params); } catch (e) { console.error(e); } }
        for (const fn of this._listeners.get(`*:${m.method}`) || []) { try { fn(m.params, m.sessionId); } catch (e) { console.error(e); } }
      }
    };
    ws.onclose = () => { for (const { rej } of this._pending.values()) rej(new Error('CDP connection closed')); this._pending.clear(); };
  }
  send(method, params = {}, sessionId) {
    return new Promise((res, rej) => {
      const id = ++this._id;
      this._pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(method, fn, sessionId = '*') {
    const key = `${sessionId}:${method}`;
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());
    this._listeners.get(key).add(fn);
    return () => this._listeners.get(key)?.delete(fn);
  }
  async newPage(opts = {}) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, targetId, sessionId);
    await page._init(opts);
    this.pages.add(page);
    return page;
  }
  async close() {
    try { await Promise.race([this.send('Browser.close'), sleep(3000)]); } catch { /* already gone */ }
    try { this.ws.close(); } catch { /* ignore */ }
    await sleep(300);
    try { this.proc.kill(); } catch { /* ignore */ }
    // on Windows a killed browser process can leave its GPU and renderer processes behind, still
    // running the page's animation loops: the whole tree goes
    if (process.platform === 'win32') { try { execSync(`taskkill /PID ${this.proc.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ } }
    for (let i = 0; i < 10; i++) { try { rmSync(this.dir, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  }
}

/** The in-page probe, installed before any of the page's own script runs. It counts rAF frames
 *  and their lengths, long tasks, DOM mutations and canvas contexts, and exposes them on
 *  window.__dcPerf. It costs the page a little (the MutationObserver), so a wall-clock comparison
 *  is only fair when both sides carry it. */
export const PROBE_SCRIPT = `
(() => {
  const P = window.__dcPerf = { longTasks: [], longFrames: [], frames: [], frameOn: false, mutations: 0, mutationRecords: 0, contexts: [], events: [] };
  // long animation frames (over 50 ms from the frame's start to its paint), observed passively: unlike the
  // rAF frame counter below, observing them makes the page produce no frames of its own
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longFrames.push([Math.round(e.startTime), Math.round(e.duration), Math.round(e.blockingDuration || 0)]); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.events.push([e.entryType, e.name, Math.round(e.startTime), Math.round(e.duration || 0), e.value || 0]); }).observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] }); } catch (e) {}
  let last = 0;
  const tick = (t) => { if (!P.frameOn) return; P.frames.push(Math.round((t - last) * 10) / 10); last = t; requestAnimationFrame(tick); };
  P.frameStart = () => { P.frames = []; P.frameOn = true; requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); }); };
  P.frameStop = () => { P.frameOn = false; return P.frames.slice(); };
  const mo = new MutationObserver((rs) => { P.mutationRecords += rs.length; for (const r of rs) P.mutations += 1 + r.addedNodes.length + r.removedNodes.length; });
  const watch = () => { try { mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); } catch (e) {} };
  if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const c = orig.call(this, type, ...a);
    if (c && !this.__dcSeen) { this.__dcSeen = true; P.contexts.push([type, this.className || this.id || this.tagName]); }
    return c;
  };
})();`;

class Page {
  constructor(browser, targetId, sessionId) {
    this.browser = browser; this.targetId = targetId; this.sessionId = sessionId;
    this.console = []; this.errors = []; this.requests = new Map(); this.device = 'laptop'; this.networkName = 'none'; this.cpu = 1;
  }
  send(method, params) { return this.browser.send(method, params, this.sessionId); }
  on(method, fn) { return this.browser.on(method, fn, this.sessionId); }
  async _init({ probe = true } = {}) {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable', { maxTotalBufferSize: 50 * 1024 * 1024 });
    await this.send('Performance.enable', { timeDomain: 'timeTicks' });
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    if (probe) await this.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE_SCRIPT });
    this.on('Runtime.consoleAPICalled', (p) => this.console.push({ type: p.type, text: p.args.map((a) => a.value ?? a.description ?? '').join(' '), t: p.timestamp }));
    this.on('Runtime.exceptionThrown', (p) => this.errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception'));
    this.on('Network.requestWillBeSent', (p) => { this.requests.set(p.requestId, { url: p.request.url, type: p.type, start: p.timestamp, bytes: 0, status: 0, cached: false, done: null, priority: p.request.initialPriority }); });
    this.on('Network.responseReceived', (p) => {
      const r = this.requests.get(p.requestId); if (!r) return;
      r.status = p.response.status; r.mime = p.response.mimeType;
      r.cached = !!(p.response.fromDiskCache || p.response.fromServiceWorker || p.response.fromPrefetchCache);
      const h = p.response.headers || {};
      r.encoding = h['content-encoding'] || h['Content-Encoding'] || '';
      r.ttfb = p.response.timing ? Math.round(p.response.timing.receiveHeadersEnd) : null;
    });
    this.on('Network.loadingFinished', (p) => { const r = this.requests.get(p.requestId); if (!r) return; r.bytes = p.encodedDataLength; r.done = p.timestamp; });
    this.on('Network.loadingFailed', (p) => { const r = this.requests.get(p.requestId); if (!r) return; r.failed = p.errorText; r.done = p.timestamp; });
  }
  /** Device, CPU and network emulation (DEVICES / NETWORKS presets, or your own objects). */
  async emulate({ device = 'laptop', network = 'none', cpu } = {}) {
    const d = typeof device === 'string' ? DEVICES[device] : device;
    if (!d) throw new Error(`unknown device ${device}`);
    this.device = typeof device === 'string' ? device : 'custom';
    await this.send('Emulation.setDeviceMetricsOverride', { width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: d.mobile, screenWidth: d.width, screenHeight: d.height });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: !!d.touch, maxTouchPoints: d.touch ? 5 : 1 });
    if (d.ua) {
      // with the client hints a real Android Chrome sends (navigator.userAgentData): an override without
      // them leaves the brands empty, and the site's Chromium-only paths (pictures decoded as ImageBitmaps
      // off the page's thread: src/scene/aboutRing.js, writerStatue.js) were not taken on the lab's phones
      const major = /Chrome\/(\d+)/.exec(d.ua)?.[1] ?? '0';
      const android = /Android (\d+)/.exec(d.ua)?.[1] ?? '';
      const model = /Android [^;]+; ([^)]+)\)/.exec(d.ua)?.[1] ?? '';
      const userAgentMetadata = d.mobile ? {
        brands: [{ brand: 'Chromium', version: major }, { brand: 'Google Chrome', version: major }, { brand: 'Not_A Brand', version: '24' }],
        fullVersion: `${major}.0.0.0`, platform: 'Android', platformVersion: android ? `${android}.0.0` : '', architecture: '', model, mobile: true,
      } : undefined;
      await this.send('Emulation.setUserAgentOverride', { userAgent: d.ua, platform: d.mobile ? 'Linux armv8l' : 'Win32', ...(userAgentMetadata ? { userAgentMetadata } : {}) });
    }
    const rate = cpu ?? d.cpu ?? 1;
    await this.send('Emulation.setCPUThrottlingRate', { rate });
    if (d.cores) await this.send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: d.cores });
    if (d.memory && !this.__memorySet) {
      this.__memorySet = true; // (navigator.deviceMemory has no override in the protocol: set before the page's own scripts)
      await this.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => ${Number(d.memory)} });` });
    }
    this.cpu = rate;
    const n = typeof network === 'string' ? NETWORKS[network] : network;
    this.networkName = typeof network === 'string' ? network : 'custom';
    await this.send('Network.emulateNetworkConditions', n ? { offline: false, ...n } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  async clearCache() { await this.send('Network.clearBrowserCache'); await this.send('Network.clearBrowserCookies'); }
  async setCacheDisabled(disabled) { await this.send('Network.setCacheDisabled', { cacheDisabled: disabled }); }
  /** Navigate and wait for the load event. Returns the wall time to it. */
  async goto(url, { timeout = 60000 } = {}) {
    this.requests.clear(); this.console.length = 0; this.errors.length = 0;
    const loaded = new Promise((res) => { const off = this.on('Page.loadEventFired', () => { off(); res(); }); });
    const t0 = Date.now();
    await this.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(timeout)]);
    return Date.now() - t0;
  }
  /** Resolves when the main frame next navigates (a link followed through the curtain). */
  waitForNavigation({ timeout = 30000 } = {}) {
    return new Promise((res) => {
      const off = this.on('Page.frameNavigated', (p) => { if (!p.frame.parentId) { off(); res(p.frame.url); } });
      setTimeout(() => { off(); res(null); }, timeout);
    });
  }
  async evaluate(expression, { awaitPromise = true } = {}) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  /** Poll until the expression is truthy; returns its value, or null on timeout. */
  async waitFor(expression, { timeout = 60000, interval = 50 } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v = null;
      try { v = await this.evaluate(expression); } catch { /* page navigating */ }
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }
  /** Wait for a performance mark set by the site (src/util/perf.js writes 'dc:<name>'). */
  async waitForMark(name, { timeout = 60000 } = {}) {
    const v = await this.waitFor(`(() => { const e = performance.getEntriesByName('dc:${name}', 'mark'); return e.length ? Math.round(e[e.length - 1].startTime) : 0; })()`, { timeout });
    return v || null;
  }
  async marks() {
    return this.evaluate(`Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('dc:')).map((m) => [m.name.slice(3), Math.round(m.startTime)]))`);
  }
  async timing() {
    return this.evaluate(`(() => { const n = performance.getEntriesByType('navigation')[0]; if (!n) return null;
      const p = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]));
      const ev = (window.__dcPerf && window.__dcPerf.events) || [];
      const lcp = ev.filter((e) => e[0] === 'largest-contentful-paint').pop();
      const cls = ev.filter((e) => e[0] === 'layout-shift').reduce((a, e) => a + e[4], 0);
      return { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: p['first-contentful-paint'] ?? null, lcp: lcp ? lcp[2] : null, cls: Math.round(cls * 1000) / 1000, transfer: n.transferSize }; })()`);
  }
  /** Chrome's own counters since the page was created. */
  async metrics() {
    const { metrics } = await this.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    return {
      recalcStyleCount: m.RecalcStyleCount, layoutCount: m.LayoutCount,
      recalcStyleMs: Math.round(m.RecalcStyleDuration * 1000), layoutMs: Math.round(m.LayoutDuration * 1000),
      scriptMs: Math.round(m.ScriptDuration * 1000), taskMs: Math.round(m.TaskDuration * 1000), v8CompileMs: Math.round((m.V8CompileDuration || 0) * 1000),
      heapMB: Math.round((m.JSHeapUsedSize / 1048576) * 10) / 10, nodes: m.Nodes, documents: m.Documents, listeners: m.JSEventListeners,
      frames: m.Frames, layoutObjects: m.LayoutObjects, resources: m.Resources,
    };
  }
  async probe() {
    return this.evaluate(`(() => { const P = window.__dcPerf; if (!P) return null;
      return { longTasks: P.longTasks, longFrames: P.longFrames, longTaskMs: P.longTasks.reduce((a, b) => a + b[1], 0), blockingMs: P.longTasks.reduce((a, b) => a + Math.max(0, b[1] - 50), 0),
        mutations: P.mutations, mutationRecords: P.mutationRecords, contexts: P.contexts, events: P.events }; })()`);
  }
  async frameStart() { await this.evaluate('(window.__dcPerf.frameStart(), 1)'); }
  async frameStop() { return this.evaluate('window.__dcPerf.frameStop()'); }
  /** Function call counts from V8's precise coverage: the same input gives the same counts. */
  async callsStart() { await this.send('Profiler.enable'); await this.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true, allowTriggeredUpdates: false }); }
  async callsTake() {
    const { result } = await this.send('Profiler.takePreciseCoverage');
    const byScript = {}; let total = 0; const byFunction = [];
    for (const s of result) {
      const url = (s.url || '(inline)').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
      let n = 0;
      for (const f of s.functions) { const c = f.ranges[0]?.count || 0; n += c; if (c > 1000) byFunction.push([url, f.functionName || '(anonymous)', c]); }
      byScript[url] = (byScript[url] || 0) + n; total += n;
    }
    byFunction.sort((a, b) => b[2] - a[2]);
    return { total, byScript, top: byFunction.slice(0, 40) };
  }
  async callsStop() { try { await this.send('Profiler.stopPreciseCoverage'); await this.send('Profiler.disable'); } catch { /* ignore */ } }
  /** A sampling CPU profile: who burns the time. */
  async profileStart() { await this.send('Profiler.enable'); await this.send('Profiler.setSamplingInterval', { interval: 500 }); await this.send('Profiler.start'); }
  async profileStop() {
    const { profile } = await this.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas; let total = 0;
    for (let i = 0; i < profile.samples.length; i++) {
      const n = byId.get(profile.samples[i]); const d = dt[i] || 0; total += d;
      const k = `${(n.callFrame.url || '').replace(/^https?:\/\/[^/]+/, '')}:${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber}`;
      self.set(k, (self.get(k) || 0) + d);
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, us]) => [k, Math.round(us / 1000)]);
    return { totalMs: Math.round(total / 1000), top };
  }
  /** Network since the last goto(): bytes and requests by type. */
  network() {
    const byType = {}; let bytes = 0; let count = 0; const list = [];
    // each request's start and end in ms from the first request's start (the page's own), for waterfalls
    let t0 = Infinity; for (const r of this.requests.values()) if (r.start && r.start < t0) t0 = r.start;
    for (const r of this.requests.values()) {
      if (r.failed && /abort/i.test(r.failed)) continue;
      count++; bytes += r.bytes || 0;
      const t = r.type || 'Other'; byType[t] = byType[t] || { count: 0, bytes: 0 }; byType[t].count++; byType[t].bytes += r.bytes || 0;
      list.push({ url: r.url.replace(/^https?:\/\/[^/]+/, ''), type: t, bytes: r.bytes, status: r.status, cached: r.cached, enc: r.encoding, ms: r.done && r.start ? Math.round((r.done - r.start) * 1000) : null, at: r.start ? Math.round((r.start - t0) * 1000) : null, end: r.done ? Math.round((r.done - t0) * 1000) : null, priority: r.priority, failed: r.failed });
    }
    return { count, bytes, byType, list };
  }
  /** clip: { x, y, width, height, scale } in CSS pixels (scale enlarges the crop) for a detail shot. */
  async screenshot(path, { fullPage = false, clip = null } = {}) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
    writeFileSync(path, Buffer.from(data, 'base64'));
  }
  // --- input -------------------------------------------------------------------------------------
  async mouseMove(x, y) { await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'mouse' }); }
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async clickSelector(sel) {
    const box = await this.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!box) throw new Error(`no element ${sel}`);
    await sleep(50);
    await this.click(box[0], box[1]);
  }
  /** Wheel scroll in steps, like a user turning a wheel. */
  async wheel(x, y, dy, { steps = 1, gapMs = 16 } = {}) {
    for (let i = 0; i < steps; i++) {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
      if (gapMs) await sleep(gapMs);
    }
  }
  /** A smooth scroll gesture synthesized by Chrome (touch on phones, wheel otherwise). */
  /** Note: with touch: true, headless Chrome delivers the gesture's pointer events but does not scroll the
   *  page; use touchDrag() to scroll like a finger. */
  async scrollGesture({ x, y, distance, speed = 800, touch = false }) {
    await this.send('Input.synthesizeScrollGesture', { x, y, yDistance: -distance, speed, gestureSourceType: touch ? 'touch' : 'mouse', preventFling: true });
  }
  /** A finger dragged up by `distance` px from (x, y) in `steps` moves 16 ms apart, then held still for
   *  `holdMs` before it lifts (so the page scrolls by about `distance`, with little fling). */
  async touchDrag({ x, y, distance, steps = 12, stepMs = 16, holdMs = 120 }) {
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= steps; i++) {
      await this.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (distance * i) / steps }] });
      await sleep(stepMs);
    }
    await sleep(holdMs);
    await this.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - distance }] });
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  async key(key, { code, text } = {}) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key, text });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key });
  }
  async close() { try { await this.browser.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* ignore */ } this.browser.pages.delete(this); }
}
