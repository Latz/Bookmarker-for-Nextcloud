import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    silent: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.js',
        'src/popup/modules/tagify.js',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
