import os from 'node:os'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import browserslistToEsbuild from 'browserslist-to-esbuild'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

// Same policy as api/deploy/htaccess, so `bun run build && bun run preview` shows violations.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export default defineConfig({
  base: '/',
  plugins: [viteReact({ compiler: true }), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    target: browserslistToEsbuild(),
  },
  preview: {
    proxy: { '/api': 'http://localhost:8787' },
    headers: { 'Content-Security-Policy': contentSecurityPolicy },
  },
  server: {
    port: 5180,
    // Local PHP API (see api/README.md, "Local development").
    proxy: { '/api': 'http://localhost:8787' },
    fs: {
      allow: [
        searchForWorkspaceRoot(import.meta.dirname),
        path.join(os.homedir(), '.bun/install/cache/links'),
      ],
    },
  },
})
