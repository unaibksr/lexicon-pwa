import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32x32.png', 'apple-icon-180x180.png', 'android-icon-192x192.png', 'ms-icon-310x310.png'],
      manifest: {
        name: 'Lexicon Personal Dictionary',
        short_name: 'Lexicon',
        description: 'Personal Dark-Themed Offline Dictionary PWA',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['education', 'reference'],
        icons: [
          { src: 'android-icon-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: 'android-icon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: 'android-icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: 'android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'ms-icon-310x310.png', sizes: '310x310', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ]
});
