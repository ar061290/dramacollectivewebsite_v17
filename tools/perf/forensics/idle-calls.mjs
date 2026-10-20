// Which functions run over and over on a still page? V8's precise coverage counts every call exactly,
// so a function called ~60 times a second is a per-frame one. Counts are reset once the page is up,
// then read after a few seconds of stillness; the functions are listed with their source line.
//
//   node tools/perf/forensics/idle-calls.mjs pieces.html [--device phone] [--dist <dir>] [--secs 2] [--min 20]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const pages = (positional[0] || 'pieces.html').split(',');
const device = String(flags.device || 'laptop');
const root = String(flags.dist || DIST);
const secs = Number(flags.secs || 2);
const min = Number(flags.min || Math.round(secs * 10));

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  for (const file of pages) {
    const page = await browser.newPage();
    try {
      await page.emulate({ device, network: 'none' });
      await page.send('Profiler.enable');
      await page.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true, allowTriggeredUpdates: false });
      await page.goto(srv.url + file, { timeout: 60000 });
      if (file === 'index.html') await page.waitForMark('intro-done', { timeout: 90000 });
      else await page.waitForMark('parted', { timeout: 60000 });
      await sleep(1500);
      await page.send('Profiler.takePreciseCoverage'); // resets the counts
      await sleep(secs * 1000);
      const { result } = await page.send('Profiler.takePreciseCoverage');
      const sources = new Map();
      const lineOf = async (scriptId, offset) => {
        if (!sources.has(scriptId)) { try { sources.set(scriptId, (await page.send('Debugger.getScriptSource', { scriptId })).scriptSource); } catch { sources.set(scriptId, ''); } }
        const src = sources.get(scriptId);
        const before = src.slice(0, offset);
        const line = before.split('\n').length;
        const snippet = src.slice(offset, offset + 70).replace(/\s+/g, ' ');
        return { line, col: offset - before.lastIndexOf('\n'), snippet };
      };
      await page.send('Debugger.enable');
      const rows = [];
      for (const s of result) {
        for (const f of s.functions) {
          const count = f.ranges[0]?.count ?? 0;
          if (count < min) continue;
          rows.push({ url: s.url.replace(/^.*\//, '') || '(inline)', scriptId: s.scriptId, name: f.functionName || '(anonymous)', count, offset: f.ranges[0].startOffset });
        }
      }
      rows.sort((a, b) => b.count - a.count);
      console.log(`== ${file} (${device}): functions called ${min}+ times in ${secs} s of stillness`);
      for (const r of rows.slice(0, Number(flags.top || 25))) {
        const at = await lineOf(r.scriptId, r.offset);
        console.log(`   ${String(r.count).padStart(5)}x  ${r.name.padEnd(18).slice(0, 18)} ${r.url}:${at.line}:${at.col}  ${at.snippet}`);
      }
    } catch (err) {
      console.log(`== ${file}: FAILED ${err.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await srv.close();
}
