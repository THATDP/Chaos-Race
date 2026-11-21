import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, '../shared'),
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    fs: { allow: ['..'] },
    // O frontend e o Socket.IO ficam na mesma origem em desenvolvimento.
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true, changeOrigin: true },
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 2500,
    sourcemap: false,
  },
});
