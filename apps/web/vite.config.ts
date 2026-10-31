/// <reference types="vitest/config" />
import { defaultClientConditions, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read VITE_* variables from the repository-root .env (only VITE_-prefixed values reach the browser).
  envDir: '../..',
  // Use the shared package's TypeScript source directly (no build step needed for the web app).
  resolve: { conditions: ['source', ...defaultClientConditions] },
  // `vite preview` in the studio container: forward API calls when the port is opened directly
  // (normally the edge proxy does this). Set by deploy/docker-compose.yml.
  preview: process.env.PREVIEW_API_PROXY
    ? {
        proxy: {
          '/api': process.env.PREVIEW_API_PROXY,
          '/files': process.env.PREVIEW_API_PROXY,
        },
      }
    : undefined,
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: library code changes far less often than the app.
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client', 'scheduler'],
          router: ['react-router'],
          data: ['@tanstack/react-query', 'zod', 'react-hook-form', '@hookform/resolvers'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Tests never call a real API unless a test stubs one.
    env: { VITE_API_URL: '' },
  },
});
