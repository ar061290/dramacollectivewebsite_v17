// Who calls a function on a still page, and with what? Sets a logpoint (a breakpoint whose condition
// logs and never pauses) at a line and column of a built script, waits a few seconds of stillness, and
// prints what it logged: by default the call stack, or any expression evaluated in that scope.
// Use the line:column that idle-calls.mjs or idle-loops.mjs printed for the function.
//
//   node tools/perf/forensics/logpoint.mjs pieces.html --script flyin --at 16:20971 [--expr "JSON.stringify(Object.keys(this))"] [--max 4]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'pieces.html';
const root = String(flags.dist || DIST);
const device = String(flags.device || 'laptop');
const scriptPart = String(flags.script || 'flyin');
const [line, col] = String(flags.at || '1:1').split(':').map(Number);
const max = Number(flags.max || 4);
const expr = flags.expr ? String(flags.expr) : 'new Error().stack.split("\\n").slice(1, 9).map((s) => s.trim()).join(" <- ")';

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(file === 'index.html' ? 'intro-done' : 'parted', { timeout: 60000 });
  await sleep(1500);
  await page.send('Debugger.enable');
  const condition = `((globalThis.__dcLp = (globalThis.__dcLp || 0) + 1) <= ${max}) && console.log('DCLP ' + globalThis.__dcLp + ': ' + (${expr})), false`;
  const bp = await page.send('Debugger.setBreakpointByUrl', { urlRegex: `.*${scriptPart}.*\\.js`, lineNumber: line - 1, columnNumber: col - 1, condition });
  console.log(`logpoint at ${scriptPart}:${line}:${col} -> ${bp.locations.length} location(s)${bp.locations[0] ? ` (resolved to ${bp.locations[0].lineNumber + 1}:${bp.locations[0].columnNumber + 1})` : ''}`);
  await sleep(Number(flags.secs || 2) * 1000);
  const calls = await page.evaluate('globalThis.__dcLp || 0');
  console.log(`hit ${calls} times in ${flags.secs || 2} s`);
  for (const c of page.console.filter((m) => m.text.startsWith('DCLP'))) console.log('  ' + c.text.slice(0, 900));
} finally {
  await browser.close();
  await srv.close();
}
