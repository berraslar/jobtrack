import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Database {
  db: Db;
  close: () => Promise<void>;
}

export function createDatabase(url: string): Database {
  const client = postgres(url, { max: 10, onnotice: () => undefined });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

/**
 * Kullanıcıya ait her veritabanı işi bu fonksiyonla yapılır (ADR-0002).
 * Transaction'ın ilk komutu `app.user_id` ayarını yapar (SET LOCAL); RLS politikaları bu değeri kullanır.
 * Ayar transaction bitince kaybolur, havuzdaki bağlantıya sızmaz. Hata olursa her şey geri alınır (A10).
 */
export function withUserTx<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Bekleyen kayıt işleri (FR-01/FR-18). Transaction'ın ilk komutu, kayıt çerezindeki token'ın özetini
 * `app.registration_token` olarak ayarlar; RLS yalnızca o kaydı gösterir. `userId` verilirse aynı
 * transaction'da kullanıcı bağlamı da kurulur (kod doğrulanınca hesap atomik olarak açılır).
 */
export function withRegistrationTx<T>(
  db: Db,
  tokenHash: Buffer,
  fn: (tx: Tx) => Promise<T>,
  userId?: string,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.registration_token', ${tokenHash.toString('hex')}, true)`,
    );
    if (userId) await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
