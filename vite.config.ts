import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/* The recipe data and favicons live at the repo root (CI regenerates
   recipes.json and the favicon PNGs there before building). This copies
   them into dist/ after each build so dist/ is the complete website —
   that folder is all the Docker image needs to serve. Files that don't
   exist yet (e.g. favicon PNGs on a local machine) are simply skipped. */
const STATIC_FILES = [
  'recipes.json',
  'recipes/_index.json',
  'favicon.svg',
  'favicon.ico',
  'favicon-16.png',
  'favicon-32.png',
  'apple-touch-icon.png',
];

function copyStaticFiles(): Plugin {
  return {
    name: 'copy-static-files',
    apply: 'build',
    closeBundle() {
      for (const file of STATIC_FILES) {
        const from = resolve(__dirname, file);
        if (!existsSync(from)) continue;
        const to = resolve(__dirname, 'dist', file);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticFiles()],
  // Relative asset paths, so the site also works if served from a sub-path.
  base: './',
  // Root files are copied by the plugin above instead.
  publicDir: false,
  server: {
    // When running `npm run dev`, forward /api calls to the Python API
    // (start it with `uvicorn api.main:app --port 8000`).
    proxy: { '/api': 'http://localhost:8000' },
  },
  build: {
    // Atlaskit is a large library; this just stops Vite warning about it.
    chunkSizeWarningLimit: 2000,
  },
});
