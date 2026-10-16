// NFR-03 (laboratuvar ölçümü): Lighthouse CI. Yalıtılmış test ortamına karşı çalışır:
//   ./scripts/with-test-stack.sh npx --yes @lhci/cli@0.15.1 autorun --config=lighthouserc.cjs
// Not: Laboratuvar ortamında INP ölçülemez; yerine Total Blocking Time (TBT) bütçesi kullanılır.
// Gerçek kullanıcı INP ölçümü Faz 4'te web-vitals ile yapılacak.
const base = process.env.E2E_BASE_URL ?? 'http://localhost:8081';

module.exports = {
  ci: {
    collect: {
      url: [`${base}/giris`, `${base}/kayit`],
      numberOfRuns: 3,
      settings: { preset: 'desktop', chromeFlags: '--headless=new --no-sandbox' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
      },
    },
    // Rapor yalnızca yerel dosyaya yazılır; üçüncü taraf sunucuya yüklenmez (NFR-14).
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
};
