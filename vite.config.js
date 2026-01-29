import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 8080,
    open: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        signup: resolve(__dirname, 'signup.html'),
        'verify-otp': resolve(__dirname, 'verify-otp.html'),
        'role-select': resolve(__dirname, 'role-select.html'),
        'create-reviewer': resolve(__dirname, 'create-reviewer.html'),
        'owner-profile': resolve(__dirname, 'owner-profile.html'),
        'reviewer-profile': resolve(__dirname, 'reviewer-profile.html'),
        'stats': resolve(__dirname, 'stats.html')
      }
    }
  }
});