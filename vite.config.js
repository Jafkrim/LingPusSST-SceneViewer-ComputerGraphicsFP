import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src/root',
  publicDir: '../../public',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src')
    }
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  }
});
