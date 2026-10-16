import { domainLabels, type Locale } from '@jobtrack/shared';
import { and, asc, eq, gte } from 'drizzle-orm';
import { withUserTx, type Db, type Tx } from '../../db/client.js';
import { activities, applications, companies, stageHistory, users } from '../../db/schema.js';
import { hmacSha256 } from '../../lib/crypto.js';
import { toCsv } from '../../lib/csv.js';
import { notFound } from '../../lib/errors.js';
import { toIcs } from '../../lib/ics.js';
import { listApplications } from '../applications/applications.repository.js';
import { toApplication } from '../applications/applications.service.js';
import { insertAudit } from '../auth/auth.repository.js';
import { listCompanies } from '../companies/companies.repository.js';
import { toCompany } from '../companies/companies.service.js';
import { listCvVersions } from '../cv-versions/cv-versions.repository.js';
import { getMasterCv, listTailoredCvs } from '../cv-tailor/cv-tailor.repository.js';
import { toTailoredCv } from '../cv-tailor/cv-tailor.service.js';
import { getProfile } from '../profile/profile.repository.js';
import { toProfile } from '../profile/profile.service.js';

/** FR-16: dışa aktarılan dosyalar kullanıcının arayüz dilindedir. */
const EXPORT_TEXT: Record<
  Locale,
  {
    csvHeaders: string[];
    yes: string;
    no: string;
    calendarName: string;
    contact: (name: string) => string;
  }
> = {
  tr: {
    csvHeaders: [
      'Şirket',
      'Pozisyon',
      'Aşama',
      'Başvuru tarihi',
      'Kaynak',
      'Çalışma şekli',
      'Konum',
      'Maaş beklentisi',
      'CV versiyonu',
      'İlan bağlantısı',
      'Notlar',
      'Takip et',
      'Arşivde',
      'Oluşturulma',
    ],
    yes: 'Evet',
    no: 'Hayır',
    calendarName: 'JobTrack mülakatları',
    contact: (name) => `Görüşülen kişi: ${name}`,
  },
  en: {
    csvHeaders: [
      'Company',
      'Position',
      'Stage',
      'Applied on',
      'Source',
      'Work mode',
      'Location',
      'Salary expectation',
      'CV version',
      'Job posting',
      'Notes',
      'Follow up',
      'Archived',
      'Created',
    ],
    yes: 'Yes',
    no: 'No',
    calendarName: 'JobTrack interviews',
    contact: (name) => `Contact: ${name}`,
  },
};

const exportText = (locale: Locale) => (locale === 'en' ? EXPORT_TEXT.en : EXPORT_TEXT.tr);

export interface AccountServiceDeps {
  db: Db;
  ipHashKey: Buffer;
  now?: () => Date;
}

/** FR-14 (KVKK veri taşınabilirliği) ve FR-17 (takvim). */
export class AccountService {
  private readonly db: Db;
  private readonly now: () => Date;

  constructor(private readonly deps: AccountServiceDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
  }

  /** Kullanıcının tüm verisi, tek JSON belgesi. Parola hash'i, TOTP anahtarı ve oturumlar dahil edilmez. */
  async exportJson(userId: string, ip: string) {
    return withUserTx(this.db, userId, async (tx) => {
      const now = this.now();
      const [user] = await tx
        .select({
          email: users.email,
          locale: users.locale,
          followUpDays: users.followUpDays,
          totpEnabledAt: users.totpEnabledAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId));
      if (!user) throw notFound();

      const [
        companyRows,
        cvRows,
        applicationRows,
        historyRows,
        activityRows,
        profile,
        masterCv,
        jobDescriptionRows,
        tailoredRows,
      ] = await Promise.all([
        listCompanies(tx),
        listCvVersions(tx),
        listApplications(tx, { archived: 'include' }, now),
        tx.select().from(stageHistory).orderBy(asc(stageHistory.changedAt)),
        tx.select().from(activities).orderBy(asc(activities.occurredAt)),
        getProfile(tx),
        getMasterCv(tx),
        tx
          .select({ id: applications.id, jobDescription: applications.jobDescription })
          .from(applications),
        listTailoredCvs(tx),
      ]);
      const jobDescriptions = new Map(jobDescriptionRows.map((r) => [r.id, r.jobDescription]));
      await this.audit(tx, userId, ip);

      return {
        format: 'jobtrack-export',
        version: 1,
        exportedAt: now.toISOString(),
        account: {
          email: user.email,
          locale: user.locale,
          followUpDays: user.followUpDays,
          mfaEnabled: user.totpEnabledAt !== null,
          createdAt: user.createdAt.toISOString(),
        },
        // FR-20: profil de kullanıcının verisidir (KVKK veri taşınabilirliği).
        profile: profile ? toProfile(profile) : null,
        // FR-23: Ana CV ve ilan metinleri de kullanıcının verisidir.
        masterCv: masterCv
          ? { markdown: masterCv.markdown, updatedAt: masterCv.updatedAt.toISOString() }
          : null,
        companies: companyRows.map(toCompany),
        cvVersions: cvRows.map((cv) => ({
          id: cv.id,
          label: cv.label,
          fileName: cv.fileName,
          // Dosyanın kendisi CV sayfasından indirilir; JSON'a yalnızca bilgisi eklenir.
          file:
            cv.fileSizeBytes !== null && cv.fileUploadedAt !== null
              ? { sizeBytes: cv.fileSizeBytes, uploadedAt: cv.fileUploadedAt.toISOString() }
              : null,
          createdAt: cv.createdAt.toISOString(),
        })),
        applications: applicationRows.map((row) => ({
          ...toApplication(row),
          jobDescription: jobDescriptions.get(row.id) ?? null,
          // FR-24: başvuruya bağlı uyarlanmış CV sürümleri.
          tailoredCvs: tailoredRows.filter((t) => t.applicationId === row.id).map(toTailoredCv),
          stageHistory: historyRows
            .filter((h) => h.applicationId === row.id)
            .map((h) => ({
              fromStage: h.fromStage,
              toStage: h.toStage,
              changedAt: h.changedAt.toISOString(),
            })),
          activities: activityRows
            .filter((a) => a.applicationId === row.id)
            .map((a) => ({
              type: a.type,
              occurredAt: a.occurredAt.toISOString(),
              contactName: a.contactName,
              notes: a.notes,
            })),
        })),
      };
    });
  }

  /** Başvurular tablosu, elektronik tabloda açılmak üzere (kullanıcının dilinde başlık ve etiketler). */
  async exportCsv(userId: string, ip: string): Promise<string> {
    return withUserTx(this.db, userId, async (tx) => {
      const locale = await this.locale(tx, userId);
      const text = exportText(locale);
      const labels = domainLabels(locale);
      const rows = await listApplications(tx, { archived: 'include' }, this.now());
      await this.audit(tx, userId, ip);
      return toCsv(
        text.csvHeaders,
        rows.map((row) => [
          row.companyName,
          row.positionTitle,
          labels.stages[row.currentStage],
          row.appliedAt,
          row.source ? labels.sources[row.source] : null,
          row.workMode ? labels.workModes[row.workMode] : null,
          row.location,
          row.salaryExpectation,
          row.cvVersionLabel,
          row.jobUrl,
          row.notes,
          row.needsFollowUp ? text.yes : text.no,
          row.archivedAt ? text.yes : text.no,
          row.createdAt.toISOString(),
        ]),
      );
    });
  }

  /** FR-17: yaklaşan mülakatlar (.ics). Notlar takvime yazılmaz; yalnızca görüşülen kişi. */
  async upcomingInterviewsIcs(userId: string): Promise<string> {
    return withUserTx(this.db, userId, async (tx) => {
      const locale = await this.locale(tx, userId);
      const text = exportText(locale);
      const labels = domainLabels(locale);
      const rows = await tx
        .select({
          id: activities.id,
          occurredAt: activities.occurredAt,
          updatedAt: activities.updatedAt,
          contactName: activities.contactName,
          type: activities.type,
          positionTitle: applications.positionTitle,
          companyName: companies.name,
        })
        .from(activities)
        .innerJoin(applications, eq(applications.id, activities.applicationId))
        .innerJoin(companies, eq(companies.id, applications.companyId))
        .where(and(eq(activities.type, 'interview'), gte(activities.occurredAt, this.now())))
        .orderBy(asc(activities.occurredAt));
      return toIcs(
        text.calendarName,
        rows.map((row) => ({
          uid: `${row.id}@jobtrack`,
          start: row.occurredAt,
          durationMinutes: 60,
          summary: `${labels.activities[row.type]}: ${row.companyName} – ${row.positionTitle}`,
          description: row.contactName ? text.contact(row.contactName) : null,
          updatedAt: row.updatedAt,
        })),
      );
    });
  }

  private async locale(tx: Tx, userId: string): Promise<Locale> {
    const [user] = await tx
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw notFound();
    return user.locale;
  }

  private audit(tx: Tx, userId: string, ip: string): Promise<void> {
    return insertAudit(tx, {
      userId,
      event: 'data_export',
      ipHash: hmacSha256(this.deps.ipHashKey, ip),
    });
  }
}
