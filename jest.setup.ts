/**
 * Global test setup. `@testing-library/react-native` (v12.4+) registers its
 * built-in jest matchers automatically on import, and auto-cleans rendered
 * trees after each test, so this file only needs to exist for future hooks.
 *
 * Note: the `expo-sqlite` data layer is mocked via `__mocks__/expo-sqlite.ts`
 * (in-memory better-sqlite3). Data-layer test files call `jest.resetModules()`
 * in `beforeEach` to get a fresh, schema-initialized database per test.
 */
import '@testing-library/react-native';
