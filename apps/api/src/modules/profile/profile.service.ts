import {
  EMPTY_PROFILE,
  type Profile,
  type ProfileDraft,
  type ProfileUpdate,
} from '@jobtrack/shared';
import { withUserTx, type Db } from '../../db/client.js';
import { AppError, notFound } from '../../lib/errors.js';
import { getCvFile, getCvVersion } from '../cv-versions/cv-versions.repository.js';
import { parseCvText } from './cv-parse.js';
import { unreadable, type TextExtractor } from './cv-parser-client.js';
import * as repo from './profile.repository.js';

const fileMissing = () => new AppError(404, 'Bu versiyonun dosyası yok.', 'cv_file_not_found');

export function toProfile(row: repo.ProfileRow | null): Profile {
  if (!row) return { ...EMPTY_PROFILE, updatedAt: null };
  return {
    fullName: row.fullName,
    headline: row.headline,
    email: row.email,
    phone: row.phone,
    location: row.location,
    website: row.website,
    linkedin: row.linkedin,
    github: row.github,
    summary: row.summary,
    skills: row.skills,
    languages: row.languages,
    experience: row.experience,
    education: row.education,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ProfileServiceDeps {
  db: Db;
  extractText: TextExtractor;
  now?: () => Date;
}

/** FR-20 (profil) ve FR-21 (CV'den öneri; onaysız hiçbir şey kaydedilmez). */
export class ProfileService {
  private readonly now: () => Date;

  constructor(private readonly deps: ProfileServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get(userId: string): Promise<Profile> {
    return withUserTx(this.deps.db, userId, async (tx) => toProfile(await repo.getProfile(tx)));
  }

  put(userId: string, input: ProfileUpdate): Promise<Profile> {
    return withUserTx(this.deps.db, userId, async (tx) =>
      toProfile(await repo.putProfile(tx, userId, input, this.now())),
    );
  }

  async delete(userId: string): Promise<void> {
    await withUserTx(this.deps.db, userId, (tx) => repo.deleteProfile(tx, userId));
  }

  /** CV dosyasını okuyup öneri üretir; veritabanına yazmaz. */
  async extract(userId: string, cvVersionId: string): Promise<ProfileDraft> {
    // Dosya RLS altında okunur: başkasının versiyonu "yok" görünür (404).
    const file = await withUserTx(this.deps.db, userId, async (tx) => {
      if (!(await getCvVersion(tx, cvVersionId))) throw notFound();
      return getCvFile(tx, cvVersionId);
    });
    if (!file) throw fileMissing();
    const { text, method } = await this.deps.extractText(file.data);
    if (!text.trim()) throw unreadable();
    return { draft: parseCvText(text), method, cvVersionId };
  }
}
