import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';

const config = loadConfig();
const database = createDatabase(config.DATABASE_URL);
const app = buildApp(config, { db: database.db });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'kapatılıyor');
  await app.close();
  await database.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.fatal({ err }, 'sunucu başlatılamadı');
  process.exit(1);
}
