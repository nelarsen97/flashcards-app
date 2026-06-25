// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite's web build (wa-sqlite) imports its WebAssembly binary as an asset
// (`import wasmModule from './wa-sqlite/wa-sqlite.wasm'`). Metro doesn't treat
// `.wasm` as a resolvable asset by default, which is what causes
// `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm`.
config.resolver.assetExts.push('wasm');

// wa-sqlite runs in a Web Worker backed by SharedArrayBuffer, which the browser
// only exposes to cross-origin-isolated pages. Without these headers the dev
// server bundles fine but SQLite fails at runtime. Production hosting must send
// the same two headers.
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return middleware(req, res, next);
  },
};

module.exports = config;
