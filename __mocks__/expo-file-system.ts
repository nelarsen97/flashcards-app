/**
 * Manual mock for `expo-file-system` backed by an in-memory string store, so
 * backup export/restore can be exercised without touching the real filesystem.
 */
const store = new Map<string, string>();

export class File {
  uri: string;

  constructor(base: string | { uri: string }, name?: string) {
    const baseUri = typeof base === 'string' ? base : base.uri;
    this.uri = name ? `${baseUri}/${name}` : baseUri;
  }

  get exists(): boolean {
    return store.has(this.uri);
  }

  create(): void {
    if (!store.has(this.uri)) store.set(this.uri, '');
  }

  write(contents: string): void {
    store.set(this.uri, contents);
  }

  delete(): void {
    store.delete(this.uri);
  }

  async text(): Promise<string> {
    return store.get(this.uri) ?? '';
  }
}

export const Paths = {
  cache: 'file:///cache',
  document: 'file:///document',
};

/** Test helper: wipe the in-memory filesystem. */
export function __reset(): void {
  store.clear();
}
