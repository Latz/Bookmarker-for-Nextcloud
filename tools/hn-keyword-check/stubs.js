// Redirects the extension's IndexedDB/chrome-backed modules to in-memory
// stubs so the keyword/description pipeline can run under plain Node.
// Must be imported before any extension module is loaded.
import { registerHooks } from 'node:module';

const STUBS = {
  '/src/lib/storage.js': new URL('./stub-storage.js', import.meta.url).href,
  '/src/lib/cache.js': new URL('./stub-cache.js', import.meta.url).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    for (const [suffix, stubUrl] of Object.entries(STUBS)) {
      if (resolved.url.endsWith(suffix)) {
        return { url: stubUrl, shortCircuit: true };
      }
    }
    return resolved;
  },
});
