import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import mkcert from 'vite-plugin-mkcert'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    mkcert({ hosts: ['localhost', '127.0.0.1', '*.standmanager.local'] }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Stand Manager',
        short_name: 'StandManager',
        theme_color: '#2563eb',
        background_color: '#0a0b0d',
        display: 'standalone',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      // Nessuna cache delle risposte API: potrebbe servire dati di un altro utente.
      // Offline il catalogo e l'ultima sessione arrivano da Dexie/localStorage (src/offline/).
})
  ],
  server: {
    https: true,
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['*.standmanager.local', 'mariasstrocchio.standmanager.local','default.standmanager.local']
  }
})