import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', '*.config.js'],
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/utils.js', 'src/background.js', 'src/patterns.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script', // Chrome extension content scripts are not ES modules
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        MutationObserver: 'readonly',
        location: 'readonly',
        Blob: 'readonly',
        CSS: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        // Chrome extension globals
        chrome: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off', // Allow console for extension logging
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/utils.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module', // utils.js is an ES module for testing
      globals: {
        document: 'readonly', // May be available in browser context
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/background.js', 'src/patterns.js', 'src/learning.js', 'src/dom-healing.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module', // ES modules for service worker
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        chrome: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  eslintConfigPrettier,
];
