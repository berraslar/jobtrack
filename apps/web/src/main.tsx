import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './index.css';
import { applyTheme, readTheme } from './lib/theme';
import { reportWebVitals } from './lib/vitals';

// İlk boyamadan önce kayıtlı tema uygulanır (CSP inline script'e izin vermez; bu dosya ilk çalışan koddur).
applyTheme(readTheme());

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root bulunamadı');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

if (import.meta.env.PROD) reportWebVitals();
