import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so phones on the local network can open the app.
    host: true,
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
})
