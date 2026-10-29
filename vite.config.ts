import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { inviteCompanyUserPlugin } from './vite.invite-plugin';
import { tripDistancePlugin } from './vite.trip-distance-plugin';

export default defineConfig({
  plugins: [
    react(),
    inviteCompanyUserPlugin(),
    tripDistancePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.svg', 'favicon-16.png', 'favicon-32.png', 'pwa-180.png', 'pwa-192.png', 'pwa-512.png', 'pwa-512-maskable.png', 'og.png', 'brand/logo-icon.svg', 'brand/logo-horizontal.svg', 'refrigerant-bottle-default.png', 'BC-Smartapp-kayttoohje.pdf'],
      manifest: {
        name: 'BC Smartapp',
        short_name: 'BC Smartapp',
        description: 'Työraportit, huollot, varasto ja asiakashallinta',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        id: '/',
        start_url: '/',
        scope: '/',
        lang: 'fi',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Main bundle exceeds Workbox default 2 MiB precache limit as app grows.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,svg,png,pdf,woff2}'],
        globIgnores: ['**/termatek/**', '**/firmware/**', '**/esittely/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/esittely(\/|$)/, /\.pdf$/i, /\.xml$/i, /\.txt$/i, /^\/brand\//, /^\/termatek\//, /^\/vrf-firmware\//],
        runtimeCaching: [
          // Supabase REST -välimuisti hoidetaan sovelluksen offline-kerroksessa (src/lib/offline), ei service workerissa.
          {
            urlPattern: ({ url }) => /supabase\.co\/storage\/v1\//i.test(url.href),
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
