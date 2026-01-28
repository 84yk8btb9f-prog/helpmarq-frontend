// frontend/vite.config.js - WITH PROXY

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8080,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          console.log('Proxying:', path);
          return path;
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});