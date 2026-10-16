import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import {
  emailCodeTimingSchema,
  loginResponseSchema,
  type EmailCodeTiming,
  type LoginResponse,
} from '@jobtrack/shared';
import { useI18n } from '../i18n';
import { api, formText } from '../lib/api';
import { Alert, Button, Field } from './ui';

const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;

/** Saniyede bir azalan sayaç; `deadline` değişince yeniden başlar. */
function useSecondsLeft(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * FR-18/FR-19: e-postaya gelen 6 haneli kod adımı (kayıt ve yeni cihazdan giriş). Kod 2 dakika
 * geçerlidir; geri sayım ekranda görünür, yeni kod 60 sn sonra istenebilir.
 */
export function EmailCodeStep({
  initialTiming,
  onVerified,
}: {
  initialTiming: EmailCodeTiming;
  onVerified: (result: Extract<LoginResponse, { status: 'ok' }>) => Promise<void>;
}) {
  const { t, errorMessage } = useI18n();
  const s = t.emailStep;
  const heading = useRef<HTMLHeadingElement>(null);
  const [deadlines, setDeadlines] = useState(() => ({
    expires: Date.now() + initialTiming.expiresInSeconds * 1000,
    resend: Date.now() + initialTiming.resendInSeconds * 1000,
  }));
  const expiresIn = useSecondsLeft(deadlines.expires);
  const resendIn = useSecondsLeft(deadlines.resend);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const result = await api('/auth/email/verify', {
        method: 'POST',
        body: { code: formText(event.currentTarget, 'code') },
        schema: loginResponseSchema,
      });
      if (result.status === 'ok') await onVerified(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    try {
      const timing = await api('/auth/email/resend', {
        method: 'POST',
        schema: emailCodeTimingSchema,
      });
      setDeadlines({
        expires: Date.now() + timing.expiresInSeconds * 1000,
        resend: Date.now() + timing.resendInSeconds * 1000,
      });
      setNotice(s.resent);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <h1
        ref={heading}
        tabIndex={-1}
        className="mb-2 text-[2rem] leading-tight font-bold tracking-[-0.035em] outline-none"
      >
        {s.title}
      </h1>
      <p className="mb-6 text-sm text-ink-muted">{s.hint}</p>
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div aria-live="polite">
          {error && <Alert>{error}</Alert>}
          {notice && !error && <Alert tone="success">{notice}</Alert>}
        </div>
        <Field
          label={s.code}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          hint={expiresIn > 0 ? s.expiresIn(mmss(expiresIn)) : s.expired}
        />
        <Button type="submit" disabled={pending || expiresIn === 0}>
          {pending ? s.verifying : s.verify}
        </Button>
        <Button variant="secondary" disabled={resendIn > 0} onClick={() => void resend()}>
          {s.resend}
        </Button>
        {resendIn > 0 && <p className="text-xs text-ink-muted">{s.resendIn(resendIn)}</p>}
      </form>
    </>
  );
}
