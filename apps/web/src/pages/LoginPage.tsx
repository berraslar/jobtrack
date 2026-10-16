import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { loginResponseSchema, type EmailCodeTiming, type LoginResponse } from '@jobtrack/shared';
import { EmailCodeStep } from '../components/EmailCodeStep';
import { Alert, Button, Field, LINK } from '../components/ui';
import { useI18n } from '../i18n';
import { api, formText } from '../lib/api';
import { useSignedIn } from '../lib/auth';
import { AuthLayout } from './AuthLayout';

type Step = 'password' | 'mfa' | 'email';

export function LoginPage() {
  const { t, errorMessage } = useI18n();
  const signedIn = useSignedIn();
  const [step, setStep] = useState<Step>('password');
  const [emailTiming, setEmailTiming] = useState<EmailCodeTiming | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mfaHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Adım değişince odak yeni başlığa taşınır (ekran okuyucu kullanıcıları için).
    if (step === 'mfa') mfaHeading.current?.focus();
  }, [step]);

  const finish = async (result: LoginResponse) => {
    if (result.status === 'mfa_required') {
      setStep('mfa');
      return;
    }
    if (result.status === 'email_required') {
      setEmailTiming(result);
      setStep('email');
      return;
    }
    await signedIn(result.failedAttemptsSinceLastLogin);
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>, path: string, body: unknown) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await finish(await api(path, { method: 'POST', body, schema: loginResponseSchema }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (step === 'email' && emailTiming) {
    return (
      <AuthLayout>
        <EmailCodeStep
          initialTiming={emailTiming}
          onVerified={(result) => signedIn(result.failedAttemptsSinceLastLogin)}
        />
      </AuthLayout>
    );
  }

  if (step === 'mfa') {
    return (
      <AuthLayout>
        <h1
          ref={mfaHeading}
          tabIndex={-1}
          className="mb-2 text-[2rem] leading-tight font-bold tracking-[-0.035em] outline-none"
        >
          {t.login.mfaTitle}
        </h1>
        <p className="mb-6 text-sm text-ink-muted">
          {useRecovery ? t.login.recoveryHint : t.login.mfaHint}
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            const value = formText(e.currentTarget, 'code');
            void submit(
              e,
              '/auth/mfa/verify',
              useRecovery ? { recoveryCode: value } : { code: value },
            );
          }}
        >
          {error && <Alert>{error}</Alert>}
          {useRecovery ? (
            <Field
              key="recovery"
              label={t.login.recoveryCode}
              name="code"
              autoComplete="off"
              required
            />
          ) : (
            <Field
              key="totp"
              label={t.login.code}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
            />
          )}
          <Button type="submit" disabled={pending}>
            {pending ? t.login.verifying : t.login.verify}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setUseRecovery((v) => !v);
              setError(null);
            }}
          >
            {useRecovery ? t.login.useCode : t.login.useRecovery}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="mb-6 text-[2rem] leading-tight font-bold tracking-[-0.035em]">
        {t.login.title}
      </h1>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          void submit(e, '/auth/login', {
            email: formText(e.currentTarget, 'email'),
            password: formText(e.currentTarget, 'password'),
          });
        }}
      >
        {error && <Alert>{error}</Alert>}
        {/* NFR-08: parola yöneticisi ve yapıştırma engellenmez. */}
        <Field label={t.login.email} name="email" type="email" autoComplete="username" required />
        <Field
          label={t.login.password}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? t.login.submitting : t.login.submit}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        {t.login.noAccount}{' '}
        <Link to="/kayit" className={`font-medium ${LINK}`}>
          {t.login.register}
        </Link>
      </p>
    </AuthLayout>
  );
}
