import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: {
    environment: 'node',
    // Entegrasyon testleri gerçek PostgreSQL konteyneri başlatır (Testcontainers).
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
