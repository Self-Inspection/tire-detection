import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Only use self-signed SSL for local dev; Railway terminates HTTPS at the proxy
    command === 'serve' && basicSsl(),
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
  ].filter(Boolean),
  server: {
    host: true
  },
  preview: {
    host: true,
    port: parseInt(process.env.PORT) || 4173,
    allowedHosts: 'all'
  },
  resolve: {
    alias: {
      // body-segmentation has a static require('@mediapipe/selfie_segmentation')
      // at the top of its bundle. We use runtime:'tfjs' so the MediaPipe code
      // path is never entered — this stub satisfies the import without the WASM pkg.
      '@mediapipe/selfie_segmentation': '/src/mediapipe-stub.js',
    }
  },
  build: {
    rollupOptions: {
      // Only the unrelated MediaPipe packages remain external.
      external: [
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
}));
