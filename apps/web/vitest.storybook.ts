import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import previewViteConfig from './.storybook/vite.config';

export default defineProject({
  resolve: previewViteConfig.resolve,
  // SWC injects this import after dependency scanning; avoid reloading running tests.
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
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
