import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { VitePWA } from 'vite-plugin-pwa'

const keyPath = process.env.VITE_CERT_KEY;
const certPath = process.env.VITE_CERT_PEM;

const httpsConfig = keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)
  ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
  : undefined;

if (!httpsConfig) {
  console.warn('TLS certs not found, running without HTTPS. Key:', keyPath, 'Cert:', certPath);
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['retouched_logo.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Retouched Web',
        short_name: 'Retouched Web',
        description: 'Retouched Web controller',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'fullscreen',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 8089,
    host: '0.0.0.0',
    https: httpsConfig,
    proxy: {
      '/offer': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
      '/bmregistry': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
      '/apps/icons': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
