import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // @storybook/addon-vitest discovers this workspace; unit tests keep their own setup.
    projects: ['./vitest.unit.ts', './vitest.storybook.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/pages/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '**/dist/**',
        '**/*.stories.*',
        '**/.storybook/**',
        '**/storybook-static/**',
        'vitest.*.ts',
        // These run in workerd via test:worker in the required frontend-build
        // job, not in the browser's jsdom/V8 process that produces this report.
        'worker/**',
        'scripts/test-worker.mjs',
        '**/.wrangler/**',
      ],
      thresholds: {
        branches: 50,
        functions: 50,
        lines: 50,
        statements: 50,
      },
    },
  },
})
