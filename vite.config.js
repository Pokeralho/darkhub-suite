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
  }
});