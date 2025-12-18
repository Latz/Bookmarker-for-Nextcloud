import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' assert { type: 'json' };
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
    }
  };
}

export default defineConfig({
  plugins: [
    crx({ manifest }),
    copyLoginHtmlPlugin()
  ],

  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        // CRXJS auto-discovers from manifest
        // Manually add files not in manifest
        displayJson: 'src/options/displayJson.html',
        login: 'src/login/login.html',
        offscreen: 'src/background/modules/offscreen/offscreen.html'
      }
    }
  },

  resolve: {
    alias: {
      '@': '/src'
    }
  },

  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  }
});
