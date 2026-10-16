import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Alert } from './components/ui';
import { I18nProvider, useI18n } from './i18n';
import { useMe, useWasSignedOut } from './lib/auth';
import { AppLayout } from './pages/AppLayout';
import { LoginPage } from './pages/LoginPage';

// NFR-05: giriş sayfası dışındaki sayfalar ayrı paketlere bölünür; ilk yükleme küçük kalır.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(async () => ({ default: (await load())[name] }));

const LandingPage = named(() => import('./pages/LandingPage'), 'LandingPage');
const RegisterPage = named(() => import('./pages/RegisterPage'), 'RegisterPage');
const ApplicationsPage = named(
  () => import('./pages/applications/ApplicationsPage'),
  'ApplicationsPage',
);
const NewApplicationPage = named(
  () => import('./pages/applications/NewApplicationPage'),
  'NewApplicationPage',
);
const ApplicationDetailPage = named(
  () => import('./pages/applications/ApplicationDetailPage'),
  'ApplicationDetailPage',
);
const CvTailorPage = named(() => import('./pages/cv-tailor/CvTailorPage'), 'CvTailorPage');
const CompaniesPage = named(() => import('./pages/companies/CompaniesPage'), 'CompaniesPage');
const CompanyDetailPage = named(
  () => import('./pages/companies/CompanyDetailPage'),
  'CompanyDetailPage',
);
const CvVersionsPage = named(() => import('./pages/cv/CvVersionsPage'), 'CvVersionsPage');
const ProfilePage = named(() => import('./pages/profile/ProfilePage'), 'ProfilePage');
const SettingsPage = named(() => import('./pages/settings/SettingsPage'), 'SettingsPage');
const DashboardPage = named(() => import('./pages/dashboard/DashboardPage'), 'DashboardPage');

function Loading() {
  const { t } = useI18n();
  return (
    <p role="status" className="p-8 text-center text-ink-muted">
      {t.common.loading}
    </p>
  );
}

/** Oturum durumuna göre yönlendirir: korumalı sayfalar girişe, giriş sayfaları ana sayfaya. */
/**
 * Girişten sonra dönülecek adres. Yalnızca uygulama içi göreli yol kabul edilir: `/` ile başlamalı,
 * `//` ya da `/\` ile başlamamalı (başka bir siteye açık yönlendirmeye karşı).
 */
export function returnPath(state: unknown): string {
  const from =
    typeof state === 'object' && state !== null && 'from' in state ? state.from : undefined;
  if (typeof from !== 'string' || !from.startsWith('/') || /^\/[/\\]/.test(from)) return '/';
  return from;
}

function Gate({ requireAuth, children }: { requireAuth: boolean; children: ReactNode }) {
  const me = useMe();
  const signedOut = useWasSignedOut();
  const { errorMessage } = useI18n();
  const location = useLocation();
  const { pathname, search, hash } = location;
  const state: unknown = location.state;
  const loading = <Loading />;
  if (me.isPending) return loading;
  if (me.isError) {
    return (
      <div className="mx-auto max-w-md p-8">
        <Alert>{errorMessage(me.error)}</Alert>
      </div>
    );
  }
  if (requireAuth && !me.data) {
    // Oturumsuz ziyaretçi ana adreste tanıtım sayfasını görür; diğer korumalı adresler girişe gider.
    if (pathname === '/') {
      return (
        <Suspense fallback={loading}>
          <LandingPage />
        </Suspense>
      );
    }
    // Girişten sonra aynı adrese dönülür (örn. yer imi betiğinin açtığı önceden dolu form, ADR-0009).
    // Adres parçası (#ilan=, ilan metni) da korunur; yalnızca tarayıcı geçmişinin durumunda
    // tutulur, sunucuya gitmez. Bilinçli çıkıştan sonra dönüş adresi tutulmaz.
    return (
      <Navigate
        to="/giris"
        replace
        state={signedOut ? undefined : { from: `${pathname}${search}${hash}` }}
      />
    );
  }
  if (!requireAuth && me.data) return <Navigate to={returnPath(state)} replace />;
  return <Suspense fallback={loading}>{children}</Suspense>;
}

export function App() {
  return (
    <I18nProvider>
      <AppRoutes />
    </I18nProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/giris"
        element={
          <Gate requireAuth={false}>
            <LoginPage />
          </Gate>
        }
      />
      <Route
        path="/kayit"
        element={
          <Gate requireAuth={false}>
            <RegisterPage />
          </Gate>
        }
      />
      <Route
        element={
          <Gate requireAuth>
            <AppLayout />
          </Gate>
        }
      >
        <Route index element={<ApplicationsPage />} />
        <Route path="basvurular/yeni" element={<NewApplicationPage />} />
        <Route path="basvurular/:id" element={<ApplicationDetailPage />} />
        <Route path="sirketler" element={<CompaniesPage />} />
        <Route path="sirketler/:id" element={<CompanyDetailPage />} />
        <Route path="cv" element={<CvVersionsPage />} />
        <Route path="cv-duzenle" element={<CvTailorPage />} />
        <Route path="profil" element={<ProfilePage />} />
        <Route path="pano" element={<DashboardPage />} />
        <Route path="ayarlar" element={<SettingsPage />} />
        <Route path="ayarlar/guvenlik" element={<Navigate to="/ayarlar" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
