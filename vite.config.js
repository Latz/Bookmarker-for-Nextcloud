import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Custom plugin to copy login.html to the correct location after build
function copyLoginHtmlPlugin() {
  return {
    name: 'copy-login-html',
    writeBundle() {
      const srcPath = resolve(__dirname, 'dist/src/login/login.html');
      const destDir = resolve(__dirname, 'dist/login');
      const destPath = resolve(__dirname, 'dist/login/login.html');

      if (existsSync(srcPath)) {
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        copyFileSync(srcPath, destPath);
        console.log('Copied login.html to dist/login/login.html');
      }
    },
  };
}

// The popup's scripts form a chain of imports (popup -> cache -> apiCall ->
// storage). A module script only reveals its imports once it has been fetched
// and parsed, so they load in successive rounds -- about 25 ms on a warm
// start, more on the first open after a browser start (measured in a Chrome
// trace). Listing all of them in popup.html lets Chrome fetch them in
// parallel, right after the HTML is parsed.
//
// Vite's own preload tags are switched off below (modulePreload: false): they
// carry a `crossorigin` attribute, which never matches the extension-page
// fetches and only adds console warnings. These are plain tags without it.
function popupModulePreloadPlugin() {
  return {
    name: 'popup-module-preload',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !ctx.chunk || !/popup[\\/]popup\.html$/.test(ctx.filename ?? '')) {
          return undefined;
        }
        const files = new Set();
        const collect = (fileName) => {
          const chunk = ctx.bundle[fileName];
          if (chunk?.type !== 'chunk') return;
          for (const imported of chunk.imports) {
            if (files.has(imported)) continue;
            files.add(imported);
            collect(imported);
          }
        };
        collect(ctx.chunk.fileName);
        return [...files].map((file) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', href: `/${file}` },
          injectTo: 'head',
        }));
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest }), copyLoginHtmlPlugin(), popupModulePreloadPlugin()],

  build: {
    outDir: 'dist',
    // No maps in a release build: `vite build` defaults to production mode,
    // while `build:dev` passes --mode development and keeps them.
    sourcemap: mode !== 'production',
    minify: true,
    target: 'esnext',
    // Vite's <link rel="modulepreload" crossorigin> tags never match the
    // extension-page fetches (Chrome: "cross-world extension resource
    // mismatch") and only add console warnings; the files are local anyway.
    modulePreload: false,
    rollupOptions: {
      input: {
        // CRXJS auto-discovers from manifest
        // Manually add files not in manifest
        displayJson: 'src/options/displayJson.html',
        login: 'src/login/login.html',
        offscreen: 'src/background/modules/browser/offscreen/offscreen.html',
      },
    },
  },

  resolve: {
    alias: {
      '@': '/src',
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
}));
