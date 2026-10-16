import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  mfaEnableResponseSchema,
  mfaSetupResponseSchema,
  sessionsResponseSchema,
  settingsUpdateSchema,
  type MfaEnableRequest,
  type MfaSetupResponse,
} from '@jobtrack/shared';
import { Alert, Button, Card, Field, FOCUS_RING, PageHeader } from '../../components/ui';
import { BOOKMARKLET_ORIGIN_PLACEHOLDER, BOOKMARKLET_TEMPLATE } from '../../generated/bookmarklet';
import { useI18n } from '../../i18n';
import { api, formText } from '../../lib/api';
import { useMe, useRefreshMe, useSignedOut } from '../../lib/auth';
import { useSettings, useUpdateSettings } from '../../lib/queries';

export function SettingsPage() {
  const { t } = useI18n();
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={t.settings.title} />
      <FollowUpCard />
      <BookmarkletCard />
      <MfaCard />
      <SessionsCard />
      <DataCard />
      <DeleteAccountCard />
    </div>
  );
}

/** Yer imi adresi: küçültülmüş betik, uygulamanın kökeniyle (ADR-0009). */
const bookmarkletHref = () =>
  BOOKMARKLET_TEMPLATE.replaceAll(
    BOOKMARKLET_ORIGIN_PLACEHOLDER,
    encodeURIComponent(window.location.origin),
  );

/**
 * FR-22: sürüklenerek kurulan "JobTrack'e kaydet" yer imi. React `javascript:` adreslerini prop
 * olarak engellediği için adres bileşen bağlandıktan sonra DOM üzerinden atanır. Bu sayfada
 * tıklanınca çalışmaz (CSP de engeller); sürüklenemeyenler için kodu kopyalama yolu vardır
 * (WCAG 2.5.7).
 */
function BookmarkletCard() {
  const { t } = useI18n();
  const b = t.settings.bookmarklet;
  const link = useRef<HTMLAnchorElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    link.current?.setAttribute('href', bookmarkletHref());
  }, []);
  return (
    <Card title={b.card}>
      <p className="mb-5 max-w-[60ch] text-sm text-ink-muted">{b.intro}</p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          ref={link}
          draggable
          title={b.dragOnly}
          onClick={(event) => {
            event.preventDefault();
            setNotice(b.dragOnly);
          }}
          className={`inline-flex min-h-10 cursor-grab items-center gap-2 rounded-full border-2 border-dashed border-lilac-solid bg-lilac px-5 text-sm font-bold text-ink active:cursor-grabbing ${FOCUS_RING}`}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
          >
            <path d="M4 2.5h8v11l-4-3-4 3z" />
          </svg>
          {b.link}
        </a>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(bookmarkletHref()).then(() => {
              setNotice(b.copied);
            });
          }}
        >
          {b.copy}
        </Button>
      </div>
      <p className="mt-4 text-xs text-ink-muted">{b.alternative}</p>
      <p className="mt-1 text-xs text-ink-muted">{b.privacy}</p>
      <p role="status" className="mt-3 text-sm font-medium text-ink empty:hidden">
        {notice}
      </p>
    </Card>
  );
}

/** FR-11: kaç gün dönüş gelmezse "Takip et" işareti çıkacağı. */
function FollowUpCard() {
  const { t, errorMessage, issueMessage } = useI18n();
  const s = t.settings.followUp;
  const settings = useSettings();
  const update = useUpdateSettings();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Card title={s.card}>
      {settings.data && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = settingsUpdateSchema.safeParse({
              followUpDays: formText(event.currentTarget, 'followUpDays'),
            });
            setSaved(false);
            if (!parsed.success) {
              const issue = parsed.error.issues[0];
              setError(issue ? issueMessage(issue) : t.common.invalidValue);
              return;
            }
            setError(null);
            update.mutate(parsed.data, {
              onSuccess: () => {
                setSaved(true);
              },
            });
          }}
        >
          <div className="max-w-xs">
            <Field
              label={s.days}
              name="followUpDays"
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              defaultValue={settings.data.followUpDays}
              hint={s.hint}
              error={error ?? (update.isError ? errorMessage(update.error) : undefined)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={update.isPending}>
              {t.common.save}
            </Button>
            {saved && (
              <span role="status" className="text-sm text-success">
                {t.common.saved}
              </span>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

function MfaCard() {
  const { t, errorMessage } = useI18n();
  const m = t.settings.mfa;
  const { data: me } = useMe();
  const refreshMe = useRefreshMe();
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => api('/auth/mfa/setup', { method: 'POST', schema: mfaSetupResponseSchema }),
    onSuccess: (data) => {
      setSetup(data);
      setError(null);
    },
    onError: (err) => {
      setError(errorMessage(err));
    },
  });

  const enable = useMutation({
    mutationFn: (body: MfaEnableRequest) =>
      api('/auth/mfa/enable', { method: 'POST', body, schema: mfaEnableResponseSchema }),
    onSuccess: async (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      setError(null);
      await refreshMe();
    },
    onError: (err) => {
      setError(errorMessage(err));
    },
  });

  if (recoveryCodes) {
    return (
      <Card title={m.recoveryCard}>
        <Alert tone="success">{m.enabled}</Alert>
        <p className="my-4 text-sm text-ink-muted">
          {m.recoveryIntro}
          <strong className="text-ink">{m.recoveryOnce}</strong>
          {m.recoveryStore}
        </p>
        <ul className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-butter p-4 font-mono text-sm">
          {recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => void navigator.clipboard.writeText(recoveryCodes.join('\n'))}
          >
            {m.copy}
          </Button>
          <Button
            onClick={() => {
              setRecoveryCodes(null);
            }}
          >
            {m.done}
          </Button>
        </div>
      </Card>
    );
  }

  if (me?.mfaEnabled) {
    return (
      <Card title={m.card}>
        <Alert tone="success">{m.on}</Alert>
      </Card>
    );
  }

  if (setup) {
    const secret = new URL(setup.otpauthUri).searchParams.get('secret') ?? '';
    const submit = (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      enable.mutate({
        code: formText(event.currentTarget, 'code'),
        password: formText(event.currentTarget, 'password'),
      });
    };
    return (
      <Card title={m.setupCard}>
        <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-ink-muted">
          {m.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row">
          <img
            src={setup.qrDataUrl}
            alt={m.qrAlt}
            width={180}
            height={180}
            className="rounded-lg border border-line bg-white p-2 shadow-soft"
          />
          <div className="text-sm">
            <p className="mb-1 text-ink-muted">{m.manualKey}</p>
            <code className="break-all rounded-md bg-surface-muted px-2 py-1 font-mono">
              {secret}
            </code>
          </div>
        </div>
        <form className="flex max-w-xs flex-col gap-4" onSubmit={submit}>
          {error && <Alert>{error}</Alert>}
          <Field
            label={m.code}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
          />
          <Field
            label={m.currentPassword}
            name="password"
            type="password"
            autoComplete="current-password"
            hint={m.passwordHint}
            required
          />
          <Button type="submit" disabled={enable.isPending}>
            {enable.isPending ? m.enabling : m.enable}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card title={m.card}>
      <p className="mb-4 text-sm text-ink-muted">{m.intro}</p>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <Button
        onClick={() => {
          start.mutate();
        }}
        disabled={start.isPending}
      >
        {start.isPending ? m.starting : m.start}
      </Button>
    </Card>
  );
}

function SessionsCard() {
  const { t, formatDateTime, errorMessage } = useI18n();
  const s = t.settings.sessions;
  const signOut = useSignedOut();
  const navigate = useNavigate();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api('/auth/sessions', { schema: sessionsResponseSchema }),
  });
  const logoutAll = useMutation({
    mutationFn: () => api('/auth/sessions', { method: 'DELETE' }),
    onSettled: async () => {
      await signOut();
      void navigate('/giris');
    },
  });

  return (
    <Card title={s.card}>
      {sessions.isPending && <p className="text-sm text-ink-muted">{t.common.loading}</p>}
      {sessions.isError && <Alert>{errorMessage(sessions.error)}</Alert>}
      {sessions.data && (
        <ul className="mb-4 divide-y divide-line">
          {sessions.data.sessions.map((session) => (
            <li key={session.id} className="flex flex-col gap-1 py-3 text-sm">
              <span className="font-medium text-ink">
                {describeAgent(session.userAgent, s)}
                {session.current && (
                  <span className="ml-2 inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                    <span aria-hidden className="size-1.5 bg-success" />
                    {s.thisDevice}
                  </span>
                )}
              </span>
              <span className="text-ink-muted">
                {s.times(formatDateTime(session.lastSeenAt), formatDateTime(session.createdAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="danger-quiet"
        onClick={() => {
          logoutAll.mutate();
        }}
        disabled={logoutAll.isPending}
      >
        {s.logoutAll}
      </Button>
      <p className="mt-2 text-xs text-ink-muted">{s.logoutAllHint}</p>
    </Card>
  );
}

function describeAgent(
  userAgent: string | null,
  text: { unknownDevice: string; browser: string },
): string {
  if (!userAgent) return text.unknownDevice;
  const browser = /Firefox\//.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : text.browser;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

/** FR-14 (KVKK veri taşınabilirliği) ve FR-17 (takvim). İndirmeler oturum çereziyle yapılır. */
function DataCard() {
  const { t } = useI18n();
  const d = t.settings.data;
  const link = `inline-flex min-h-10 items-center rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink/40 hover:bg-surface-muted ${FOCUS_RING}`;
  return (
    <Card title={d.card}>
      <p className="mb-4 text-sm text-ink-muted">{d.intro}</p>
      <div className="flex flex-wrap gap-2">
        <a href="/api/account/export?format=json" download className={link}>
          {d.json}
        </a>
        <a href="/api/account/export?format=csv" download className={link}>
          {d.csv}
        </a>
        <a href="/api/account/calendar.ics" download className={link}>
          {d.ics}
        </a>
      </div>
    </Card>
  );
}

/**
 * FR-14: hesabı kalıcı olarak silme. Parola, MFA kodu ve onay kelimesi (Türkçe "SİL", İngilizce
 * "DELETE") istenir. Onay kelimesi istemcide denetlenir; API'ye her dilde "SİL" gönderilir.
 */
function DeleteAccountCard() {
  const { t, locale, errorMessage } = useI18n();
  const d = t.settings.deleteAccount;
  const { data: me } = useMe();
  const signOut = useSignedOut();
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  // ADR-0007: son onay adımı olarak e-postaya 2 dakika geçerli kod gider.
  const sendCode = useMutation({
    mutationFn: () => api('/account/deletion-code', { method: 'POST' }),
    onSuccess: () => {
      setCodeSent(true);
      setError(null);
    },
    onError: (err) => {
      setError(errorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: (body: Record<string, string>) => api('/account', { method: 'DELETE', body }),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err) => {
      setError(errorMessage(err));
    },
  });

  return (
    <Card title={d.card}>
      <p className="mb-2 text-sm text-ink-muted">
        {d.introBefore}
        <strong className="text-ink">{d.introStrong}</strong>
        {d.introAfter}
      </p>
      <p className="mb-4 text-sm text-ink-muted">{d.backups}</p>
      <form
        noValidate
        className="flex max-w-sm flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const confirm = formText(form, 'confirm').trim();
          if (confirm.toLocaleUpperCase(locale) !== d.confirmWord) {
            setError(d.confirmMissing);
            return;
          }
          const emailCode = formText(form, 'emailCode').trim();
          if (!codeSent || !emailCode) {
            setError(d.needCode);
            return;
          }
          setError(null);
          const code = formText(form, 'code').trim();
          remove.mutate({
            password: formText(form, 'password'),
            confirm: 'SİL',
            emailCode,
            ...(me?.mfaEnabled && code ? { code } : {}),
          });
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field
          label={d.password}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {me?.mfaEnabled && (
          <Field
            label={d.code}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
        )}
        <div className="flex flex-col gap-2">
          <div>
            <Button
              variant="secondary"
              disabled={sendCode.isPending}
              onClick={() => {
                sendCode.mutate();
              }}
            >
              {codeSent ? d.resendCode : d.sendCode}
            </Button>
          </div>
          {codeSent && (
            <Field
              label={d.emailCode}
              name="emailCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              hint={d.codeSent}
            />
          )}
        </div>
        <Field label={d.confirmLabel} name="confirm" autoComplete="off" required />
        <div>
          <Button type="submit" variant="danger" disabled={remove.isPending}>
            {remove.isPending ? d.submitting : d.submit}
          </Button>
        </div>
      </form>
    </Card>
  );
}
