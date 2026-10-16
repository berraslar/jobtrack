import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { conditions: ['development'] },
  server: {
    // Geliştirmede de same-origin: /api istekleri yerel API'ye yönlenir, CORS açılmaz.
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    // Sıkı CSP (inline script yok) ile uyum için küçük varlıklar da ayrı dosya olarak kalır.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  test: {
    environment: 'happy-dom',
  },
});
