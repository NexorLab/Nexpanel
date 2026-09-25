import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The panel talks to the API with relative paths (/api/v1/...), which is
    // correct in production where both are served from one origin. For local
    // dev the API runs separately on the Workers dev server, so proxy those
    // requests there. Disabled when VITE_API_MODE=mock (nothing is sent).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
