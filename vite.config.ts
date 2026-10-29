import os from 'node:os'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import browserslistToEsbuild from 'browserslist-to-esbuild'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

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
  server: {
    port: 5180,
    fs: {
      allow: [
        searchForWorkspaceRoot(import.meta.dirname),
        path.join(os.homedir(), '.bun/install/cache/links'),
      ],
    },
  },
})
