import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

// @multioutils/shared est du TypeScript source (workspace) : on le laisse être
// bundlé plutôt qu'externalisé, sinon Electron tenterait de le require() tel quel.
const external = externalizeDepsPlugin({ exclude: ['@multioutils/shared'] });

export default defineConfig({
  main: {
    plugins: [external]
  },
  preload: {
    plugins: [external]
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
});
