import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    silent: true,
    // Reuse the jsdom environment across files in a worker. Building one per
    // file costs ~20s here, which starved workers at startup and left most of
    // the suite unable to run at all. Tests already reset state per test via
    // vi.resetModules() / vi.clearAllMocks() in their beforeEach hooks.
    isolate: false,
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
