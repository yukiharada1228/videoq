import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import previewViteConfig from './.storybook/vite.config';

export default defineProject({
  resolve: previewViteConfig.resolve,
  define: previewViteConfig.define,
  // Prebundle SWC's injected runtime and chart stories before browser tests start.
  optimizeDeps: { include: ['react/jsx-dev-runtime', 'react-dom', 'recharts'] },
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
