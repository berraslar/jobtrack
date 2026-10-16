import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import {
  DEFAULT_LOCALE,
  type AccountDelete,
  type LoginRequest,
  type MeResponse,
  type MfaEnableRequest,
  type MfaEnableResponse,
  type MfaSetupResponse,
  type MfaVerifyRequest,
  type RegisterRequest,
  type SessionInfo,
} from '@jobtrack/shared';
import { withUserTx, type Db, type Tx } from '../../db/client.js';
import type { AuditEvent } from '../../db/schema.js';
import { AttemptLimiter } from '../../lib/attempt-limiter.js';
import { decrypt, encrypt, hmacSha256, randomToken, sha256 } from '../../lib/crypto.js';
import { AppError, notFound, tooManyAttempts, unauthorized } from '../../lib/errors.js';
import { pgErrorCode, PG_UNIQUE_VIOLATION } from '../../lib/http.js';
import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
  type PwnedChecker,
} from '../../lib/password.js';
import { emailCodeMessage, type Mailer } from '../../lib/mailer.js';
import { createTotpSecret, totpUri, verifyTotp } from '../../lib/totp.js';
import * as repo from './auth.repository.js';

/** Oturum süreleri (A07): 30 dk hareketsizlik, 7 gün mutlak; MFA bekleyen yarım oturum 5 dk. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
export const MFA_PENDING_MS = 5 * 60 * 1000;
/** ADR-0007: e-posta kodu 2 dakika geçerli; yeniden gönderme 60 sn sonra; saatte en fazla 5 kod. */
export const EMAIL_CODE_TTL_MS = 2 * 60 * 1000;
export const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_CODES_PER_HOUR = 5;
/** Kod başına en fazla 5 deneme; sonra kod geçersizdir. */
const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** E-posta koduyla doğrulanan cihaz 30 gün hatırlanır (TOTP kapalı hesaplarda girişte kod istenmez). */
export const TRUSTED_DEVICE_MS = 30 * 24 * 60 * 60 * 1000;
/** last_seen_at her istekte değil, en fazla dakikada bir yazılır. */
const TOUCH_INTERVAL_MS = 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
// 32 karakter: bayt % 32 sapmasız dağılır. Karışan karakterler (i, l, o, 1) çıkarıldı.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz023456789';

const INVALID_CREDENTIALS = 'E-posta veya parola hatalı.';

export interface RequestMeta {
  ip: string;
  userAgent: string | null;
  /** Güvenilen cihaz çerezinin değeri (varsa). */
  deviceToken?: string | null;
}

/** E-posta kodunun zamanlaması: arayüzde geri sayım ve "yeniden gönder" düğmesi için. */
export interface EmailCodeTiming {
  expiresInSeconds: number;
  resendInSeconds: number;
}

export interface IssuedDevice {
  token: string;
  maxAgeSeconds: number;
}

type EmailCodePurpose = repo.EmailCodePurpose;

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  mfaPending: boolean;
  token: string;
}

export interface IssuedSession {
  token: string;
  maxAgeSeconds: number;
}

export interface AuthServiceDeps {
  db: Db;
  keys: { csrf: Buffer; ipHash: Buffer; dataEncryption: Buffer; emailCode: Buffer };
  mailer: Mailer;
  registrationEnabled: boolean;
  isPwned: PwnedChecker | null;
  now?: () => Date;
}

export class AuthService {
  /** Aynı e-postaya 15 dakikada en fazla 5 başarısız parola denemesi. */
  readonly passwordLimiter: AttemptLimiter;
  /**
   * Kullanıcı başına 15 dakikada en fazla 5 hatalı MFA kodu. Yarım oturuma değil kullanıcıya bağlıdır;
   * yeniden giriş yapıp yeni yarım oturum almak sayacı sıfırlamaz.
   */
  readonly mfaLimiter: AttemptLimiter;
  /** Kullanıcı başına 15 dakikada en fazla 5 hatalı e-posta kodu (kod başına sayaca ek olarak). */
  readonly emailLimiter: AttemptLimiter;
  private readonly db: Db;
  private readonly now: () => Date;

  constructor(private readonly deps: AuthServiceDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    const clock = () => this.now().getTime();
    this.passwordLimiter = new AttemptLimiter(5, 15 * 60 * 1000, clock);
    this.mfaLimiter = new AttemptLimiter(5, 15 * 60 * 1000, clock);
    this.emailLimiter = new AttemptLimiter(5, 15 * 60 * 1000, clock);
  }

  csrfTokenFor(sessionToken: string): string {
    return hmacSha256(this.deps.keys.csrf, sessionToken).toString('base64url');
  }

  /**
   * FR-01, FR-18: hesap doğrulanmamış olarak açılır; e-postaya kod gider ve yalnızca yarım oturum
   * verilir. Kod gönderilemezse hesap da oluşmaz (aynı transaction).
   */
  async register(
    input: RegisterRequest,
    meta: RequestMeta,
  ): Promise<{ session: IssuedSession; timing: EmailCodeTiming }> {
    // Kayıt kapalıysa uç nokta hiç yokmuş gibi davranır (ADR-0003).
    if (!this.deps.registrationEnabled) throw notFound();

    if (this.deps.isPwned && (await this.deps.isPwned(input.password)) === true) {
      throw new AppError(
        400,
        'Bu parola daha önce bir veri sızıntısında görülmüş. Lütfen başka bir parola seçin.',
        'password_breached',
      );
    }

    const passwordHash = await hashPassword(input.password);
    const userId = await repo.nextUuid(this.db);
    try {
      return await withUserTx(this.db, userId, async (tx) => {
        await repo.insertUser(tx, {
          id: userId,
          email: input.email,
          passwordHash,
          locale: input.locale ?? DEFAULT_LOCALE,
        });
        await this.audit(tx, userId, 'register', meta);
        const timing = await this.issueEmailCode(
          tx,
          { id: userId, email: input.email, locale: input.locale ?? DEFAULT_LOCALE },
          'login',
          false,
        );
        return { session: await this.issueSession(tx, userId, true, meta), timing };
      });
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
        throw new AppError(
          409,
          'Bu e-posta adresiyle kayıt oluşturulamadı.',
          'registration_failed',
        );
      }
      throw err;
    }
  }

  async login(
    input: LoginRequest,
    meta: RequestMeta,
  ): Promise<
    | { status: 'mfa_required'; session: IssuedSession }
    | { status: 'email_required'; session: IssuedSession; timing: EmailCodeTiming }
    | { status: 'ok'; session: IssuedSession; failedAttemptsSinceLastLogin: number }
  > {
    if (this.passwordLimiter.isBlocked(input.email)) throw tooManyAttempts();

    const candidate = await repo.findLoginCandidate(this.db, input.email);
    const valid = candidate
      ? await verifyPassword(candidate.passwordHash, input.password)
      : await verifyAgainstDummy(input.password);

    if (!candidate || !valid) {
      this.passwordLimiter.fail(input.email);
      if (candidate) {
        await withUserTx(this.db, candidate.id, (tx) =>
          this.audit(tx, candidate.id, 'login_failed', meta),
        );
      }
      // Hesabın var olup olmadığını belli etmeyen tek mesaj (A07).
      throw new AppError(401, INVALID_CREDENTIALS, 'invalid_credentials');
    }
    this.passwordLimiter.reset(input.email);

    if (candidate.totpEnabled) {
      const session = await withUserTx(this.db, candidate.id, (tx) =>
        this.issueSession(tx, candidate.id, true, meta),
      );
      return { status: 'mfa_required', session };
    }

    // FR-19: TOTP kapalıysa ikinci adım e-posta kodudur; doğrulanmış e-posta ve güvenilen cihazda atlanır.
    return withUserTx(this.db, candidate.id, async (tx) => {
      const user = await repo.getUser(tx, candidate.id);
      if (!user) throw unauthorized();
      const trusted =
        user.emailVerifiedAt !== null &&
        !!meta.deviceToken &&
        (await repo.isTrustedDevice(tx, user.id, sha256(meta.deviceToken), this.now()));
      if (!trusted) {
        const timing = await this.issueEmailCode(tx, user, 'login', false);
        const session = await this.issueSession(tx, user.id, true, meta);
        return { status: 'email_required' as const, session, timing };
      }
      const failedAttemptsSinceLastLogin = await repo.countFailedSinceLastSuccess(tx, candidate.id);
      await this.audit(tx, candidate.id, 'login_success', meta);
      const session = await this.issueSession(tx, candidate.id, false, meta);
      return { status: 'ok' as const, session, failedAttemptsSinceLastLogin };
    });
  }

  /**
   * FR-18/FR-19: e-posta kodu adımı. Başarılıysa e-posta doğrulanır, yarım oturum tam oturuma
   * yükseltilir (yeni ID) ve cihaz 30 gün hatırlanır. TOTP açık hesapta bu yol kapalıdır: e-posta
   * kodu TOTP'nin yerine geçemez.
   */
  async verifyEmail(
    pending: AuthenticatedSession,
    code: string,
    meta: RequestMeta,
  ): Promise<{
    session: IssuedSession;
    device: IssuedDevice;
    failedAttemptsSinceLastLogin: number;
  }> {
    if (!pending.mfaPending) throw new AppError(400, 'Doğrulama beklenmiyor.', 'mfa_not_pending');
    const result = await withUserTx(this.db, pending.userId, async (tx) => {
      const user = await repo.getUser(tx, pending.userId);
      if (!user) throw unauthorized();
      if (user.totpEnabledAt) {
        throw new AppError(400, 'Doğrulama uygulamanızdaki kodu girin.', 'totp_required');
      }
      if (!(await this.checkEmailCode(tx, user.id, 'login', code))) return null;

      const now = this.now();
      if (await repo.markEmailVerified(tx, user.id, now)) {
        await this.audit(tx, user.id, 'email_verified', meta);
      }
      const failedAttemptsSinceLastLogin = await repo.countFailedSinceLastSuccess(tx, user.id);
      await repo.deleteSession(tx, pending.sessionId);
      await this.audit(tx, user.id, 'login_success', meta);
      const session = await this.issueSession(tx, user.id, false, meta);
      const deviceToken = randomToken();
      await repo.insertTrustedDevice(tx, {
        userId: user.id,
        tokenHash: sha256(deviceToken),
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        now,
        expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_MS),
      });
      return {
        session,
        device: { token: deviceToken, maxAgeSeconds: Math.floor(TRUSTED_DEVICE_MS / 1000) },
        failedAttemptsSinceLastLogin,
      };
    });

    if (!result) {
      await withUserTx(this.db, pending.userId, (tx) =>
        this.audit(tx, pending.userId, 'email_code_failed', meta),
      );
      throw new AppError(401, 'E-posta kodu geçersiz veya süresi dolmuş.', 'invalid_email_code');
    }
    return result;
  }

  /** Yarım oturumda yeni kod (60 sn bekleme, saatte en fazla 5). */
  async resendEmailCode(pending: AuthenticatedSession): Promise<EmailCodeTiming> {
    if (!pending.mfaPending) throw new AppError(400, 'Doğrulama beklenmiyor.', 'mfa_not_pending');
    return withUserTx(this.db, pending.userId, async (tx) => {
      const user = await repo.getUser(tx, pending.userId);
      if (!user) throw unauthorized();
      if (user.totpEnabledAt) {
        throw new AppError(400, 'Doğrulama uygulamanızdaki kodu girin.', 'totp_required');
      }
      return this.issueEmailCode(tx, user, 'login', true);
    });
  }

  /** FR-14: hesap silme onayı için e-postaya kod gönderir. */
  async requestDeletionCode(session: AuthenticatedSession): Promise<EmailCodeTiming> {
    return withUserTx(this.db, session.userId, async (tx) => {
      const user = await repo.getUser(tx, session.userId);
      if (!user) throw unauthorized();
      return this.issueEmailCode(tx, user, 'account_delete', true);
    });
  }

  /** MFA'nın ikinci adımı. Başarılıysa yarım oturum silinir ve yeni bir tam oturum açılır (ID yenileme). */
  async verifyMfa(
    pending: AuthenticatedSession,
    input: MfaVerifyRequest,
    meta: RequestMeta,
  ): Promise<{ session: IssuedSession; failedAttemptsSinceLastLogin: number }> {
    if (!pending.mfaPending) throw new AppError(400, 'Doğrulama beklenmiyor.', 'mfa_not_pending');
    if (this.mfaLimiter.isBlocked(pending.userId)) {
      await withUserTx(this.db, pending.userId, (tx) => repo.deleteSession(tx, pending.sessionId));
      throw tooManyAttempts();
    }

    const result = await withUserTx(this.db, pending.userId, async (tx) => {
      const user = await repo.getUser(tx, pending.userId);
      if (!user?.totpSecretEnc || !user.totpEnabledAt) return null;

      let usedRecovery = false;
      if ('code' in input) {
        const secret = decrypt(this.deps.keys.dataEncryption, user.totpSecretEnc, user.id);
        const step = verifyTotp(secret, input.code, user.totpLastStep, this.now().getTime());
        if (step === null || !(await repo.claimTotpStep(tx, user.id, step))) return null;
      } else {
        const ok = await repo.consumeRecoveryCode(
          tx,
          user.id,
          hashRecoveryCode(input.recoveryCode),
        );
        if (!ok) return null;
        usedRecovery = true;
      }

      const failedAttemptsSinceLastLogin = await repo.countFailedSinceLastSuccess(tx, user.id);
      await repo.deleteSession(tx, pending.sessionId);
      if (usedRecovery) await this.audit(tx, user.id, 'mfa_recovery_used', meta);
      await this.audit(tx, user.id, 'login_success', meta);
      const session = await this.issueSession(tx, user.id, false, meta);
      return { session, failedAttemptsSinceLastLogin };
    });

    if (!result) {
      this.mfaLimiter.fail(pending.userId);
      await withUserTx(this.db, pending.userId, (tx) =>
        this.audit(tx, pending.userId, 'login_failed', meta),
      );
      throw new AppError(401, 'Doğrulama kodu geçersiz.', 'invalid_mfa_code');
    }
    this.mfaLimiter.reset(pending.userId);
    return result;
  }

  /**
   * Çerezdeki token'ı doğrular. Süresi dolmuş ya da hareketsiz kalmış oturum silinir.
   * Herhangi bir hata durumunda null döner; çağıran erişimi reddeder (fail closed).
   */
  async authenticate(token: string): Promise<AuthenticatedSession | null> {
    const found = await repo.findSessionByTokenHash(this.db, sha256(token));
    if (!found) return null;

    const now = this.now();
    const idleLimit = found.mfaPending ? MFA_PENDING_MS : SESSION_IDLE_MS;
    const expired =
      found.expiresAt.getTime() <= now.getTime() ||
      now.getTime() - found.lastSeenAt.getTime() > idleLimit;

    if (expired) {
      await withUserTx(this.db, found.userId, (tx) => repo.deleteSession(tx, found.id));
      return null;
    }
    if (now.getTime() - found.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await withUserTx(this.db, found.userId, (tx) => repo.touchSession(tx, found.id, now));
    }
    return { sessionId: found.id, userId: found.userId, mfaPending: found.mfaPending, token };
  }

  async me(session: AuthenticatedSession): Promise<MeResponse> {
    const user = await withUserTx(this.db, session.userId, (tx) =>
      repo.getUser(tx, session.userId),
    );
    if (!user) throw unauthorized();
    return {
      id: user.id,
      email: user.email,
      mfaEnabled: user.totpEnabledAt !== null,
      locale: user.locale,
      csrfToken: this.csrfTokenFor(session.token),
    };
  }

  async logout(session: AuthenticatedSession): Promise<void> {
    await withUserTx(this.db, session.userId, (tx) => repo.deleteSession(tx, session.sessionId));
  }

  /** FR-03: tüm oturumları (mevcut dahil) kapatır. */
  async logoutAll(session: AuthenticatedSession, meta: RequestMeta): Promise<void> {
    await withUserTx(this.db, session.userId, async (tx) => {
      await repo.deleteAllSessions(tx, session.userId);
      // Güvenilen cihazlar da unutulur: sonraki girişte her cihazda yeniden e-posta kodu istenir.
      await repo.deleteTrustedDevices(tx, session.userId);
      await this.audit(tx, session.userId, 'logout_all', meta);
    });
  }

  /** FR-03: aktif oturumlar. */
  async listSessions(session: AuthenticatedSession): Promise<SessionInfo[]> {
    const rows = await withUserTx(this.db, session.userId, async (tx) => {
      await repo.deleteExpiredSessions(tx, session.userId, this.now());
      return repo.listActiveSessions(tx, session.userId);
    });
    const idleCutoff = this.now().getTime() - SESSION_IDLE_MS;
    return rows
      .filter((row) => row.lastSeenAt.getTime() >= idleCutoff)
      .map((row) => ({
        id: row.id,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        current: row.id === session.sessionId,
      }));
  }

  /** FR-02 adım 1: yeni gizli anahtar üretir, şifreli saklar; henüz etkin değildir. */
  async setupMfa(session: AuthenticatedSession): Promise<MfaSetupResponse> {
    return withUserTx(this.db, session.userId, async (tx) => {
      const user = await repo.getUser(tx, session.userId);
      if (!user) throw unauthorized();
      if (user.totpEnabledAt) {
        throw new AppError(409, 'İki adımlı doğrulama zaten açık.', 'mfa_already_enabled');
      }
      const secret = createTotpSecret();
      await repo.setPendingTotpSecret(
        tx,
        user.id,
        encrypt(this.deps.keys.dataEncryption, secret, user.id),
      );
      const otpauthUri = totpUri(secret, user.email);
      return {
        otpauthUri,
        qrDataUrl: await QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 }),
      };
    });
  }

  /** FR-02 adım 2: kod doğrulanınca MFA açılır; kurtarma kodları yalnızca bu yanıtta bir kez gösterilir. */
  async enableMfa(
    session: AuthenticatedSession,
    input: MfaEnableRequest,
    meta: RequestMeta,
  ): Promise<MfaEnableResponse> {
    return withUserTx(this.db, session.userId, async (tx) => {
      const user = await repo.getUser(tx, session.userId);
      if (!user) throw unauthorized();
      if (user.totpEnabledAt) {
        throw new AppError(409, 'İki adımlı doğrulama zaten açık.', 'mfa_already_enabled');
      }
      if (!user.totpSecretEnc) {
        throw new AppError(400, 'Önce kurulumu başlatın.', 'mfa_setup_required');
      }
      // Ele geçirilmiş bir oturumla MFA'nın saldırganın cihazına bağlanmasını engeller.
      // Hatalı parola, giriş ile aynı hesap kilidini besler.
      if (this.passwordLimiter.isBlocked(user.email)) throw tooManyAttempts();
      if (!(await verifyPassword(user.passwordHash, input.password))) {
        this.passwordLimiter.fail(user.email);
        throw new AppError(400, 'Parola hatalı.', 'invalid_password');
      }
      const secret = decrypt(this.deps.keys.dataEncryption, user.totpSecretEnc, user.id);
      const step = verifyTotp(secret, input.code, null, this.now().getTime());
      if (step === null) throw new AppError(400, 'Doğrulama kodu geçersiz.', 'invalid_mfa_code');

      const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
      await repo.enableTotp(tx, user.id, step, this.now());
      await repo.replaceRecoveryCodes(tx, user.id, recoveryCodes.map(hashRecoveryCode));
      await this.audit(tx, user.id, 'mfa_enabled', meta);
      return { recoveryCodes };
    });
  }

  /**
   * FR-14: hesabı kalıcı olarak siler. Ele geçirilmiş bir oturum hesabı silemesin diye parola ve
   * (MFA açıksa) doğrulama kodu ya da kurtarma kodu yeniden istenir. Hatalı parola giriş kilidini besler.
   */
  async deleteAccount(session: AuthenticatedSession, input: AccountDelete): Promise<void> {
    await withUserTx(this.db, session.userId, async (tx) => {
      const user = await repo.getUser(tx, session.userId);
      if (!user) throw unauthorized();
      if (this.passwordLimiter.isBlocked(user.email)) throw tooManyAttempts();
      if (!(await verifyPassword(user.passwordHash, input.password))) {
        this.passwordLimiter.fail(user.email);
        throw new AppError(400, 'Parola hatalı.', 'invalid_password');
      }
      if (user.totpEnabledAt && user.totpSecretEnc) {
        // Girişteki ikinci adım ile aynı kullanıcı bazlı sayaç: oturumu ve parolayı ele geçiren biri
        // kodu burada da sınırsız deneyemez.
        if (this.mfaLimiter.isBlocked(user.id)) throw tooManyAttempts();
        let ok: boolean;
        if ('code' in input) {
          const secret = decrypt(this.deps.keys.dataEncryption, user.totpSecretEnc, user.id);
          const step = verifyTotp(secret, input.code, user.totpLastStep, this.now().getTime());
          ok = step !== null && (await repo.claimTotpStep(tx, user.id, step));
        } else if ('recoveryCode' in input) {
          ok = await repo.consumeRecoveryCode(tx, user.id, hashRecoveryCode(input.recoveryCode));
        } else {
          throw new AppError(400, 'Doğrulama kodunu girin.', 'mfa_required');
        }
        if (!ok) {
          this.mfaLimiter.fail(user.id);
          throw new AppError(400, 'Doğrulama kodu geçersiz.', 'invalid_mfa_code');
        }
        this.mfaLimiter.reset(user.id);
      }
      // Son onay: e-postaya gönderilen silme kodu (ADR-0007).
      if (!(await this.checkEmailCode(tx, user.id, 'account_delete', input.emailCode))) {
        throw new AppError(400, 'E-posta kodu geçersiz veya süresi dolmuş.', 'invalid_email_code');
      }
      await repo.deleteUser(tx, user.id);
    });
  }

  /**
   * Yeni e-posta kodu üretir ve gönderir. `explicit` false iken (giriş/kayıt) son 60 sn içinde kod
   * gönderildiyse yenisi gönderilmez, mevcut kod geçerli kalır; açık "yeniden gönder" isteği ise
   * bekleme süresi dolmadan 429 alır. Saatte en fazla 5 kod.
   */
  private async issueEmailCode(
    tx: Tx,
    user: { id: string; email: string; locale: 'tr' | 'en' },
    purpose: EmailCodePurpose,
    explicit: boolean,
  ): Promise<EmailCodeTiming> {
    const now = this.now();
    const { lastCreatedAt, countSince } = await repo.emailCodeIssuance(
      tx,
      user.id,
      purpose,
      new Date(now.getTime() - 60 * 60 * 1000),
    );
    const sinceLast = lastCreatedAt ? now.getTime() - lastCreatedAt.getTime() : Infinity;
    // Bekleme yalnızca hâlâ geçerli bir kod varken uygulanır; kullanılmış kodun ardından yeni kod
    // hemen gönderilebilir (saatlik üst sınır yine geçerli).
    const active =
      sinceLast < EMAIL_RESEND_COOLDOWN_MS
        ? await repo.activeEmailCode(tx, user.id, purpose, now)
        : null;
    if (active) {
      if (explicit) throw new AppError(429, 'Yeni kod için biraz bekleyin.', 'resend_too_soon');
      return {
        expiresInSeconds: Math.ceil((active.expiresAt.getTime() - now.getTime()) / 1000),
        resendInSeconds: Math.ceil((EMAIL_RESEND_COOLDOWN_MS - sinceLast) / 1000),
      };
    }
    if (countSince >= EMAIL_CODES_PER_HOUR) throw tooManyAttempts();

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await repo.replaceEmailCode(tx, {
      userId: user.id,
      purpose,
      codeHash: this.emailCodeHash(user.id, purpose, code),
      now,
      expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
    });
    await this.deps.mailer.send(emailCodeMessage(user.locale, purpose, user.email, code));
    return {
      expiresInSeconds: EMAIL_CODE_TTL_MS / 1000,
      resendInSeconds: EMAIL_RESEND_COOLDOWN_MS / 1000,
    };
  }

  /** Kodu sabit zamanlı karşılaştırır; hatalı deneme hem koda hem kullanıcı sayacına yazılır. */
  private async checkEmailCode(
    tx: Tx,
    userId: string,
    purpose: EmailCodePurpose,
    code: string,
  ): Promise<boolean> {
    if (this.emailLimiter.isBlocked(userId)) throw tooManyAttempts();
    const active = await repo.activeEmailCode(tx, userId, purpose, this.now());
    const ok =
      active !== null &&
      active.attempts < EMAIL_CODE_MAX_ATTEMPTS &&
      timingSafeEqual(this.emailCodeHash(userId, purpose, code), active.codeHash) &&
      (await repo.consumeEmailCode(tx, active.id, this.now()));
    if (!ok) {
      if (active) await repo.countEmailCodeAttempt(tx, active.id);
      this.emailLimiter.fail(userId);
      return false;
    }
    this.emailLimiter.reset(userId);
    return true;
  }

  private emailCodeHash(userId: string, purpose: EmailCodePurpose, code: string): Buffer {
    return hmacSha256(this.deps.keys.emailCode, `${userId}:${purpose}:${code}`);
  }

  private async issueSession(
    tx: Tx,
    userId: string,
    mfaPending: boolean,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const token = randomToken();
    const now = this.now();
    const lifetime = mfaPending ? MFA_PENDING_MS : SESSION_ABSOLUTE_MS;
    await repo.insertSession(tx, {
      userId,
      tokenHash: sha256(token),
      mfaPending,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
      now,
      expiresAt: new Date(now.getTime() + lifetime),
    });
    return { token, maxAgeSeconds: Math.floor(lifetime / 1000) };
  }

  private audit(tx: Tx, userId: string, event: AuditEvent, meta: RequestMeta): Promise<void> {
    // IP adresi açık saklanmaz; anahtarlı hash ile ilişkilendirilebilir ama geri çevrilemez (KVKK).
    return repo.insertAudit(tx, {
      userId,
      event,
      ipHash: hmacSha256(this.deps.keys.ipHash, meta.ip),
    });
  }
}

function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET.charAt(b % RECOVERY_ALPHABET.length));
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/** Kurtarma kodları yüksek entropili olduğu için SHA-256 yeterlidir; tire ve büyük harf normalize edilir. */
export function hashRecoveryCode(code: string): Buffer {
  return sha256(code.toLowerCase().replaceAll('-', ''));
}
