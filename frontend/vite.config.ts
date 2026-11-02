import { defineConfig } from 'vite';
import {readFileSync} from 'node:fs';
const appVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import react from '@vitejs/plugin-react';
const runtime = 'http://127.0.0.1:8765';
export default defineConfig({
  // GitHub Pages runs under /NexusMCP-Studio/, while the desktop app uses /.
  base: process.env.GITHUB_PAGES === 'true' ? '/NexusMCP-Studio/' : '/',
  plugins: [react()],
  define:{'import.meta.env.VITE_APP_VERSION':JSON.stringify(appVersion)},
  server: {
    proxy: {
      '/api': { target: runtime, changeOrigin: true, headers: { origin: runtime } },
      '/ws': { target: runtime, ws: true, changeOrigin: true, headers: { origin: runtime } },
    },
  },
  build: { chunkSizeWarningLimit: 700 },
});
