/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.js' },
  mutate: ['src/**/*.js'],
  coverageAnalysis: 'perTest',
  reporters: ['html', 'json', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
};
