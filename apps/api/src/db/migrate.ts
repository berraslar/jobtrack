import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/** apps/api/migrations — hem src/ hem dist/ altından aynı göreli yol. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Migration'ları ada göre sırayla, her birini ayrı transaction'da ve bir kez uygular (ADR-0004). */
export async function runMigrations(
  url: string,
  dir: string = MIGRATIONS_DIR,
  log: (message: string) => void = console.log,
): Promise<string[]> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  const applied: string[] = [];
  try {
    // Aynı anda iki migration süreci çalışmasın.
    await sql`select pg_advisory_lock(hashtext('jobtrack_migrations'))`;
    await sql`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )`;
    // Varsayılan yetkiler uygulamaya DML verir; migration kaydına uygulama dokunamaz.
    await sql`revoke all on schema_migrations from jobtrack_app`;
    const done = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map((row) => row.name),
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dizin depodaki sabit migrations klasörü
    const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- dosya adı yukarıdaki listeden gelir
      const content = await readFile(`${dir}/${file}`, 'utf8');
      await sql.begin(async (tx) => {
        // Migration dosyası depodaki güvenilir SQL'dir; kullanıcı girdisi içermez.
        await tx.unsafe(content);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`uygulandı: ${file}`);
      applied.push(file);
    }
    return applied;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error('MIGRATION_DATABASE_URL tanımlı değil');
    process.exit(1);
  }
  runMigrations(url).then(
    (applied) => {
      console.log(applied.length ? `${String(applied.length)} migration uygulandı` : 'şema güncel');
    },
    (err: unknown) => {
      console.error('migration başarısız', err);
      process.exit(1);
    },
  );
}
