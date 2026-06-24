// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Tests use require() inside beforeEach with jest.resetModules() to get a
    // fresh, schema-initialized in-memory database per test.
    files: ["**/__tests__/**", "**/__mocks__/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
