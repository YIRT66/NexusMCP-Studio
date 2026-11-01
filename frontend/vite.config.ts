import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const runtime = 'http://127.0.0.1:8765';
export default defineConfig({
  // GitHub Pages runs under /NexusMCP-Studio/, while the desktop app uses /.
  base: process.env.GITHUB_PAGES === 'true' ? '/NexusMCP-Studio/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: runtime, changeOrigin: true, headers: { origin: runtime } },
      '/ws': { target: runtime, ws: true, changeOrigin: true, headers: { origin: runtime } },
    },
  },
  build: { chunkSizeWarningLimit: 700 },
});
