import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // CLI `--host 0.0.0.0` (compose) overrides; default stays loopback for host-only Vite.
    host: process.env.VITE_DEV_HOST || '127.0.0.1',
    port: 3000,
    proxy: {
      // Local Hono (wrangler). Client should use VITE_API_URL=/api so cookies stay same-origin.
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      // Health endpoints live at the API origin root rather than below /api.
      '/health': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/ready': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['react-router-dom'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-ui': ['lucide-react'],
          'vendor-charts': ['recharts'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-radix': ['@radix-ui/react-checkbox', '@radix-ui/react-label', '@radix-ui/react-select', '@radix-ui/react-slot'],
        },
      },
    },
  },
})
