import { fileURLToPath } from 'node:url';
import type { PluginOption, UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// The preview has no application API proxy or production-only manual chunks.
export default {
  // Never inherit a developer's or deployment's real API origin in previews.
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_USE_S3_STORAGE': JSON.stringify('false'),
  },
  // plugin-react-swc resolves the hoisted vite copy, whose Plugin type differs from this workspace's vite.
  plugins: [react() as unknown as PluginOption],
  resolve: {
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
} satisfies UserConfig;
