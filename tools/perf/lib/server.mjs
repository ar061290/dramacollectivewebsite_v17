// A static server for the benchmarks, with no dependencies. It serves a folder (the built dist, or
// the source tree as GitHub Pages does today) the way GitHub Pages does: Cache-Control max-age=600,
// gzip or brotli for text, byte ranges for the music, the right MIME types for GLB, WASM and WOFF2.
import http from 'node:http';
import http2 from 'node:http2';
import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs';
import { join, extname, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.map': 'application/json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.xml', '.wasm', '.map', '.gltf']);

/**
 * @param {{ root: string, port?: number, base?: string, cache?: string, compress?: boolean, delayMs?: number }} opts
 * base: the path the site is served under ('/' or '/dramacollectivewebsite_v18/', as a project Pages site is).
 * delayMs: an extra server-side delay per response (the CDN's own think time), on top of CDP's network emulation.
 * h2: serve over HTTP/2 (TLS with the self-signed certificate in lib/cert; the lab's Chrome ignores certificate errors),
 *     as GitHub Pages does; over HTTP/1.1 the browser's six connections per host queue the many small requests.
 */
export function serve({ root, port = 0, base = '/', cache = 'public, max-age=600', compress = true, delayMs = 0, h2 = false } = {}) {
  const absRoot = resolve(root);
  if (!base.endsWith('/')) base += '/';
  const log = [];
  const handler = (req, res) => {
    const started = Date.now();
    let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!url.startsWith(base)) { res.writeHead(404); res.end('not under base'); return; }
    url = url.slice(base.length - 1);
    let file = normalize(join(absRoot, url));
    if (!file.startsWith(absRoot + sep) && file !== absRoot) { res.writeHead(403); res.end(); return; }
    try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); } catch { /* fall through to the 404 */ }
    if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>404</h1>'); log.push({ url, status: 404 }); return; }
    const st = statSync(file);
    const ext = extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': type, 'Cache-Control': cache, 'Accept-Ranges': 'bytes', 'Last-Modified': st.mtime.toUTCString(), ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); log.push({ url, status: 304, ms: Date.now() - started }); return; }
    const send = () => {
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
        if (!m[1] && m[2]) { start = st.size - parseInt(m[2], 10); end = st.size - 1; }
        end = Math.min(end, st.size - 1);
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        createReadStream(file, { start, end }).pipe(res);
        log.push({ url, status: 206, bytes: end - start + 1, ms: Date.now() - started });
        return;
      }
      const accept = req.headers['accept-encoding'] || '';
      if (compress && COMPRESSIBLE.has(ext) && st.size > 256 && /\b(br|gzip)\b/.test(accept)) {
        const br = /\bbr\b/.test(accept);
        res.writeHead(200, { ...headers, 'Content-Encoding': br ? 'br' : 'gzip', Vary: 'Accept-Encoding' });
        const z = br ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.createGzip({ level: 6 });
        createReadStream(file).pipe(z).pipe(res);
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': st.size });
        createReadStream(file).pipe(res);
      }
      log.push({ url, status: 200, bytes: st.size, ms: Date.now() - started });
    };
    if (delayMs) setTimeout(send, delayMs); else send();
  };
  let server;
  if (h2) {
    const certDir = join(dirname(fileURLToPath(import.meta.url)), 'cert');
    server = http2.createSecureServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')), allowHTTP1: true }, handler);
  } else server = http.createServer(handler);
  return new Promise((resolveStart) => {
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      resolveStart({ url: `${h2 ? 'https' : 'http'}://127.0.0.1:${p}${base}`, port: p, log, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

// `node tools/perf/lib/server.mjs <root> [base]` serves a folder by hand (PORT=4178 by default).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || 'dist';
  const base = process.argv[3] || '/';
  const s = await serve({ root, base, port: Number(process.env.PORT) || 4178 });
  console.log(`serving ${resolve(root)} at ${s.url}`);
}
