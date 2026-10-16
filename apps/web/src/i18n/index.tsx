import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  DOMAIN_LABELS,
  LOCALES,
  settingsSchema,
  type DomainLabels,
  type Locale,
  type MeResponse,
} from '@jobtrack/shared';
import type { z } from 'zod';
import { api, ApiError } from '../lib/api';
import { ME_QUERY_KEY, useMe } from '../lib/auth';
import { keys } from '../lib/queries';
import { en, enApiErrors, enStatusError } from './en';
import { tr, type Messages } from './tr';
import { englishIssue } from './validation';

// FR-16: arayüz dili. Girişten önce cihazdaki tercih (localStorage) kullanılır; oturum açıkken
// hesabın dili (users.locale) geçerlidir, böylece tercih cihazlar arasında taşınır.

const MESSAGES: Record<Locale, Messages> = { tr, en };
const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', en: 'en-GB' };
const STORAGE_KEY = 'jobtrack-locale';

function readStoredLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return (LOCALES as readonly string[]).includes(value ?? '')
      ? (value as Locale)
      : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Depolama kapalıysa (gizli pencere) tercih yalnızca bu oturumda geçerlidir.
  }
}

export interface I18n {
  locale: Locale;
  t: Messages;
  labels: DomainLabels;
  /** Dili değiştirir; oturum açıksa hesaba da kaydeder. Kayıt başarısızsa eski dile döner ve hata fırlatır. */
  setLocale: (locale: Locale) => Promise<void>;
  /** "2026-10-06" → "6 Eki 2026" / "6 Oct 2026". */
  formatDate: (isoDate: string | null) => string;
  formatDateTime: (iso: string) => string;
  /** "2026-10-06" → "6 Eki" / "6 Oct". */
  formatShortDate: (isoDate: string) => string;
  /** 0.4 → "%40" / "40%"; null → "—". */
  formatPercent: (value: number | null) => string;
  /** 250_000 → "244 kB"; 2_500_000 → "2,4 MB" / "2.4 MB". */
  formatFileSize: (bytes: number) => string;
  /** Hata nesnesinin bu dildeki metni. */
  errorMessage: (err: unknown) => string;
  /** Zod doğrulama hatasının bu dildeki metni. */
  issueMessage: (issue: z.core.$ZodIssue) => string;
}

const I18nContext = createContext<I18n | null>(null);

function createI18n(locale: Locale, setLocale: I18n['setLocale']): I18n {
  const t = MESSAGES[locale];
  const intl = INTL_LOCALE[locale];
  const date = new Intl.DateTimeFormat(intl, { dateStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeStyle: 'short' });
  const shortDate = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short' });
  const percent = new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 0 });
  const kb = new Intl.NumberFormat(intl, {
    style: 'unit',
    unit: 'kilobyte',
    maximumFractionDigits: 0,
  });
  const mb = new Intl.NumberFormat(intl, {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 1,
  });
  // Takvim tarihi saat dilimi kaymasın diye yerel öğle olarak yorumlanır.
  const calendarDay = (isoDate: string) => new Date(`${isoDate}T12:00:00`);

  return {
    locale,
    t,
    labels: DOMAIN_LABELS[locale],
    setLocale,
    formatDate: (isoDate) => (isoDate ? date.format(calendarDay(isoDate)) : t.common.none),
    formatDateTime: (iso) => dateTime.format(new Date(iso)),
    formatShortDate: (isoDate) => shortDate.format(calendarDay(isoDate)),
    formatPercent: (value) => (value === null ? t.common.none : percent.format(value)),
    formatFileSize: (bytes) =>
      bytes < 1024 * 1024
        ? kb.format(Math.max(1, Math.round(bytes / 1024)))
        : mb.format(bytes / (1024 * 1024)),
    // Türkçe metinler sunucu ve şemalarla ortaktır (kaynak dil); İngilizce koddan çevrilir.
    errorMessage: (err) => {
      if (locale === 'tr') return err instanceof Error ? err.message : t.errors.unexpected;
      if (!(err instanceof ApiError)) return t.errors.unexpected;
      return (err.code && enApiErrors[err.code]) ?? enStatusError(err.status);
    },
    issueMessage: (issue) => (locale === 'tr' ? issue.message : englishIssue(issue)),
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accountLocale = useMe().data?.locale;
  const [locale, setLocaleState] = useState<Locale>(() => accountLocale ?? readStoredLocale());

  // Oturum açılınca (veya başka cihazda değiştirilince) hesabın dili cihazdaki tercihi geçersiz kılar.
  // Effect yerine render sırasında eşitlenir; ara bir render yanlış dilde çizilmez.
  const [syncedAccountLocale, setSyncedAccountLocale] = useState(accountLocale);
  if (accountLocale !== syncedAccountLocale) {
    setSyncedAccountLocale(accountLocale);
    if (accountLocale) setLocaleState(accountLocale);
  }

  useEffect(() => {
    storeLocale(locale);
    // Ekran okuyucular doğru telaffuz için sayfa dilini kullanır (WCAG 3.1.1).
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    async (next: Locale) => {
      const previous = locale;
      setLocaleState(next);
      const current = queryClient.getQueryData<MeResponse | null>(ME_QUERY_KEY);
      if (!current) return;
      try {
        const settings = await api('/settings', {
          method: 'PATCH',
          body: { locale: next },
          schema: settingsSchema,
        });
        queryClient.setQueryData(keys.settings, settings);
        queryClient.setQueryData<MeResponse>(ME_QUERY_KEY, { ...current, locale: next });
      } catch (err) {
        setLocaleState(previous);
        throw err;
      }
    },
    [locale, queryClient],
  );

  const value = useMemo(() => createI18n(locale, setLocale), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n, I18nProvider içinde kullanılmalı.');
  return value;
}
