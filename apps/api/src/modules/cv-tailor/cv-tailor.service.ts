import type {
  JobDescription,
  MasterCv,
  MasterCvImport,
  TailorDraft,
  TailoredCv,
  TailoredCvCreateParsed,
} from '@jobtrack/shared';
import { withUserTx, type Db } from '../../db/client.js';
import { AttemptLimiter } from '../../lib/attempt-limiter.js';
import { AppError, notFound } from '../../lib/errors.js';
import { assertPdf } from '../../lib/pdf.js';
import { checkFabrication } from '../ai/fabrication.js';
import { maskPii, restorePii } from '../ai/masking.js';
import { aiDisabled, type CvTailorProvider } from '../ai/provider.js';
import { disabledExtractor, unreadable, type TextExtractor } from '../profile/cv-parser-client.js';
import { getProfile } from '../profile/profile.repository.js';
import { cvTextToMarkdown } from './cv-to-markdown.js';
import * as repo from './cv-tailor.repository.js';

export interface CvTailorServiceDeps {
  db: Db;
  /** ADR-0010: tanımsızsa yapay zekâ özelliği kapalıdır. */
  ai?: CvTailorProvider | null;
  /** ADR-0008: yalıtılmış CV ayrıştırıcısı; tanımsızsa PDF'ten Ana CV kapalıdır. */
  extractText?: TextExtractor;
  now?: () => Date;
}

const toMasterCv = (row: repo.MasterCvRow | null): MasterCv =>
  row
    ? { markdown: row.markdown, updatedAt: row.updatedAt.toISOString() }
    : { markdown: '', updatedAt: null };

export const toTailoredCv = (row: repo.TailoredCvRow): TailoredCv => ({
  id: row.id,
  applicationId: row.applicationId,
  markdown: row.markdown,
  matchScore: row.matchScore,
  missingKeywords: row.missingKeywords,
  changes: row.changes,
  model: row.model,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const jobDescriptionMissing = () =>
  new AppError(422, 'Önce ilan metnini yapıştırıp kaydedin.', 'job_description_missing');
const masterCvMissing = () => new AppError(422, 'Önce Ana CV’nizi kaydedin.', 'master_cv_missing');
const tooManyTailorRequests = () =>
  new AppError(
    429,
    'Kısa sürede çok fazla uyarlama istendi. Bir dakika sonra tekrar deneyin.',
    'tailor_rate_limited',
  );

/** FR-23 (Ana CV, ilan metni) ve FR-24 (yapay zekâ ile uyarlama, sürümler). */
export class CvTailorService {
  private readonly now: () => Date;
  /** ADR-0010: kullanıcı başına dakikada 5 uyarlama isteği. */
  private readonly limiter: AttemptLimiter;

  constructor(private readonly deps: CvTailorServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.limiter = new AttemptLimiter(5, 60_000, () => this.now().getTime());
  }

  get aiEnabled(): boolean {
    return Boolean(this.deps.ai);
  }

  getMasterCv(userId: string): Promise<MasterCv> {
    return withUserTx(this.deps.db, userId, async (tx) => toMasterCv(await repo.getMasterCv(tx)));
  }

  putMasterCv(userId: string, markdown: string): Promise<MasterCv> {
    return withUserTx(this.deps.db, userId, async (tx) =>
      toMasterCv(await repo.putMasterCv(tx, userId, markdown, this.now())),
    );
  }

  /**
   * FR-23: PDF CV'den Ana CV taslağı. Dosya ve metin saklanmaz, loglanmaz; kullanıcı taslağı
   * düzenleyip kaydedene kadar veritabanına hiçbir şey yazılmaz.
   */
  async importMasterCv(_userId: string, pdf: Buffer): Promise<MasterCvImport> {
    assertPdf(pdf);
    const { text, method } = await (this.deps.extractText ?? disabledExtractor)(pdf);
    const markdown = cvTextToMarkdown(text);
    if (!markdown) throw unreadable();
    return { markdown, method };
  }

  getJobDescription(userId: string, applicationId: string): Promise<JobDescription> {
    return withUserTx(this.deps.db, userId, async (tx) => {
      const row = await repo.getJobDescription(tx, applicationId);
      if (!row) throw notFound();
      return row;
    });
  }

  setJobDescription(
    userId: string,
    applicationId: string,
    jobDescription: string | null,
  ): Promise<JobDescription> {
    return withUserTx(this.deps.db, userId, async (tx) => {
      const row = await repo.setJobDescription(tx, applicationId, jobDescription);
      if (!row) throw notFound();
      return row;
    });
  }

  /**
   * İlana göre uyarlama taslağı üretir; veritabanına yazmaz (ADR-0010). Ana CV maskelenip
   * sağlayıcıya gider, yanıt şemadan geçer, kişisel bilgiler geri yerleştirilir ve çıktı uydurma
   * denetiminden geçer. Onay (consent) rotada doğrulanır.
   */
  async tailor(
    userId: string,
    applicationId: string,
    extraMaskTerms: string[],
    onePage = true,
  ): Promise<TailorDraft> {
    const ai = this.deps.ai;
    if (!ai) throw aiDisabled();

    // Veritabanı işi kısa bir transaction'da; sağlayıcı çağrısı transaction dışında yapılır.
    const { context, master, profile } = await withUserTx(this.deps.db, userId, async (tx) => ({
      context: await repo.getTailorContext(tx, applicationId),
      master: await repo.getMasterCv(tx),
      profile: await getProfile(tx),
    }));
    if (!context) throw notFound();
    if (!context.jobDescription?.trim()) throw jobDescriptionMissing();
    if (!master?.markdown.trim()) throw masterCvMissing();

    if (this.limiter.isBlocked(userId)) throw tooManyTailorRequests();
    this.limiter.fail(userId);

    const { masked, mapping } = maskPii(master.markdown, {
      fullName: profile?.fullName,
      email: profile?.email,
      phone: profile?.phone,
      location: profile?.location,
      links: [profile?.website, profile?.linkedin, profile?.github],
      extraTerms: extraMaskTerms,
    });

    const result = await ai.tailor({
      maskedCv: masked,
      jobDescription: context.jobDescription,
      positionTitle: context.positionTitle,
      companyName: context.companyName,
      onePage,
    });

    const restored = restorePii(result.tailoredMarkdown, mapping);
    const restoreAll = (items: string[]) => items.map((item) => restorePii(item, mapping).text);
    const warnings = [
      ...restored.unknownPlaceholders.map((text) => ({ kind: 'placeholder' as const, text })),
      ...checkFabrication(restored.text, {
        masterCv: master.markdown,
        knownCompanies: (profile?.experience ?? [])
          .map((e) => e.company)
          .filter((company): company is string => Boolean(company)),
      }),
    ];

    return {
      tailoredMarkdown: restored.text,
      matchScore: result.matchScore,
      missingKeywords: restoreAll(result.missingKeywords),
      changes: restoreAll(result.changes),
      warnings,
      maskedCount: mapping.size,
      model: result.model ?? ai.model,
    };
  }

  listTailoredCvs(userId: string, applicationId: string): Promise<TailoredCv[]> {
    return withUserTx(this.deps.db, userId, async (tx) => {
      if (!(await repo.applicationExists(tx, applicationId))) throw notFound();
      return (await repo.listTailoredCvs(tx, applicationId)).map(toTailoredCv);
    });
  }

  createTailoredCv(
    userId: string,
    applicationId: string,
    input: TailoredCvCreateParsed,
  ): Promise<TailoredCv> {
    return withUserTx(this.deps.db, userId, async (tx) => {
      // Başvuru RLS altında aranır: başkasının başvurusuna sürüm iliştirilemez (404).
      if (!(await repo.applicationExists(tx, applicationId))) throw notFound();
      const row = await repo.insertTailoredCv(tx, { userId, applicationId, ...input }, this.now());
      return toTailoredCv(row);
    });
  }

  getTailoredCv(userId: string, id: string): Promise<TailoredCv> {
    return withUserTx(this.deps.db, userId, async (tx) => {
      const row = await repo.getTailoredCv(tx, id);
      if (!row) throw notFound();
      return toTailoredCv(row);
    });
  }

  updateTailoredCv(userId: string, id: string, markdown: string): Promise<TailoredCv> {
    return withUserTx(this.deps.db, userId, async (tx) => {
      const row = await repo.updateTailoredCv(tx, id, markdown, this.now());
      if (!row) throw notFound();
      return toTailoredCv(row);
    });
  }

  async deleteTailoredCv(userId: string, id: string): Promise<void> {
    const deleted = await withUserTx(this.deps.db, userId, (tx) => repo.deleteTailoredCv(tx, id));
    if (!deleted) throw notFound();
  }
}
