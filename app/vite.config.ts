import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('react-markdown') ||
            id.includes('remark-gfm') ||
            id.includes('/remark-') ||
            id.includes('/rehype-') ||
            id.includes('/unified/') ||
            id.includes('/mdast-') ||
            id.includes('/micromark') ||
            id.includes('/hast-') ||
            id.includes('/unist-')
          ) {
            return 'markdown';
          }

          if (id.includes('react-qr-code')) {
            return 'qr';
          }

          if (id.includes('lucide-react')) {
            return 'icons';
          }

          if (id.includes('motion')) {
            return 'motion';
          }

          if (
            id.includes('/react/') ||
            id.includes('react-dom') ||
            id.includes('scheduler')
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
});
