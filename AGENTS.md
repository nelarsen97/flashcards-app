# Agent notes

**Expo has changed** — read the versioned docs at https://docs.expo.dev/versions/v56.0.0/
before writing code. Add native modules with `npx expo install` (Expo detects Bun
and installs via it), not `bun add` / `npm install`.

**Bun is the package manager** (not npm). Use `bun install` and run scripts with
`bun run <script>`. New native install scripts must be allowlisted in
`trustedDependencies` in `package.json` (that's why `better-sqlite3` is listed).

## Stack
- Expo SDK 56, React Native, **expo-router** (file-based routes in `src/app`, typed routes on).
- TypeScript `strict`. **React Compiler** is on (`reactCompiler` experiment).
- Local-only **expo-sqlite**; no backend/accounts.
- Import alias: `@/*` → `src/*`, `@/assets/*` → `assets/*`.

## Platforms
**Android + web only — never iOS.** Don't add iOS-only deps or code paths
(e.g. SF Symbols via `expo-symbols`).

## Commands
- `bun run start` (or `npx expo start`) — dev (`a` for Android emulator).
- `bun run lint`, `bunx tsc --noEmit` — run both before finishing a change.
- `bun run test` — Jest (`jest-expo`). **Use `bun run test`, NOT `bun test`** —
  the latter invokes Bun's own runner, which can't parse React Native's source or
  the `jest-expo` preset. Tests live in `src/**/__tests__`; the data layer runs
  against an in-memory SQLite (`__mocks__/expo-sqlite.ts`). Note RNTL v14
  `render`/`fireEvent` are async — `await` them.

## Conventions
- Use theme tokens from `src/theme.ts` (`colors`/`spacing`/`radius`); don't hard-code.
- See `README.md` for architecture, the SQLite `familiarity` + `due_at` Leitner
  spaced-repetition model (`nextReview` in `src/db/cards.ts`), and CSV format.
