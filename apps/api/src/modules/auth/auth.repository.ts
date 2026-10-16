import type { Locale } from '@jobtrack/shared';
import { and, count, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import {
  auditLog,
  emailCodes,
  mfaRecoveryCodes,
  sessions,
  trustedDevices,
  users,
  type AuditEvent,
} from '../../db/schema.js';

// Repository: yalnızca veri erişimi, iş kuralı yok. Kullanıcıya ait her fonksiyon,
// withUserTx ile açılmış bir transaction (Tx) alır; RLS bu transaction'daki app.user_id'ye göre çalışır.

export interface LoginCandidate {
  id: string;
  passwordHash: string;
  totpEnabled: boolean;
}

export interface SessionLookup {
  id: string;
  userId: string;
  mfaPending: boolean;
  lastSeenAt: Date;
  expiresAt: Date;
}

/** Giriş öncesi arama: SECURITY DEFINER fonksiyonu, RLS dışında yalnızca gereken sütunları döner. */
export async function findLoginCandidate(db: Db, email: string): Promise<LoginCandidate | null> {
  const rows = await db.execute<{ id: string; password_hash: string; totp_enabled: boolean }>(
    sql`select id, password_hash, totp_enabled from auth_find_user_by_email(${email})`,
  );
  const row = rows[0];
  return row
    ? { id: row.id, passwordHash: row.password_hash, totpEnabled: row.totp_enabled }
    : null;
}

/** Oturum çerezinden kullanıcıyı bulur (giriş öncesi, SECURITY DEFINER). */
export async function findSessionByTokenHash(
  db: Db,
  tokenHash: Buffer,
): Promise<SessionLookup | null> {
  const rows = await db.execute<{
    id: string;
    user_id: string;
    mfa_pending: boolean;
    last_seen_at: string | Date;
    expires_at: string | Date;
  }>(
    sql`select id, user_id, mfa_pending, last_seen_at, expires_at from auth_find_session(${tokenHash})`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    mfaPending: row.mfa_pending,
    lastSeenAt: new Date(row.last_seen_at),
    expiresAt: new Date(row.expires_at),
  };
}

/** RLS ekleme kontrolü için ID önceden üretilir (WITH CHECK id = app.user_id). */
export async function nextUuid(db: Db): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`select uuidv7() as id`);
  const id = rows[0]?.id;
  if (!id) throw new Error('uuidv7 üretilemedi');
  return id;
}

export async function insertUser(
  tx: Tx,
  values: { id: string; email: string; passwordHash: string; locale: Locale },
): Promise<void> {
  await tx.insert(users).values({ ...values, createdAt: new Date(), updatedAt: new Date() });
}

export async function getUser(tx: Tx, userId: string) {
  const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function setPendingTotpSecret(
  tx: Tx,
  userId: string,
  secretEnc: string,
): Promise<void> {
  await tx
    .update(users)
    .set({
      totpSecretEnc: secretEnc,
      totpEnabledAt: null,
      totpLastStep: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function enableTotp(tx: Tx, userId: string, step: number, now: Date): Promise<void> {
  await tx
    .update(users)
    .set({ totpEnabledAt: now, totpLastStep: step, updatedAt: now })
    .where(eq(users.id, userId));
}

/**
 * TOTP adımını atomik olarak "kullanıldı" işaretler. Aynı kodla eşzamanlı iki istekten yalnızca
 * biri satırı günceller; diğeri satır kilidini bekler, koşulu yeniden değerlendirir ve false alır.
 */
export async function claimTotpStep(tx: Tx, userId: string, step: number): Promise<boolean> {
  const rows = await tx
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function replaceRecoveryCodes(
  tx: Tx,
  userId: string,
  codeHashes: Buffer[],
): Promise<void> {
  await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  await tx.insert(mfaRecoveryCodes).values(
    codeHashes.map((codeHash) => ({
      id: sql`uuidv7()`,
      userId,
      codeHash,
      createdAt: new Date(),
    })),
  );
}

/** Kodu tek seferlik kullanır; daha önce kullanılmışsa false döner. */
export async function consumeRecoveryCode(
  tx: Tx,
  userId: string,
  codeHash: Buffer,
): Promise<boolean> {
  const rows = await tx
    .update(mfaRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(mfaRecoveryCodes.userId, userId),
        eq(mfaRecoveryCodes.codeHash, codeHash),
        isNull(mfaRecoveryCodes.usedAt),
      ),
    )
    .returning({ id: mfaRecoveryCodes.id });
  return rows.length > 0;
}

export async function insertSession(
  tx: Tx,
  values: {
    userId: string;
    tokenHash: Buffer;
    mfaPending: boolean;
    userAgent: string | null;
    now: Date;
    expiresAt: Date;
  },
): Promise<string> {
  const rows = await tx
    .insert(sessions)
    .values({
      id: sql`uuidv7()`,
      userId: values.userId,
      tokenHash: values.tokenHash,
      mfaPending: values.mfaPending,
      userAgent: values.userAgent,
      createdAt: values.now,
      lastSeenAt: values.now,
      expiresAt: values.expiresAt,
    })
    .returning({ id: sessions.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('oturum oluşturulamadı');
  return id;
}

export async function touchSession(tx: Tx, sessionId: string, now: Date): Promise<void> {
  await tx.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, sessionId));
}

export async function deleteSession(tx: Tx, sessionId: string): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteAllSessions(tx: Tx, userId: string): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredSessions(tx: Tx, userId: string, now: Date): Promise<void> {
  await tx.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)));
}

export async function listActiveSessions(tx: Tx, userId: string) {
  return tx
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.mfaPending, false)))
    .orderBy(desc(sessions.lastSeenAt));
}

export async function insertAudit(
  tx: Tx,
  values: { userId: string; event: AuditEvent; ipHash: Buffer | null },
): Promise<void> {
  await tx.insert(auditLog).values({ id: sql`uuidv7()`, ...values, createdAt: new Date() });
}

/** Son başarılı girişten bu yana başarısız giriş sayısı. */
export async function countFailedSinceLastSuccess(tx: Tx, userId: string): Promise<number> {
  const last = await tx
    .select({ createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.userId, userId), eq(auditLog.event, 'login_success')))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  const since = last[0]?.createdAt ?? new Date(0);
  const rows = await tx
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, userId),
        eq(auditLog.event, 'login_failed'),
        gt(auditLog.createdAt, since),
      ),
    );
  return rows[0]?.n ?? 0;
}

/** FR-14: kullanıcı ve ona bağlı her şey (zincirleme silme) kaldırılır. */
export async function deleteUser(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return rows.length > 0;
}

// FR-18/FR-19: e-posta kodları ve güvenilen cihazlar (ADR-0007)

export type EmailCodePurpose = 'login' | 'account_delete';

/** Aynı amaçla verilmiş önceki kodları geçersiz kılar ve yenisini ekler (her an tek geçerli kod). */
export async function replaceEmailCode(
  tx: Tx,
  values: {
    userId: string;
    purpose: EmailCodePurpose;
    codeHash: Buffer;
    now: Date;
    expiresAt: Date;
  },
): Promise<void> {
  await tx
    .update(emailCodes)
    .set({ consumedAt: values.now })
    .where(
      and(
        eq(emailCodes.userId, values.userId),
        eq(emailCodes.purpose, values.purpose),
        isNull(emailCodes.consumedAt),
      ),
    );
  await tx.insert(emailCodes).values({
    id: sql`uuidv7()`,
    userId: values.userId,
    purpose: values.purpose,
    codeHash: values.codeHash,
    attempts: 0,
    createdAt: values.now,
    expiresAt: values.expiresAt,
  });
}

/** Son kodun zamanı (yeniden gönderme beklemesi) ve son bir saatteki kod sayısı (üst sınır). */
export async function emailCodeIssuance(
  tx: Tx,
  userId: string,
  purpose: EmailCodePurpose,
  since: Date,
): Promise<{ lastCreatedAt: Date | null; countSince: number }> {
  const [row] = await tx
    .select({
      last: sql<Date | null>`max(${emailCodes.createdAt})`,
      recent: sql<number>`count(*) filter (where ${emailCodes.createdAt} > ${since.toISOString()}::timestamptz)::int`,
    })
    .from(emailCodes)
    .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose)));
  return {
    lastCreatedAt: row?.last ? new Date(row.last) : null,
    countSince: row?.recent ?? 0,
  };
}

export async function activeEmailCode(
  tx: Tx,
  userId: string,
  purpose: EmailCodePurpose,
  now: Date,
) {
  const rows = await tx
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.userId, userId),
        eq(emailCodes.purpose, purpose),
        isNull(emailCodes.consumedAt),
        gt(emailCodes.expiresAt, now),
      ),
    )
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function countEmailCodeAttempt(tx: Tx, id: string): Promise<void> {
  await tx
    .update(emailCodes)
    .set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(eq(emailCodes.id, id));
}

/** Kodu tüketir; eşzamanlı ikinci kullanım false döner. */
export async function consumeEmailCode(tx: Tx, id: string, now: Date): Promise<boolean> {
  const rows = await tx
    .update(emailCodes)
    .set({ consumedAt: now })
    .where(and(eq(emailCodes.id, id), isNull(emailCodes.consumedAt)))
    .returning({ id: emailCodes.id });
  return rows.length > 0;
}

export async function markEmailVerified(tx: Tx, userId: string, now: Date): Promise<boolean> {
  const rows = await tx
    .update(users)
    .set({ emailVerifiedAt: now, updatedAt: now })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function insertTrustedDevice(
  tx: Tx,
  values: {
    userId: string;
    tokenHash: Buffer;
    userAgent: string | null;
    now: Date;
    expiresAt: Date;
  },
): Promise<void> {
  await tx.insert(trustedDevices).values({
    id: sql`uuidv7()`,
    userId: values.userId,
    tokenHash: values.tokenHash,
    userAgent: values.userAgent,
    createdAt: values.now,
    expiresAt: values.expiresAt,
  });
}

export async function isTrustedDevice(
  tx: Tx,
  userId: string,
  tokenHash: Buffer,
  now: Date,
): Promise<boolean> {
  const rows = await tx
    .select({ id: trustedDevices.id })
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.userId, userId),
        eq(trustedDevices.tokenHash, tokenHash),
        gt(trustedDevices.expiresAt, now),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function deleteTrustedDevices(tx: Tx, userId: string): Promise<void> {
  await tx.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
}
