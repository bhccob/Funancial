import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

const UNIT_TESTS = 'src/{domain,data,store,lib}/**/*.test.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: ['src/test/setup.ts'],
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            include: [UNIT_TESTS],
          },
        },
        {
          extends: true,
          test: {
            name: 'ui',
            environment: 'jsdom',
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: [...configDefaults.exclude, UNIT_TESTS],
          },
        },
      ],
    },
  }),
);
