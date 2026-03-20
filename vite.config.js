import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Injects VITE_ env vars into the service worker after build,
  // since service workers can't use import.meta.env
  const injectSwEnv = {
    name: 'inject-sw-env',
    writeBundle() {
      const swPath = 'dist/firebase-messaging-sw.js'
      if (!fs.existsSync(swPath)) return
      let sw = fs.readFileSync(swPath, 'utf-8')
      const vars = [
        'VITE_FIREBASE_API_KEY',
        'VITE_FIREBASE_AUTH_DOMAIN',
        'VITE_FIREBASE_PROJECT_ID',
        'VITE_FIREBASE_STORAGE_BUCKET',
        'VITE_FIREBASE_MESSAGING_SENDER_ID',
        'VITE_FIREBASE_APP_ID',
      ]
      vars.forEach((key) => {
        sw = sw.replaceAll(`__${key}__`, env[key] ?? '')
      })
      fs.writeFileSync(swPath, sw)
    },
  }

  return {
    plugins: [react(), injectSwEnv],
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    server: {
      port: 5173,
    },
  }
})
