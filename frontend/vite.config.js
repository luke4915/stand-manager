import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    mkcert({ hosts: ['localhost', '127.0.0.1', '*.standmanager.local'] }),
    VitePWA({
      registerType: 'autoUpdate',
      // Icone in public/: il simbolo occupa il 56% del lato, quindi la 512 vale anche
      // come icona "maskable" (resta dentro la zona sicura quando il sistema la ritaglia).
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Stand Manager',
        short_name: 'StandManager',
        description: 'Gestionale per sagre, eventi e ristorazione',
        lang: 'it',
        theme_color: '#2563eb',
        background_color: '#0a0b0d',
        display: 'standalone',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Nessuna cache delle risposte API: potrebbe servire dati di un altro utente.
      // Offline il catalogo e l'ultima sessione arrivano da Dexie/localStorage (src/offline/).
    }),
  ],
  server: {
    https: true,
    host: true,
    port: 5173,
    strictPort: true,
    // Il punto iniziale ammette tutti i sottodomini: ogni tenant ha il suo.
    allowedHosts: ['.standmanager.local'],
  },
})
