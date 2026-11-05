// Tuotantopolku (import.meta.env.DEV=false) testikehykselle: build + preview.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  plugins: [react()],
  build: { outDir: '/tmp/trip-harness-dist', emptyOutDir: true, rollupOptions: { input: resolve(import.meta.dirname, 'trip-legs.html') } },
});
