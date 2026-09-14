import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import previewViteConfig from './.storybook/vite.config';

export default defineProject({
  resolve: previewViteConfig.resolve,
  define: previewViteConfig.define,
  // Prebundle runtimes, charts and DnD before browser tests start to avoid a mid-run reload.
  optimizeDeps: { include: ['react/jsx-dev-runtime', 'react-dom', 'recharts', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'] },
  plugins: [storybookTest({ configDir: fileURLToPath(new URL('./.storybook', import.meta.url)) })],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
  },
});
