import { defineConfig } from 'vite';
import { PAGES } from './tools/pages/build.mjs';
import { cpSync } from 'node:fs';

/**
 * The head of the built pages, finished by hand (tools/pages/build.mjs writes the source head):
 *
 * - the home page's statue preload (1.81 MB) is made only for the devices that will draw the live
 *   stage, with the cheap half of src/util/env.js prefersStatic(): Save-Data, two cores or two
 *   gigabytes or less, or no WebGL 2 get the still picture, so they no longer download the model
 *   they will never decode, in front of the picture they are waiting for. The same gate also starts
 *   the Draco decoder's two files and the stage's own chunks (three.js, Stage, the loaders) at
 *   parse time, in parallel with the model, rather than when the boot code first asks for them.
 *   (A plain <link rel=preload> cannot be gated: the browser's preload scanner fetches it before any
 *   script runs; so the link is replaced by a script that makes it.)
 * - the publication's still (71 KB, preloaded at high priority) is the one the saved theme needs,
 *   not always the dark one.
 * - the jsDelivr preconnect is for the source-served site only (the build has no CDN): dropped.
 * - the page not found (404.html), built on the deploy (GITHUB_REPOSITORY is set there), is given the
 *   site's root as a <base> in its markup, so a missing address however deep fetches its files once.
 */
function finishHead() {
  const GATE = "(function(){try{var q=location.search;if(/[?&]static\\b/.test(q))return false;if(/[?&]live\\b/.test(q))return true;var c=navigator.connection;if(c&&c.saveData)return false;if((navigator.hardwareConcurrency||4)<=2||(navigator.deviceMemory||4)<=2)return false;return 'WebGL2RenderingContext' in window;}catch(e){return true;}})()";
  const link = (attrs) => `document.head.appendChild(Object.assign(document.createElement('link'),${JSON.stringify(attrs)}));`;
  return {
    name: 'dc-finish-head',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle || {};
        const files = Object.keys(bundle);
        const byName = (re) => files.find((f) => re.test(f));
        let top = '';
        // 1. the home page: the gated statue preload, the decoder and the stage's chunks
        html = html.replace(/<link rel="preload" href="([^"]+)" as="fetch" type="model\/gltf-binary"[^>]*>/, (m, href) => {
          const stage = byName(/^assets\/Stage-[^/]+\.js$/);
          const chunks = new Set();
          const walk = (f) => { if (!f || chunks.has(f) || !bundle[f]) return; chunks.add(f); for (const i of bundle[f].imports || []) walk(i); };
          walk(stage);
          const dir = './'; // the build's base
          const draco = ['draco_wasm_wrapper.js', 'draco_decoder.wasm'].map((f) => dir + 'draco/' + f);
          // the statue first, in the first bytes (it is what the curtain waits for); the decoder and the stage's
          // code once the first frame has painted: in the first bytes they shared a slow link with the
          // stylesheet and held the loader's first paint back (~250 ms on 4G) without bringing the curtain sooner
          const later = [
            ...draco.map((d) => link({ rel: 'preload', href: d, as: 'fetch', crossOrigin: 'anonymous' })),
            ...[...chunks].map((c) => link({ rel: 'modulepreload', href: dir + c, crossOrigin: '' })),
          ];
          // (the lite tier's own model, its pictures at 1024 pixels: the tier is on <html> by now)
          const lite = byName(/^assets\/statue-rig-lite-[^/]+\.glb$/);
          const model = (h) => JSON.stringify({ rel: 'preload', href: h, as: 'fetch', type: 'model/gltf-binary', crossOrigin: 'anonymous' });
          const lines = [
            lite
              ? `document.head.appendChild(Object.assign(document.createElement('link'), document.documentElement.classList.contains('tier-lite') ? ${model(dir + lite)} : ${model(href)}));`
              : link({ rel: 'preload', href, as: 'fetch', type: 'model/gltf-binary', crossOrigin: 'anonymous' }),
            `requestAnimationFrame(function () { setTimeout(function () { ${later.join(' ')} }, 0); });`,
          ];
          top = `<script>/* the statue, its decoder and the stage's code start now, for the devices that will draw them (the rest get the still picture: src/util/env.js) */\n  if (${GATE}) { ${lines.join(' ')} }</script>`;
          return '';
        });
        // in the first bytes of the page, as early as the preload scanner would have seen a plain link (further
        // down it ran only after the stylesheet and the other preloads): right after the head's inline script
        // that puts the device's tier on <html> (tools/pages/build.mjs), which it reads; else after the title
        if (top) {
          const tiered = /hc\.add\('tier-lite'\)[\s\S]*?<\/script>/;
          html = tiered.test(html) ? html.replace(tiered, (m) => `${m}\n  ${top}`) : html.replace(/<\/title>\s*/, (m) => `${m}${top}\n  `);
        }
        // 2. the publication's still, for the theme in use
        if (/publication\.html$/.test(ctx.path)) html = html.replace(/<link rel="preload" as="image" href="([^"]+)"([^>]*)>/, (m, dark, rest) => {
          const light = byName(/^assets\/thinker-light-[^/]+\.webp$/);
          if (!light) return m;
          const lightHref = './' + light;
          const prio = /fetchpriority="([^"]+)"/.exec(rest)?.[1] || 'auto';
          return `<script>/* the opening's still for the theme in use (the saved theme is applied above) */\n  ${link({ rel: 'preload', as: 'image', fetchPriority: prio, href: '__STILL__' }).replace('"__STILL__"', `document.documentElement.dataset.theme==='light'?${JSON.stringify(lightHref)}:${JSON.stringify(dark)}`)}</script>`;
        });
        // 3. no CDN in the build
        html = html.replace(/\s*<link rel="preconnect"[^>]*data-dc-live[^>]*>/, '');
        // 4. the page not found, on the deploy: GitHub Pages serves it at any missing address, however deep, and
        // the preload scanner would fetch its files from that address's folder (each answered with this page) before
        // its script could set the site's root; a <base> in the markup is read first (404.html keeps the script)
        const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
        if (repo && /(^|[\\/])404\.html$/.test(ctx.path)) {
          html = html.replace(/(<meta name="viewport"[^>]*>)/, `$1\n  <base href="${/\.github\.io$/i.test(repo) ? '/' : `/${repo}/`}">`);
        }
        return html;
      },
    },
  };
}

/**
 * GSAP's ScrollTrigger keeps an empty requestAnimationFrame loop going for as long as it is enabled (its
 * source: "in some browsers (like Firefox), screen repaints weren't consistent unless we had SOMETHING
 * queued up in requestAnimationFrame()"). In Chromium it does nothing but keep a still page's thread
 * producing a frame 60 times a second, and in each of those frames the browser refreshes the style of
 * every running animation (the music bars, the banner's line). Left out in Chromium browsers only, the
 * one engine where the lab can show that nothing changes; kept as it is everywhere else. The build stops
 * if GSAP's code there changes, so a GSAP upgrade gets this looked at again.
 */
function quietScrollTrigger() {
  const FROM = /(_rafBugFix = function _rafBugFix\(\) \{\r?\n\s*return _enabled && )(requestAnimationFrame\(_rafBugFix\);\r?\n\},)/;
  return {
    name: 'dc-quiet-scrolltrigger',
    transform(code, id) {
      if (!/[\\/]gsap[\\/]ScrollTrigger\.js$/.test(id.split('?')[0])) return null;
      if (!FROM.test(code)) this.error('gsap/ScrollTrigger.js has changed where vite.config.js patches its animation-frame loop: look at quietScrollTrigger() again');
      return {
        code: code.replace(FROM, (m, head, tail) => `${head}_rafBugNeeded && ${tail}\n    _rafBugNeeded = typeof navigator === 'undefined' || !/\\bChrome\\//.test(navigator.userAgent),`),
        map: null,
      };
    },
  };
}

/**
 * The Gallery's pictures whole (assets/gallery/<event>/001.webp, …): each tile links to its own, for
 * the lightbox (src/pages/gallery.js) to open, and Vite does not follow a link's href, so they are
 * copied into the built site at the same paths. (The tiles, the films and their posters are in <img>
 * and <video>, which Vite does follow: they are built as hashed assets like any picture.)
 */
function galleryWhole() {
  return {
    name: 'dc-gallery-whole',
    apply: 'build',
    closeBundle() {
      cpSync('assets/gallery', 'dist/assets/gallery', {
        recursive: true,
        filter: (src) => !/\.\w+$/.test(src) || /[\\/](\d{3}|film-\d+)\.webp$/.test(src),
      });
    },
  };
}

/**
 * The home page paints its first text only after the curtain, seconds in: its text faces' preloads (kept on
 * the inner pages, whose reveals split on the real type as the curtain parts) only competed with the
 * stylesheet for a slow link there (the loader's first paint ~70 ms later on 4G). Done before Vite reads
 * the page, while the links still name their files.
 */
function homeFonts() {
  return {
    name: 'dc-home-fonts',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!/(^|[\\/])index\.html$/.test(ctx.path || ctx.filename || '')) return html;
        return html.replace(/[ \t]*<link rel="preload" href="[^"]*(?:Lato-400|Lato-700|OpenSans-400)\.woff2" as="font"[^>]*>\r?\n?/g, '');
      },
    },
  };
}

export default defineConfig({
  // relative asset paths, so the built site works at the root of a domain and under a project
  // path alike (GitHub Pages serves a repository at /<repository>/)
  base: './',
  // statue-rig.glb is referenced with new URL(..., import.meta.url) and copied as a hashed asset
  assetsInclude: ['**/*.glb'],
  plugins: [homeFonts(), finishHead(), quietScrollTrigger(), galleryWhole()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // keep the GLB, fonts and Lottie JSON as separate cacheable files
    chunkSizeWarningLimit: 900, // three.js lives in the lazily loaded stage chunk
    // one HTML entry per page (the list lives in tools/pages/build.mjs)
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p.key, p.file])) },
  },
});
