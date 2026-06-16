import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from https://sklon66.github.io/cable_manager/ on GitHub Pages
  base: '/cable_manager/',
  plugins: [react()],
});
