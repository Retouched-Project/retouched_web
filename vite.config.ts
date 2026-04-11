import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

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
    topLevelAwait()
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
