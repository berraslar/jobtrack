import nodemailer from 'nodemailer';
import type { Locale } from '@jobtrack/shared';

/** Giden e-posta. Yalnızca düz metin gönderilir (HTML yok: içerik enjeksiyonu yüzeyi yok). */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

/**
 * ADR-0007: standart SMTP (Gmail uygulama şifresi, Mailpit vb.). Bağlantı TLS ister; 465'te doğrudan
 * TLS, 587'de STARTTLS zorunludur. İçerik ve alıcı loglanmaz.
 */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure && config.port === 587,
    ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    logger: false,
    debug: false,
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, ...message });
    },
  };
}

export type EmailCodePurpose = 'login' | 'account_delete';

const TEXT: Record<Locale, Record<EmailCodePurpose, { subject: string; intro: string }>> = {
  tr: {
    login: {
      subject: 'JobTrack doğrulama kodunuz',
      intro: 'JobTrack hesabınıza giriş için doğrulama kodunuz:',
    },
    account_delete: {
      subject: 'JobTrack hesap silme onay kodu',
      intro: 'JobTrack hesabınızı kalıcı olarak silmek için onay kodunuz:',
    },
  },
  en: {
    login: {
      subject: 'Your JobTrack verification code',
      intro: 'Your verification code for signing in to JobTrack:',
    },
    account_delete: {
      subject: 'JobTrack account deletion code',
      intro: 'Your code to permanently delete your JobTrack account:',
    },
  },
};

const FOOTER: Record<Locale, string> = {
  tr: 'Kod 2 dakika geçerlidir ve yalnızca bir kez kullanılabilir. Bu isteği siz yapmadıysanız bu e-postayı yok sayın ve parolanızı değiştirmeyi düşünün. JobTrack sizden bu kodu asla istemez; kimseyle paylaşmayın.',
  en: 'The code is valid for 2 minutes and can be used once. If you did not request this, ignore this email and consider changing your password. JobTrack will never ask you for this code; do not share it.',
};

export function emailCodeMessage(
  locale: Locale,
  purpose: EmailCodePurpose,
  to: string,
  code: string,
): MailMessage {
  const text = locale === 'en' ? TEXT.en : TEXT.tr;
  const parts = purpose === 'account_delete' ? text.account_delete : text.login;
  const footer = locale === 'en' ? FOOTER.en : FOOTER.tr;
  return {
    to,
    subject: parts.subject,
    text: `${parts.intro}\n\n    ${code}\n\n${footer}\n`,
  };
}
