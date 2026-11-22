import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const strictProductionCsp = {
  name: 'darkhub-strict-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace("script-src 'self' 'unsafe-inline' 'unsafe-eval';", "script-src 'self';").replace(' ws://localhost:5173', '');
  }
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    strictProductionCsp
  ],
  base: './',
  server: {
    // build outputs and test scratch are not renderer sources: watching them crashes Vite on locked files (EBUSY)
    watch: { ignored: ['**/scratch/**', '**/dist/**', '**/dist_release/**', '**/graphify-out/**', '**/docs/map/**', '**/native_*/target/**', '**/tools/**/target/**'] }
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    env: {
      // Since Electron 42 a plain require('electron') downloads the ~100 MB binary when it is missing. Tests mock
      // the module, but electron-log requires it on its own (CommonJS, not seen by vi.mock) and would start that
      // download in the middle of a run. With this set, Electron's index.js returns a path and downloads nothing.
      ELECTRON_OVERRIDE_DIST_PATH: path.resolve(__dirname, 'node_modules', '.electron-not-needed-for-unit-tests')
    }
  }
});