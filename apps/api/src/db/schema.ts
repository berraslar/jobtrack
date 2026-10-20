import {
  ACTIVITY_TYPES,
  APPLICATION_SOURCES,
  APPLICATION_STAGES,
  WORK_MODES,
  type Education,
  type Experience,
} from '@jobtrack/shared';
import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Şema migrations/*.sql dosyalarında tanımlıdır (ADR-0004); bu dosya onun tipli aynasıdır.
// Entegrasyon testleri ikisinin uyumlu olduğunu gerçek veritabanında doğrular.

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabledAt: timestamptz('totp_enabled_at'),
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  locale: text('locale', { enum: ['tr', 'en'] }).notNull(),
  emailVerifiedAt: timestamptz('email_verified_at'),
  // Varsayılan veritabanındadır (14 gün); ekleme sırasında verilmesi gerekmez.
  followUpDays: integer('follow_up_days').notNull().default(14),
  createdAt: timestamptz('created_at').notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  tokenHash: bytea('token_hash').notNull(),
  mfaPending: boolean('mfa_pending').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamptz('created_at').notNull(),
  lastSeenAt: timestamptz('last_seen_at').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
});

/** FR-18/FR-19 (0006): e-posta kodları; kodun yalnızca HMAC özeti saklanır. */
export const emailCodes = pgTable('email_codes', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  purpose: text('purpose', { enum: ['login', 'account_delete'] }).notNull(),
  codeHash: bytea('code_hash').notNull(),
  attempts: integer('attempts').notNull(),
  createdAt: timestamptz('created_at').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
  consumedAt: timestamptz('consumed_at'),
});

/** FR-19 (0006): e-posta koduyla doğrulanmış cihazlar. */
export const trustedDevices = pgTable('trusted_devices', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  tokenHash: bytea('token_hash').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamptz('created_at').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
});

/**
 * FR-01/FR-18 (0010): e-postası doğrulanmayı bekleyen kayıt. `passwordHash` NULL ise e-posta zaten
 * kayıtlıdır; satır yalnızca yanıtı ayırt edilemez kılmak için vardır ve hiçbir kod onu doğrulamaz.
 */
export const pendingRegistrations = pgTable('pending_registrations', {
  id: uuid('id').primaryKey(),
  tokenHash: bytea('token_hash').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  locale: text('locale', { enum: ['tr', 'en'] }).notNull(),
  codeHash: bytea('code_hash').notNull(),
  codeCreatedAt: timestamptz('code_created_at').notNull(),
  codeExpiresAt: timestamptz('code_expires_at').notNull(),
  attempts: integer('attempts').notNull(),
  emailsSent: integer('emails_sent').notNull(),
  createdAt: timestamptz('created_at').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
});

export const mfaRecoveryCodes = pgTable('mfa_recovery_codes', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  codeHash: bytea('code_hash').notNull(),
  usedAt: timestamptz('used_at'),
  createdAt: timestamptz('created_at').notNull(),
});

export const AUDIT_EVENTS = [
  'register',
  'login_success',
  'login_failed',
  'mfa_enabled',
  'mfa_recovery_used',
  'logout_all',
  'password_reset',
  'data_export',
  'account_deleted',
  'email_verified',
  'email_code_failed',
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  event: text('event', { enum: AUDIT_EVENTS }).notNull(),
  ipHash: bytea('ip_hash'),
  createdAt: timestamptz('created_at').notNull(),
});

// Faz 2: alan modeli (migrations/0002_domain.sql)

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  sector: text('sector'),
  website: text('website'),
  notes: text('notes'),
  createdAt: timestamptz('created_at').notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
});

export const cvVersions = pgTable('cv_versions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  label: text('label').notNull(),
  fileName: text('file_name'),
  createdAt: timestamptz('created_at').notNull(),
});

/** FR-08, ADR-0006: CV versiyonunun PDF dosyası (0005_cv_files.sql). */
export const cvFiles = pgTable('cv_files', {
  cvVersionId: uuid('cv_version_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  data: bytea('data').notNull(),
  uploadedAt: timestamptz('uploaded_at').notNull(),
});

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  companyId: uuid('company_id').notNull(),
  cvVersionId: uuid('cv_version_id'),
  positionTitle: text('position_title').notNull(),
  jobUrl: text('job_url'),
  source: text('source', { enum: APPLICATION_SOURCES }),
  location: text('location'),
  workMode: text('work_mode', { enum: WORK_MODES }),
  salaryExpectation: text('salary_expectation'),
  currentStage: text('current_stage', { enum: APPLICATION_STAGES }).notNull(),
  appliedAt: date('applied_at', { mode: 'string' }),
  archivedAt: timestamptz('archived_at'),
  notes: text('notes'),
  /** FR-23: ilan metni; liste yanıtlarına girmez. */
  jobDescription: text('job_description'),
  createdAt: timestamptz('created_at').notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
});

export const stageHistory = pgTable('stage_history', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  applicationId: uuid('application_id').notNull(),
  fromStage: text('from_stage', { enum: APPLICATION_STAGES }),
  toStage: text('to_stage', { enum: APPLICATION_STAGES }).notNull(),
  changedAt: timestamptz('changed_at').notNull(),
});

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  applicationId: uuid('application_id').notNull(),
  type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
  occurredAt: timestamptz('occurred_at').notNull(),
  contactName: text('contact_name'),
  notes: text('notes'),
  createdAt: timestamptz('created_at').notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  fullName: text('full_name'),
  headline: text('headline'),
  email: text('email'),
  phone: text('phone'),
  location: text('location'),
  website: text('website'),
  linkedin: text('linkedin'),
  github: text('github'),
  summary: text('summary'),
  skills: jsonb('skills').$type<string[]>().notNull(),
  languages: jsonb('languages').$type<string[]>().notNull(),
  experience: jsonb('experience').$type<Experience[]>().notNull(),
  education: jsonb('education').$type<Education[]>().notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
});

/** FR-23 (ADR-0010): kullanıcı başına tek Ana CV, Markdown. */
export const masterCvs = pgTable('master_cvs', {
  userId: uuid('user_id').primaryKey(),
  markdown: text('markdown').notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
});

/** FR-24 (ADR-0010): başvuruya bağlı, ilana göre uyarlanmış CV sürümleri. */
export const tailoredCvs = pgTable('tailored_cvs', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  applicationId: uuid('application_id').notNull(),
  markdown: text('markdown').notNull(),
  matchScore: smallint('match_score'),
  missingKeywords: jsonb('missing_keywords').$type<string[]>().notNull(),
  changes: jsonb('changes').$type<string[]>().notNull(),
  model: text('model'),
  createdAt: timestamptz('created_at').notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
});
