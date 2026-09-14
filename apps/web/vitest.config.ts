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
