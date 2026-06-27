/**
 * Global test setup. `@testing-library/react-native` (v12.4+) registers its
 * built-in jest matchers automatically on import, and auto-cleans rendered
 * trees after each test, so this file only needs to exist for future hooks.
 *
 * Note: the `expo-sqlite` data layer is mocked via `__mocks__/expo-sqlite.ts`
 * (in-memory better-sqlite3). Data-layer test files call `jest.resetModules()`
 * in `beforeEach` to get a fresh, schema-initialized database per test.
 */
import { configure } from '@testing-library/react-native';

// The screen tests drive an async render + effect chain (DB load -> layout ->
// state) behind `findBy*`/`waitFor`. RNTL's 1s default for those polls is tight
// on a cold start or under `--coverage` instrumentation, where the first run can
// occasionally trip a spurious timeout. Give the async helpers headroom (still
// well under Jest's 5s test timeout) so a slow machine doesn't fail a passing
// assertion; this only extends how long they wait, never what they accept.
configure({ asyncUtilTimeout: 4000 });
