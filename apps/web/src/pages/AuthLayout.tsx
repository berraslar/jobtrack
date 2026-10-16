import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LanguageSelect } from '../components/LanguageSelect';
import { Aurora, FOCUS_RING, SHEET, Wordmark } from '../components/ui';

/** Giriş ve kayıt: ışık lekelerinin üstünde tek bir beyaz yaprak; ad ve dil seçimi yaprağın üstünde. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-10 sm:items-center">
      <Aurora />
      <div className="w-full max-w-[27rem]">
        <div className="mb-5 flex items-center justify-between gap-2">
          <p>
            <Link to="/" className={`rounded-md ${FOCUS_RING}`}>
              <Wordmark />
            </Link>
          </p>
          <LanguageSelect />
        </div>
        <div className={`${SHEET} rise px-6 pt-8 pb-9 sm:px-9`}>{children}</div>
      </div>
    </main>
  );
}
