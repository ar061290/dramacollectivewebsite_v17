import { defineConfig } from 'vite';
import { PAGES } from './tools/pages/build.mjs';

export default defineConfig({
  // statue-rig.glb is referenced with new URL(..., import.meta.url) and copied as a hashed asset
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // keep the GLB, fonts and Lottie JSON as separate cacheable files
    chunkSizeWarningLimit: 900, // three.js lives in the lazily loaded stage chunk
    // one HTML entry per page (the list lives in tools/pages/build.mjs)
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p.key, p.file])) },
  },
});
