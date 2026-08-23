import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  server: {
    port: 3000
  },
  build: {
    outDir: '../dist'
  }
});