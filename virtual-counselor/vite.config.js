import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3007,
    proxy: {
      '/api': {
        target: process.env.REACT_APP_API_URL || 'http://localhost:3008',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'build',
    sourcemap: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
    // Exclude Playwright e2e specs — those run via `npx playwright test`, not vitest
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
  }
})
