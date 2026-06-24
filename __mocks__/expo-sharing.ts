/** Manual mock for `expo-sharing` — no real OS share sheet in tests. */
export const isAvailableAsync = jest.fn(async () => true);
export const shareAsync = jest.fn(async () => undefined);
