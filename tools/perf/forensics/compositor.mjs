// Why does an animation run on the page's thread instead of the compositor? Chrome's trace records an
// "Animation" event for each animation it starts, with a bitmask of the reasons it could not be
// composited (compositeFailed) and the properties at fault. Records the page's boot and a restart of
// every animation on it, then lists each animation with its reasons.
//
//   node tools/perf/forensics/compositor.mjs contact.html [--dist <dir>] [--device phone]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'contact.html';
const device = String(flags.device || 'laptop');
const root = String(flags.dist || DIST);

// Chromium's CompositorAnimations::FailureReason bits (third_party/blink/renderer/core/animation/compositor_animations.h)
const REASONS = [
  'accelerated animations disabled', 'effect suppressed by devtools', 'invalid animation or effect', 'effect has unsupported timing parameters',
  'effect has composite mode other than replace', 'target has invalid compositing state', 'target has incompatible animations', 'target has CSS offset',
  'target has multiple transform properties', 'animation affects non-CSS properties', 'transform related property depends on box size',
  'filter related property may move pixels', 'unsupported CSS property', 'mixed keyframe value types', 'timeline source has invalid compositing state',
  'animation has no visible change', 'affects important property', 'SVG target has independent transform property', 'unsupported timeline',
];
const why = (mask) => REASONS.filter((_, i) => mask & (1 << i)).join('; ') || `(bits ${mask})`;

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  const events = [];
  const off = page.on('Tracing.dataCollected', (p) => { for (const e of p.value) if (e.name === 'Animation' || e.name === 'Animation/Composited') events.push(e); });
  const done = new Promise((res) => { page.on('Tracing.tracingComplete', () => res()); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.animations', 'cc'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(file === 'index.html' ? 'curtain-up' : 'parted', { timeout: 60000 });
  await sleep(1200);
  // every animation restarted, so the ones that began before the trace are recorded too
  await page.evaluate(`for (const a of document.getAnimations()) { try { a.cancel(); a.play(); } catch (e) {} }`);
  await sleep(800);
  await page.send('Tracing.end');
  await done;
  off?.();
  const byId = new Map();
  if (process.env.RAW) for (const e of events.slice(0, Number(process.env.RAW))) console.log(JSON.stringify(e).slice(0, 600));
  for (const e of events) {
    const d = e.args?.data || e.args?.args?.data || {};
    const id = e.id2?.local || e.id || d.id || '?';
    const rec = byId.get(id) || { id, name: d.name || d.displayName || '', node: d.nodeName || '', state: '', failed: null, props: null };
    if (d.name || d.displayName) rec.name = d.name || d.displayName;
    if (d.nodeName) rec.node = d.nodeName;
    if (d.state) rec.state = d.state;
    if (d.compositeFailed !== undefined) rec.failed = d.compositeFailed;
    if (d.unsupportedProperties) rec.props = d.unsupportedProperties;
    byId.set(id, rec);
  }
  console.log(`${file} (${device}): ${byId.size} animations seen in the trace`);
  for (const r of byId.values()) {
    const status = r.failed === null ? 'no compositing verdict recorded' : r.failed === 0 ? 'COMPOSITED' : `main thread: ${why(r.failed)}${r.props ? ` [${r.props.join(', ')}]` : ''}`;
    console.log(`  ${(r.node || '?').padEnd(14)} ${(r.name || '(unnamed)').padEnd(22)} ${status}`);
  }
} finally {
  await browser.close();
  await srv.close();
}
