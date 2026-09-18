import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @vitejs/plugin-react was already a dependency but was never wired up, which
// meant no React Fast Refresh in development. Vite's root is this directory, so
// `public/assets/*` is still served at `/assets/*` and the `/src/main.jsx`
// reference in index.html resolves exactly as it did before the monorepo move.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
