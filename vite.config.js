import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  plugins: [
    react(),
    // Only use self-signed SSL for local dev; Railway terminates HTTPS at the proxy
    command === 'serve' && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered manually in src/main.jsx with periodic update checks
      manifest: {
        name: 'TireCheck — Tread Depth',
        short_name: 'TireCheck',
        description: 'Measure tire tread depth using your phone camera',
        theme_color: '#1a1a2e',
        background_color: '#0f0f1a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/'
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ].filter(Boolean),
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
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
