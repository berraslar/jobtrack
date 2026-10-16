import type { Metric } from 'web-vitals';

/** "/basvurular/0199…" → "/basvurular/:id". Ölçüme kişisel veya tanımlayıcı bilgi girmez. */
export function routePattern(pathname: string): string {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .toLowerCase()
    .replace(/[^a-z0-9/:_-]/g, '')
    .slice(0, 100);
}

function send(metric: Metric): void {
  const body = JSON.stringify({
    name: metric.name,
    value: Math.max(0, metric.value),
    rating: metric.rating,
    route: routePattern(window.location.pathname) || '/',
  });
  // keepalive: sayfa kapanırken de gönderilir. Aynı köken; Origin başlığı sunucuda doğrulanır.
  void fetch('/api/vitals', {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body,
  }).catch(() => undefined);
}

/** NFR-03: gerçek kullanıcı Core Web Vitals (LCP, INP, CLS). Kütüphane ayrı pakette, sonradan yüklenir. */
export function reportWebVitals(): void {
  void import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
    onCLS(send);
    onINP(send);
    onLCP(send);
    onFCP(send);
    onTTFB(send);
  });
}
