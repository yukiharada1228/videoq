import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { StorybookConfig } from '@storybook/react-vite';

// npm may install the framework/addons in apps/web while hoisting Storybook itself.
const packagePath = (name: string) => dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'].map(packagePath),
  framework: {
    name: packagePath('@storybook/react-vite'),
    options: {
      builder: { viteConfigPath: fileURLToPath(new URL('./vite.config.ts', import.meta.url)) },
    },
  },
  core: { disableTelemetry: true },
};

export default config;
