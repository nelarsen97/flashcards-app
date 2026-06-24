# Agent notes

**Expo has changed** — read the versioned docs at https://docs.expo.dev/versions/v56.0.0/
before writing code. Add native modules with `npx expo install`, not `npm install`.

## Stack
- Expo SDK 56, React Native, **expo-router** (file-based routes in `src/app`, typed routes on).
- TypeScript `strict`. **React Compiler** is on (`reactCompiler` experiment).
- Local-only **expo-sqlite**; no backend/accounts.
- Import alias: `@/*` → `src/*`, `@/assets/*` → `assets/*`.

## Platforms
**Android + web only — never iOS.** Don't add iOS-only deps or code paths
(e.g. SF Symbols via `expo-symbols`).

## Commands
- `npx expo start` — dev (`a` for Android emulator).
- `npm run lint`, `npx tsc --noEmit` — run both before finishing a change.
- `npm test` — Jest (`jest-expo`). Tests live in `src/**/__tests__`; the data
  layer runs against an in-memory SQLite (`__mocks__/expo-sqlite.ts`). Note
  RNTL v14 `render`/`fireEvent` are async — `await` them.

## Conventions
- Use theme tokens from `src/theme.ts` (`colors`/`spacing`/`radius`); don't hard-code.
- See `README.md` for architecture, the SQLite `due_at` spaced-repetition model, and CSV format.
