import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { Application } from '@jobtrack/shared';
import { App } from '../App';

// Sayfalar tembel yüklenir; tüm paketler paralel koşarken ilk içe aktarma 1 saniyeyi aşabiliyor.
configure({ asyncUtilTimeout: 3000 });

export const ME = {
  id: '0199b5a0-0000-7000-8000-000000000001',
  email: 'berra@example.com',
  mfaEnabled: true,
  locale: 'tr' as const,
  csrfToken: 'csrf-123',
};

export type Handler = (init: RequestInit | undefined, url: URL) => Response;
export interface Call {
  key: string;
  url: URL;
  init: RequestInit | undefined;
}

/** "YÖNTEM /yol" anahtarına göre sahte API yanıtları (sorgu dizesi anahtara dahil değil). */
export function mockApi(routes: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  const table = new Map(Object.entries(routes));
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
        'http://localhost',
      );
      const key = `${init?.method ?? 'GET'} ${url.pathname}`;
      calls.push({ key, url, init });
      const handler = table.get(key);
      return Promise.resolve(
        handler
          ? handler(init, url)
          : Response.json({ error: 'Bulunamadı.', traceId: 't' }, { status: 404 }),
      );
    }),
  );
  return calls;
}

export const unauthorized = () =>
  Response.json({ error: 'Oturum açmanız gerekiyor.', traceId: 't' }, { status: 401 });

export function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const body = (call: Call | undefined): unknown => JSON.parse(call?.init?.body as string);

let seq = 0;
export function application(overrides: Partial<Application> = {}): Application {
  seq += 1;
  const id = `0199b5a0-0000-7000-8000-${String(seq).padStart(12, '0')}`;
  return {
    id,
    company: { id: '0199b5a0-0000-7000-9000-000000000001', name: 'Acme' },
    cvVersion: null,
    positionTitle: `Pozisyon ${String(seq)}`,
    jobUrl: null,
    source: null,
    location: null,
    workMode: null,
    salaryExpectation: null,
    currentStage: 'applied',
    appliedAt: '2026-10-01',
    archivedAt: null,
    notes: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    lastActivityAt: '2026-10-01T09:00:00.000Z',
    needsFollowUp: false,
    ...overrides,
  };
}
