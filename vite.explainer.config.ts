/**
 * vite.explainer.config.ts — standalone production build for the depth-explainer page. [OWNER: B / explainer]
 *
 * The shared vite.config.ts (owned by A) builds the main app from index.html. This config builds the
 * explainer demo from explainer.html into dist-explainer/, so the "thinking graph" is independently
 * deployable for the demo video without touching the shared config.
 *
 *   npx vite build --config vite.explainer.config.ts
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-explainer',
    rollupOptions: {
      input: fileURLToPath(new URL('./explainer.html', import.meta.url)),
    },
  },
});
