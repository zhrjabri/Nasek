import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path — GitHub Pages
  // serves the site from /<repo-name>/, where absolute /assets/... 404s.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        /*
         * Name split chunks by hash only. Rollup's default names them after
         * the module they came from, which would publish "AdminAccessPage"
         * and "AdminDashboardPage" as filenames on a public host — telling
         * anyone who looks that an administration area exists, and undoing
         * the point of hashing its address.
         */
        chunkFileNames: 'assets/[hash].js',
      },
    },
  },
  server: { port: 5173, open: false },
})
