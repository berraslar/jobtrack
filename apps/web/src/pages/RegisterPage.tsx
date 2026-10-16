import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import {
  loginResponseSchema,
  PASSWORD_MIN_LENGTH,
  registerRequestSchema,
  type EmailCodeTiming,
} from '@jobtrack/shared';
import { EmailCodeStep } from '../components/EmailCodeStep';
import { Alert, Button, Field, LINK } from '../components/ui';
import { useI18n } from '../i18n';
import { api, ApiError, formText } from '../lib/api';
import { useSignedIn } from '../lib/auth';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const { t, locale, errorMessage, issueMessage } = useI18n();
  const signedIn = useSignedIn();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [pending, setPending] = useState(false);
  const [emailTiming, setEmailTiming] = useState<EmailCodeTiming | null>(null);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    // Sunucuyla aynı Zod şeması (DRY); sunucu yine de kendi doğrulamasını yapar.
    const parsed = registerRequestSchema.safeParse({
      email: formText(event.currentTarget, 'email'),
      password: formText(event.currentTarget, 'password'),
      locale,
    });
    if (!parsed.success) {
      const firstError = (field: string) => {
        const issue = parsed.error.issues.find((i) => i.path[0] === field);
        return issue ? issueMessage(issue) : undefined;
      };
      const email = firstError('email');
      const password = firstError('password');
      setFieldErrors({ ...(email ? { email } : {}), ...(password ? { password } : {}) });
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      // FR-18: hesap e-posta koduyla doğrulanınca açılır.
      const result = await api('/auth/register', {
        method: 'POST',
        body: parsed.data,
        schema: loginResponseSchema,
      });
      if (result.status === 'email_required') setEmailTiming(result);
      else await signedIn();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404 ? t.register.closed : errorMessage(err),
      );
    } finally {
      setPending(false);
    }
  };

  if (emailTiming) {
    return (
      <AuthLayout>
        <EmailCodeStep initialTiming={emailTiming} onVerified={() => signedIn()} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="mb-6 text-[2rem] leading-tight font-bold tracking-[-0.035em]">
        {t.register.title}
      </h1>
      <form className="flex flex-col gap-4" noValidate onSubmit={(e) => void submit(e)}>
        {error && <Alert>{error}</Alert>}
        <Field
          label={t.login.email}
          name="email"
          type="email"
          autoComplete="username"
          required
          {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
        />
        <Field
          label={t.login.password}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          hint={t.register.passwordHint(PASSWORD_MIN_LENGTH)}
          {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
        />
        <Button type="submit" disabled={pending}>
          {pending ? t.register.submitting : t.register.submit}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        {t.register.haveAccount}{' '}
        <Link to="/giris" className={`font-medium ${LINK}`}>
          {t.register.login}
        </Link>
      </p>
    </AuthLayout>
  );
}
