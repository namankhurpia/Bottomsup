import { defineConfig } from 'vite';

// In development run the game server too (npm start, port 8080); Vite forwards to it.
export default defineConfig({
  build: { target: 'esnext' },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/api': 'http://localhost:8080',
    },
  },
});
