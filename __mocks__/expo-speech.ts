/** Manual mock for `expo-speech` — record calls instead of speaking. */
export const speak = jest.fn();
export const stop = jest.fn(async () => undefined);
// Defaults to an empty list ("voices unknown"); tests override per-case.
export const getAvailableVoicesAsync = jest.fn(async () => [] as any[]);
