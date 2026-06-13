import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TireCheck — Tread Depth Scanner',
        short_name: 'TireCheck',
        description: 'Measure tire tread depth using your phone camera',
        theme_color: '#1a1a2e',
        background_color: '#0f0f1a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/'
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /storage\.googleapis\.com\/tfjs-models/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tf-models',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true
  },
  build: {
    rollupOptions: {
      // These optional MediaPipe packages are lazy-loaded by body-segmentation
      // and are not needed for the ARPortraitDepth model we use.
      external: [
        '@mediapipe/selfie_segmentation',
        '@mediapipe/face_detection',
        '@mediapipe/face_mesh',
        '@mediapipe/pose'
      ],
      output: {
        manualChunks: {
          tensorflow: [
            '@tensorflow/tfjs',
            '@tensorflow-models/depth-estimation',
            '@tensorflow-models/body-segmentation'
          ]
        }
      }
    }
  }
});
