import { useState } from 'react';
import { LOCALES, type Locale } from '@jobtrack/shared';
import { useI18n } from '../i18n';
import { FOCUS_RING } from './ui';

/** FR-16: dil seçimi. Seçenek adları her zaman kendi dilinde gösterilir. */
export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <label htmlFor="language" className="sr-only">
        {t.language.label}
      </label>
      <select
        id="language"
        value={locale}
        onChange={(event) => {
          setFailed(false);
          setLocale(event.target.value as Locale).catch(() => {
            setFailed(true);
          });
        }}
        className={`min-h-10 rounded-full border border-line-strong bg-surface px-3 text-sm text-ink ${FOCUS_RING}`}
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {t.language.names[option]}
          </option>
        ))}
      </select>
      {failed && (
        <span role="alert" className="text-xs text-danger">
          {t.language.saveFailed}
        </span>
      )}
    </>
  );
}
