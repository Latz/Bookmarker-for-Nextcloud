module.exports = {
  env: {
    browser: true,
    es2021: true,
    webextensions: true,
    node: true,
  },
  extends: 'eslint:recommended',
  overrides: [],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {},
  ignorePatterns: ['/popup/modules/tagify.js'],
};
