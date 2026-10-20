// What does a page cost in the seconds after its curtain parts, when the visitor starts to read and
// scroll (the statues arriving, the forms, the scroll-linked effects measured again)? Loads the page in
// two builds, alternately, and measures from the curtain parting to some seconds after: main-thread
// time (Chrome's TaskDuration), style and layout time, and the tasks over 50 ms (the page's own
// long-task observer). Each load follows a warm-up load of the same build, as a visitor's second page.
//
//   node tools/perf/forensics/after-curtain.mjs writers.html --before <dist> [--after <dist>] [--device phone] [--runs 5] [--secs 5]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { twoBuilds } from './_args.mjs';

const { before, after, positional, flags } = twoBuilds();
const file = positional[0] || 'writers.html';
const device = String(flags.device || 'phone');
const runs = Number(flags.runs || 5);
const secs = Number(flags.secs || 5);

const builds = [['before', before], ['after', after]];
const servers = Object.fromEntries(await Promise.all(builds.map(async ([k, root]) => [k, await serve({ root, base: '/' })])));
const browser = await launch({ headless: true });
const one = async (k) => {
  const page = await browser.newPage();
  try {
    await page.emulate({ device, network: 'none' });
    await page.goto(servers[k].url + file, { timeout: 60000 });
    await page.waitForMark('parted', { timeout: 60000 });
    await page.goto('about:blank');
    await page.goto(servers[k].url + file, { timeout: 60000 });
    await page.waitForMark('parted', { timeout: 60000 });
    const m0 = await page.metrics();
    const p0 = await page.probe();
    await sleep(secs * 1000);
    const m1 = await page.metrics();
    const p1 = await page.probe();
    return { task: m1.taskMs - m0.taskMs, style: m1.recalcStyleMs - m0.recalcStyleMs, layout: m1.layoutMs - m0.layoutMs, long: p1.longTaskMs - p0.longTaskMs, longN: (p1.longTasks ?? 0) - (p0.longTasks ?? 0) };
  } finally {
    await page.close();
  }
};
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
try {
  const res = { before: [], after: [] };
  for (let i = 0; i < runs; i++) for (const [k] of i % 2 ? builds.slice().reverse() : builds) res[k].push(await one(k));
  console.log(`${file} (${device}), from the curtain parting to ${secs} s after, median of ${runs} (alternating)`);
  for (const [k] of builds) {
    const r = res[k];
    const f = (g) => Math.round(med(r.map(g)));
    console.log(`  ${k.padEnd(7)} main thread ${f((x) => x.task)} ms | style ${f((x) => x.style)} ms | layout ${f((x) => x.layout)} ms | long tasks ${f((x) => x.long)} ms   (each run's main thread: ${r.map((x) => Math.round(x.task)).join(', ')})`);
  }
} finally {
  await browser.close();
  for (const s of Object.values(servers)) await s.close();
}
