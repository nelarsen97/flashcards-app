/** Manual mock for `expo-speech` — record calls instead of speaking. */
export const speak = jest.fn();
export const stop = jest.fn(async () => undefined);
