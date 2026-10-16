import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { LanguageSelect } from '../components/LanguageSelect';
import { Aurora, Button, FOCUS_RING, Wordmark } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useMe, useSignedOut } from '../lib/auth';
import { applyTheme, readTheme, type ThemeChoice } from '../lib/theme';

// Kabuk: masaüstünde ışık lekelerinin üstünde yüzen beyaz bir kenar çubuğu, mobilde üstte aynı
// yaprak ve yatay kayan menü. Etkin menü hapı sayfa geçişinde yeni öğeye kayar (View Transitions).
const navClass = ({ isActive }: { isActive: boolean }) =>
  `relative isolate flex min-h-10 shrink-0 items-center gap-3 rounded-full px-3.5 text-sm transition-colors duration-200 ${FOCUS_RING} ${
    isActive
      ? 'font-bold text-ink'
      : 'font-medium text-ink-muted hover:bg-surface-muted hover:text-ink'
  }`;

const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];

const SELECT = `min-h-10 w-auto rounded-full border border-line-strong bg-surface px-3 text-sm text-ink ${FOCUS_RING}`;

export function AppLayout() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const signOut = useSignedOut();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);

  const logout = async () => {
    setPending(true);
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      await signOut();
      setPending(false);
      void navigate('/giris');
    }
  };

  const links: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
    { to: '/', label: t.nav.applications, icon: <Icon d={ICONS.list} />, end: true },
    { to: '/pano', label: t.nav.dashboard, icon: <Icon d={ICONS.chart} /> },
    { to: '/sirketler', label: t.nav.companies, icon: <Icon d={ICONS.building} /> },
    { to: '/cv', label: t.nav.cvs, icon: <Icon d={ICONS.file} /> },
    { to: '/cv-duzenle', label: t.nav.cvTailor, icon: <Icon d={ICONS.wand} /> },
    { to: '/profil', label: t.nav.profile, icon: <Icon d={ICONS.user} /> },
    { to: '/ayarlar', label: t.nav.settings, icon: <Icon d={ICONS.cog} /> },
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Aurora />
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        {t.nav.skipToContent}
      </a>
      <header className="p-3 sm:p-4 lg:sticky lg:top-0 lg:h-screen lg:pr-0">
        <div className="flex h-full flex-col rounded-xl bg-surface/90 shadow-sheet ring-1 ring-line/70">
          <Wordmark className="px-5 pt-5 lg:px-6 lg:pt-7" />
          <nav
            aria-label={t.nav.mainMenu}
            className="flex flex-wrap gap-1 px-3 py-3 lg:mt-8 lg:flex-col lg:flex-nowrap lg:px-4"
          >
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end ?? false}
                viewTransition
                className={navClass}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="vt-nav-pill absolute inset-0 -z-10 rounded-full bg-lilac shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-lilac-solid)_25%,transparent)]"
                      />
                    )}
                    <span className={isActive ? 'text-lilac-solid' : ''}>{link.icon}</span>
                    {link.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          {/* Tek kopya: mobilde menünün altında bir satır, masaüstünde kenar çubuğunun dibinde. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 px-4 pb-4 lg:mt-auto lg:flex-col lg:flex-nowrap lg:items-stretch lg:px-5 lg:pb-6 lg:[&_select]:w-full lg:[&_select]:min-w-0">
            {me?.email && (
              <span className="mb-1 hidden min-w-0 items-center gap-2 lg:flex" title={me.email}>
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-peach font-display text-sm font-bold text-ink uppercase"
                >
                  {me.email.charAt(0)}
                </span>
                <span className="min-w-0 truncate text-xs text-ink-muted">{me.email}</span>
              </span>
            )}
            <LanguageSelect />
            <label htmlFor="theme" className="sr-only">
              {t.theme.label}
            </label>
            <select
              id="theme"
              value={theme}
              onChange={(event) => {
                const choice = event.target.value as ThemeChoice;
                setTheme(choice);
                applyTheme(choice);
              }}
              className={SELECT}
            >
              {THEME_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {t.theme.option(t.theme.names[choice])}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              onClick={() => void logout()}
              disabled={pending}
              className="ml-auto lg:ml-0"
            >
              {t.nav.logout}
            </Button>
          </div>
        </div>
      </header>
      <main
        id="icerik"
        className="min-w-0 px-3 pt-4 pb-12 sm:px-6 lg:min-h-screen lg:px-10 lg:pt-10"
      >
        <div className="vt-page mx-auto max-w-[72rem]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

const ICONS = {
  list: 'M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  building:
    'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M3 21l12-12M17.5 13.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-[1.125rem] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
