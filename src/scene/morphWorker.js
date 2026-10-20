// The morph's worker: the logo's extrusion and the pairing of 183k triangles, off the page's own
// thread (src/scene/morphCore.js has the arithmetic; src/scene/morph.js the account of it). One
// message in (the job), one out (the soup, its buffers handed over rather than copied).
import { buildAll, transferables } from './morphCore.js';

self.onmessage = (e) => {
  try {
    const result = buildAll(e.data);
    self.postMessage({ ok: true, result }, transferables(result));
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};
