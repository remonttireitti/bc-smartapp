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
      includeAssets: ['icon.svg', 'pwa-180.png', 'pwa-192.png', 'pwa-512.png', 'refrigerant-bottle-default.png'],
      manifest: {
        name: 'BC Smartapp',
        short_name: 'BC Smartapp',
        description: 'Työraportit, huollot, varasto ja asiakashallinta',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
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
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
        globIgnores: ['**/termatek/**', '**/firmware/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.method === 'GET' && /supabase\.co\/rest\/v1\//i.test(url.href),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 8,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
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
