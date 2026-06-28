import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser only ever calls /api/* — Vite forwards it to the key-proxy (server/proxy.ts),
// so the Cerebras key never reaches the client bundle. Irrelevant in mock mode (no calls go out).
const PROXY_TARGET = process.env.PROXY_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: PROXY_TARGET, changeOrigin: true },
    },
  },
});