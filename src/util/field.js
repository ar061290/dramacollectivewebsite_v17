// Field measurements: what the visitor's own browser saw, sent once as the page is put away. Off
// unless the page names an endpoint (<meta name="dc-field" content="https://…">, written by
// tools/pages/build.mjs when FIELD_ENDPOINT is set); without one this module does nothing at all.
// What goes: the site's own marks (curtain-up, parted, morph ready…), the browser's paint timings,
// long tasks, layout shift, the device class, WebGL context losses and whether the tab had been
// discarded. No identifiers, no addresses, no page content: a few hundred bytes a visit.
import { mark } from './perf.js';

const ENDPOINT = document.querySelector('meta[name="dc-field"]')?.content || '';
const SAMPLE = Number(document.querySelector('meta[name="dc-field-sample"]')?.content || 1); // 1 = every visit, 0.1 = one in ten

const lost = [];
const longTasks = { count: 0, ms: 0, longest: 0 };
let shift = 0;
let sent = false;

export function setupField() {
  if (!ENDPOINT || Math.random() > SAMPLE) return () => {};
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { longTasks.count++; longTasks.ms += e.duration; longTasks.longest = Math.max(longTasks.longest, e.duration); } }).observe({ type: 'longtask', buffered: true });
  } catch { /* no long-task timing here */ }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) shift += e.value; }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* fine */ }
  // a context the browser took away (the home page's loader lets its own satin go on purpose as the
  // curtain goes up: not counted)
  const onLost = (e) => { if (e.target?.closest?.('.loader')) return; lost.push(Math.round(performance.now())); mark('context lost'); };
  document.addEventListener('webglcontextlost', onLost, true);
  const flush = () => { if (document.visibilityState === 'hidden') send(); };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', send);
  return () => {
    document.removeEventListener('webglcontextlost', onLost, true);
    document.removeEventListener('visibilitychange', flush);
    window.removeEventListener('pagehide', send);
  };
}

function send() {
  if (sent) return;
  sent = true;
  let data;
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name === 'first-contentful-paint' ? 'fcp' : 'fp', Math.round(e.startTime)]));
    const marks = Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('dc:')).map((m) => [m.name.slice(3), Math.round(m.startTime)]));
    data = {
      v: 1,
      page: location.pathname.replace(/^.*\//, '') || 'index.html',
      type: nav?.type, // navigate, reload, back_forward
      ttfb: nav ? Math.round(nav.responseStart) : null,
      ...paints,
      marks,
      longTasks: { ...longTasks, ms: Math.round(longTasks.ms), longest: Math.round(longTasks.longest) },
      cls: Math.round(shift * 1000) / 1000,
      lost,
      discarded: document.wasDiscarded === true,
      hidden: Math.round(performance.now()),
      device: {
        w: innerWidth, h: innerHeight, dpr: Math.round(devicePixelRatio * 100) / 100,
        cores: navigator.hardwareConcurrency ?? null, mem: navigator.deviceMemory ?? null,
        touch: matchMedia('(hover: none)').matches, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        net: navigator.connection?.effectiveType ?? null, save: navigator.connection?.saveData === true,
        webgl2: 'WebGL2RenderingContext' in window,
      },
      theme: document.documentElement.dataset.theme || 'dark',
    };
  } catch { return; }
  try {
    const body = JSON.stringify(data);
    if (!navigator.sendBeacon?.(ENDPOINT, body)) fetch(ENDPOINT, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(() => {});
  } catch { /* nothing to be done */ }
}
