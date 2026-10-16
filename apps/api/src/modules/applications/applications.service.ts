import type {
  Activity,
  ActivityCreate,
  ActivityUpdate,
  Application,
  ApplicationCreate,
  ApplicationDetail,
  ApplicationListQuery,
  ApplicationStage,
  ApplicationUpdate,
} from '@jobtrack/shared';
import { withUserTx, type Db, type Tx } from '../../db/client.js';
import { AppError, notFound } from '../../lib/errors.js';
import { iso, pgErrorCode, PG_UNIQUE_VIOLATION, withoutUndefined } from '../../lib/http.js';
import * as companies from '../companies/companies.repository.js';
import * as cvVersions from '../cv-versions/cv-versions.repository.js';
import * as repo from './applications.repository.js';

export function toApplication(row: repo.ApplicationRow): Application {
  return {
    id: row.id,
    company: { id: row.companyId, name: row.companyName },
    cvVersion:
      row.cvVersionId && row.cvVersionLabel
        ? { id: row.cvVersionId, label: row.cvVersionLabel }
        : null,
    positionTitle: row.positionTitle,
    jobUrl: row.jobUrl,
    source: row.source,
    location: row.location,
    workMode: row.workMode,
    salaryExpectation: row.salaryExpectation,
    currentStage: row.currentStage,
    appliedAt: row.appliedAt,
    archivedAt: iso(row.archivedAt),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastActivityAt: new Date(row.lastActivityMs).toISOString(),
    needsFollowUp: row.needsFollowUp,
  };
}

function toActivity(row: repo.ActivityRow): Activity {
  return {
    id: row.id,
    applicationId: row.applicationId,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    contactName: row.contactName,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Kullanıcının takvimindeki bugünün tarihi (YYYY-AA-GG). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export interface ApplicationServiceDeps {
  db: Db;
  timeZone: string;
  now?: () => Date;
}

/** FR-04, FR-05, FR-06, FR-07, FR-15 */
export class ApplicationService {
  private readonly db: Db;
  private readonly now: () => Date;

  constructor(private readonly deps: ApplicationServiceDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
  }

  list(userId: string, query: ApplicationListQuery): Promise<Application[]> {
    return withUserTx(this.db, userId, async (tx) =>
      (await repo.listApplications(tx, query, this.now())).map(toApplication),
    );
  }

  get(userId: string, id: string): Promise<ApplicationDetail> {
    return withUserTx(this.db, userId, (tx) => this.detail(tx, id));
  }

  /** NFR-09: tek form. Şirket adı verildiyse var olan kullanılır, yoksa oluşturulur. */
  async create(userId: string, input: ApplicationCreate): Promise<ApplicationDetail> {
    return withUserTx(this.db, userId, async (tx) => {
      const companyId =
        'companyId' in input
          ? await this.requireCompany(tx, input.companyId)
          : await this.findOrCreateCompany(tx, userId, input.companyName);
      if (input.cvVersionId) await this.requireCvVersion(tx, input.cvVersionId);

      const id = await repo.insertApplication(tx, {
        userId,
        companyId,
        positionTitle: input.positionTitle,
        cvVersionId: input.cvVersionId ?? null,
        jobUrl: input.jobUrl ?? null,
        source: input.source ?? null,
        location: input.location ?? null,
        workMode: input.workMode ?? null,
        salaryExpectation: input.salaryExpectation ?? null,
        appliedAt: input.appliedAt ?? null,
        notes: input.notes ?? null,
      });
      return this.detail(tx, id);
    });
  }

  async update(userId: string, id: string, input: ApplicationUpdate): Promise<ApplicationDetail> {
    return withUserTx(this.db, userId, async (tx) => {
      if (input.companyId) await this.requireCompany(tx, input.companyId);
      if (input.cvVersionId) await this.requireCvVersion(tx, input.cvVersionId);
      if (!(await repo.updateApplication(tx, id, withoutUndefined(input)))) throw notFound();
      return this.detail(tx, id);
    });
  }

  /**
   * FR-05/FR-06: aşama değişikliği. Geçmiş kaydını veritabanı trigger'ı aynı transaction'da yazar.
   * "Kaydedildi" dışındaki bir aşamaya geçildiğinde başvuru tarihi boşsa bugün olarak doldurulur.
   */
  async changeStage(
    userId: string,
    id: string,
    stage: ApplicationStage,
  ): Promise<ApplicationDetail> {
    return withUserTx(this.db, userId, async (tx) => {
      const current = await repo.getApplication(tx, id, this.now());
      if (!current) throw notFound();
      if (current.currentStage === stage) {
        throw new AppError(409, 'Başvuru zaten bu aşamada.', 'stage_unchanged');
      }
      const appliedAt =
        stage !== 'saved' && current.appliedAt === null
          ? todayIn(this.deps.timeZone, this.now())
          : undefined;
      await repo.updateApplication(tx, id, {
        currentStage: stage,
        ...(appliedAt ? { appliedAt } : {}),
      });
      return this.detail(tx, id);
    });
  }

  /** FR-15: arşivleme geri alınabilir; arşivdeki başvurular varsayılan listede görünmez. */
  async setArchived(userId: string, id: string, archived: boolean): Promise<ApplicationDetail> {
    return withUserTx(this.db, userId, async (tx) => {
      if (!(await repo.updateApplication(tx, id, { archivedAt: archived ? this.now() : null }))) {
        throw notFound();
      }
      return this.detail(tx, id);
    });
  }

  /** Kalıcı silme. Aşama geçmişi ve etkinlikler de silinir (KVKK: veri sahibinin silme hakkı). */
  async delete(userId: string, id: string): Promise<void> {
    await withUserTx(this.db, userId, async (tx) => {
      if (!(await repo.deleteApplication(tx, id))) throw notFound();
    });
  }

  async addActivity(
    userId: string,
    applicationId: string,
    input: ActivityCreate,
  ): Promise<Activity> {
    return withUserTx(this.db, userId, async (tx) => {
      if (!(await repo.getApplication(tx, applicationId, this.now()))) throw notFound();
      const id = await repo.insertActivity(tx, {
        userId,
        applicationId,
        type: input.type,
        occurredAt: new Date(input.occurredAt),
        contactName: input.contactName ?? null,
        notes: input.notes ?? null,
      });
      await repo.touchApplication(tx, applicationId);
      return this.requireActivity(tx, id);
    });
  }

  async updateActivity(userId: string, id: string, input: ActivityUpdate): Promise<Activity> {
    return withUserTx(this.db, userId, async (tx) => {
      const { occurredAt, ...rest } = input;
      const values = withoutUndefined({
        ...rest,
        ...(occurredAt === undefined ? {} : { occurredAt: new Date(occurredAt) }),
      });
      if (!(await repo.updateActivity(tx, id, values))) throw notFound();
      return this.requireActivity(tx, id);
    });
  }

  async deleteActivity(userId: string, id: string): Promise<void> {
    await withUserTx(this.db, userId, async (tx) => {
      if (!(await repo.deleteActivity(tx, id))) throw notFound();
    });
  }

  private async detail(tx: Tx, id: string): Promise<ApplicationDetail> {
    const row = await repo.getApplication(tx, id, this.now());
    if (!row) throw notFound();
    const [history, activityRows] = await Promise.all([
      repo.listStageHistory(tx, id),
      repo.listActivities(tx, id),
    ]);
    return {
      ...toApplication(row),
      stageHistory: history.map((entry) => ({
        id: entry.id,
        fromStage: entry.fromStage,
        toStage: entry.toStage,
        changedAt: entry.changedAt.toISOString(),
      })),
      activities: activityRows.map(toActivity),
    };
  }

  private async requireActivity(tx: Tx, id: string): Promise<Activity> {
    const row = await repo.getActivity(tx, id);
    if (!row) throw notFound();
    return toActivity(row);
  }

  /** Başvuruya bağlanacak şirket kullanıcının kendi şirketi olmalı (RLS dışındakiler görünmez). */
  private async requireCompany(tx: Tx, companyId: string): Promise<string> {
    if (!(await companies.getCompany(tx, companyId))) {
      throw new AppError(400, 'Seçilen şirket bulunamadı.', 'company_not_found');
    }
    return companyId;
  }

  private async requireCvVersion(tx: Tx, cvVersionId: string): Promise<void> {
    if (!(await cvVersions.getCvVersion(tx, cvVersionId))) {
      throw new AppError(400, 'Seçilen CV versiyonu bulunamadı.', 'cv_version_not_found');
    }
  }

  private async findOrCreateCompany(tx: Tx, userId: string, name: string): Promise<string> {
    const existing = await companies.findCompanyIdByName(tx, name);
    if (existing) return existing;
    try {
      return await companies.insertCompany(tx, {
        userId,
        name,
        sector: null,
        website: null,
        notes: null,
      });
    } catch (err) {
      // Eşzamanlı aynı adla oluşturma: transaction iptal olduğu için istemci tekrar denemeli.
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
        throw new AppError(409, 'Şirket aynı anda oluşturuldu, lütfen tekrar deneyin.', 'retry');
      }
      throw err;
    }
  }
}
