import { createInterface } from 'node:readline/promises';
import { emailSchema, passwordSchema } from '@jobtrack/shared';
import postgres from 'postgres';
import { hashPassword } from '../lib/password.js';

/**
 * Sunucu tarafında parola sıfırlama (ADR-0003: MVP'de e-posta ile sıfırlama yok).
 * Yönetici bağlantısıyla (MIGRATION_DATABASE_URL) çalışır; tüm oturumları kapatır ve denetim kaydı yazar.
 *
 *   docker compose run --rm -it migrate node dist/cli/reset-password.js berra@example.com
 */
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  const emailArg = process.argv[2];
  if (!url || !emailArg) {
    console.error('Kullanım: MIGRATION_DATABASE_URL=... reset-password <e-posta>');
    process.exit(1);
  }
  const email = emailSchema.parse(emailArg);

  // Parola argüman olarak alınmaz (kabuk geçmişine ve süreç listesine düşmesin); stdin'den okunur.
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const password = passwordSchema.parse(await rl.question('Yeni parola: '));
  rl.close();

  const passwordHash = await hashPassword(password);
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const updated = await sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        update users set password_hash = ${passwordHash}, updated_at = now()
        where email = ${email} returning id`;
      const user = rows[0];
      if (!user) return false;
      await tx`delete from sessions where user_id = ${user.id}`;
      // Güvenilen cihazlar da unutulur; sonraki girişte e-posta kodu istenir (ADR-0007).
      await tx`delete from trusted_devices where user_id = ${user.id}`;
      await tx`insert into audit_log (user_id, event) values (${user.id}, 'password_reset')`;
      return true;
    });
    console.error(
      updated ? 'Parola güncellendi, tüm oturumlar kapatıldı.' : 'Kullanıcı bulunamadı.',
    );
    process.exitCode = updated ? 0 : 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
