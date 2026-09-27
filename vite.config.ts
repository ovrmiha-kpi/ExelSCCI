import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base so the build works both locally and on GitHub Pages
  // (https://<user>.github.io/<repo>/) without extra configuration.
  base: './',
})
