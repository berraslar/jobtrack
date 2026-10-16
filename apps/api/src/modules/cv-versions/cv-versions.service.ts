import { type CvVersion, type CvVersionCreate, type CvVersionUpdate } from '@jobtrack/shared';
import { withUserTx, type Db } from '../../db/client.js';
import { AppError, notFound } from '../../lib/errors.js';
import { assertPdf } from '../../lib/pdf.js';
import { pgErrorCode, PG_UNIQUE_VIOLATION, withoutUndefined } from '../../lib/http.js';
import * as repo from './cv-versions.repository.js';

const duplicateLabel = () =>
  new AppError(409, 'Bu etiketle bir CV versiyonu zaten var.', 'cv_version_label_taken');

const fileNotFound = () => new AppError(404, 'Bu versiyonun dosyası yok.', 'cv_file_not_found');

export interface CvFile {
  fileName: string;
  contentType: string;
  data: Buffer;
}

function toCvVersion(row: repo.CvVersionRow): CvVersion {
  return {
    id: row.id,
    label: row.label,
    fileName: row.fileName,
    file:
      row.fileSizeBytes !== null && row.fileUploadedAt !== null
        ? { sizeBytes: row.fileSizeBytes, uploadedAt: row.fileUploadedAt.toISOString() }
        : null,
    applicationCount: row.applicationCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** FR-08: CV versiyonları. Silinen versiyonun başvurulardaki bağlantısı kalkar, başvuru kalır. */
export class CvVersionService {
  constructor(private readonly db: Db) {}

  list(userId: string): Promise<CvVersion[]> {
    return withUserTx(this.db, userId, async (tx) =>
      (await repo.listCvVersions(tx)).map(toCvVersion),
    );
  }

  async create(userId: string, input: CvVersionCreate): Promise<CvVersion> {
    try {
      return await withUserTx(this.db, userId, async (tx) => {
        const id = await repo.insertCvVersion(tx, {
          userId,
          label: input.label,
          fileName: input.fileName ?? null,
        });
        const row = await repo.getCvVersion(tx, id);
        if (!row) throw notFound();
        return toCvVersion(row);
      });
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw duplicateLabel();
      throw err;
    }
  }

  async update(userId: string, id: string, input: CvVersionUpdate): Promise<CvVersion> {
    try {
      return await withUserTx(this.db, userId, async (tx) => {
        if (!(await repo.updateCvVersion(tx, id, withoutUndefined(input)))) throw notFound();
        const row = await repo.getCvVersion(tx, id);
        if (!row) throw notFound();
        return toCvVersion(row);
      });
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw duplicateLabel();
      throw err;
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    await withUserTx(this.db, userId, async (tx) => {
      if (!(await repo.deleteCvVersion(tx, id))) throw notFound();
    });
  }

  /** Versiyonu dosyasıyla tek transaction'da oluşturur: dosya geçersizse versiyon da oluşmaz. */
  async createWithFile(
    userId: string,
    input: { label: string; fileName: string; data: Buffer },
  ): Promise<CvVersion> {
    assertPdf(input.data);
    try {
      return await withUserTx(this.db, userId, async (tx) => {
        const id = await repo.insertCvVersion(tx, {
          userId,
          label: input.label,
          fileName: input.fileName,
        });
        await repo.putCvFile(tx, { cvVersionId: id, userId, ...input });
        const row = await repo.getCvVersion(tx, id);
        if (!row) throw notFound();
        return toCvVersion(row);
      });
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw duplicateLabel();
      throw err;
    }
  }

  async replaceFile(
    userId: string,
    id: string,
    input: { fileName: string; data: Buffer },
  ): Promise<CvVersion> {
    assertPdf(input.data);
    return withUserTx(this.db, userId, async (tx) => {
      if (!(await repo.getCvVersion(tx, id))) throw notFound();
      await repo.putCvFile(tx, { cvVersionId: id, userId, ...input });
      const row = await repo.getCvVersion(tx, id);
      if (!row) throw notFound();
      return toCvVersion(row);
    });
  }

  async getFile(userId: string, id: string): Promise<CvFile> {
    const file = await withUserTx(this.db, userId, (tx) => repo.getCvFile(tx, id));
    if (!file) throw fileNotFound();
    return file;
  }

  async deleteFile(userId: string, id: string): Promise<void> {
    await withUserTx(this.db, userId, async (tx) => {
      if (!(await repo.deleteCvFile(tx, id))) throw fileNotFound();
    });
  }
}
