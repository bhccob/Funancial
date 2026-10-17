import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

const UNIT_TESTS = 'src/{domain,data,store,lib}/**/*.test.ts';
const CONFIG_TESTS = 'tests/unit/**/*.test.ts';
const API_TESTS = 'api/**/*.test.ts';
const SITE_TESTS = 'site/**/*.test.ts';

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
            include: [UNIT_TESTS, CONFIG_TESTS, API_TESTS, SITE_TESTS],
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
