import type { Company, CompanyCreate, CompanyDetail, CompanyUpdate } from '@jobtrack/shared';
import { withUserTx, type Db } from '../../db/client.js';
import { AppError, notFound } from '../../lib/errors.js';
import {
  pgErrorCode,
  PG_FOREIGN_KEY_VIOLATION,
  PG_RESTRICT_VIOLATION,
  PG_UNIQUE_VIOLATION,
  withoutUndefined,
} from '../../lib/http.js';
import { listApplications } from '../applications/applications.repository.js';
import { toApplication } from '../applications/applications.service.js';
import * as repo from './companies.repository.js';

const duplicateName = () =>
  new AppError(409, 'Bu adda bir şirket zaten var.', 'company_name_taken');

export function toCompany(row: repo.CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    website: row.website,
    notes: row.notes,
    applicationCount: row.applicationCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** FR-13: şirket kayıtları ve bir şirketin tüm başvuruları. */
export class CompanyService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(userId: string): Promise<Company[]> {
    return withUserTx(this.db, userId, async (tx) => (await repo.listCompanies(tx)).map(toCompany));
  }

  get(userId: string, id: string): Promise<CompanyDetail> {
    return withUserTx(this.db, userId, async (tx) => {
      const row = await repo.getCompany(tx, id);
      if (!row) throw notFound();
      const applications = await listApplications(
        tx,
        { archived: 'include', companyId: id },
        this.now(),
      );
      return { ...toCompany(row), applications: applications.map(toApplication) };
    });
  }

  async create(userId: string, input: CompanyCreate): Promise<Company> {
    try {
      return await withUserTx(this.db, userId, async (tx) => {
        const id = await repo.insertCompany(tx, {
          userId,
          name: input.name,
          sector: input.sector ?? null,
          website: input.website ?? null,
          notes: input.notes ?? null,
        });
        const row = await repo.getCompany(tx, id);
        if (!row) throw notFound();
        return toCompany(row);
      });
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw duplicateName();
      throw err;
    }
  }

  async update(userId: string, id: string, input: CompanyUpdate): Promise<Company> {
    try {
      return await withUserTx(this.db, userId, async (tx) => {
        if (!(await repo.updateCompany(tx, id, withoutUndefined(input)))) throw notFound();
        const row = await repo.getCompany(tx, id);
        if (!row) throw notFound();
        return toCompany(row);
      });
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw duplicateName();
      throw err;
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    try {
      await withUserTx(this.db, userId, async (tx) => {
        if (!(await repo.deleteCompany(tx, id))) throw notFound();
      });
    } catch (err) {
      const code = pgErrorCode(err);
      if (code === PG_RESTRICT_VIOLATION || code === PG_FOREIGN_KEY_VIOLATION) {
        throw new AppError(
          409,
          'Bu şirkete bağlı başvurular var. Önce başvuruları silin.',
          'company_has_applications',
        );
      }
      throw err;
    }
  }
}
