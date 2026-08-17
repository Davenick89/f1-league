import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'sw-src',
      filename: 'firebase-messaging-sw.js',
      registerType: 'prompt',
      injectManifest: {
        // The FCM worker uses importScripts, so its final registration must
        // be a classic worker rather than an ES module worker.
        rollupFormat: 'iife',
        // Precache the app shell plus only the icons and manifest needed for
        // install/offline chrome; Firestore and API responses stay out of it.
        globPatterns: ['**/*.{js,css,html}', 'icons/*.{svg,png}', 'manifest.webmanifest'],
      },
      manifest: {
        name: 'F1 Karvaan Predictions League',
        short_name: 'F1 Karvaan',
        description: 'F1 predictions league for the 2026 season.',
        theme_color: '#030712',
        background_color: '#030712',
        display: 'standalone',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
})
