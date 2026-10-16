import type { FastifyInstance } from 'fastify';
import { APPLICATION_STAGES, type Stats } from '@jobtrack/shared';
import { withUserTx, type Db } from '../../db/client.js';
import { requireUserId } from '../../lib/http.js';
import { todayIn } from '../applications/applications.service.js';
import * as repo from './stats.repository.js';

export class StatsService {
  constructor(
    private readonly db: Db,
    private readonly timeZone: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(userId: string): Promise<Stats> {
    return withUserTx(this.db, userId, async (tx) => {
      const now = this.now();
      const stageCounts = new Map(
        (await repo.countByStage(tx)).map((row) => [row.stage, row.count]),
      );
      return {
        // Her aşama, sayısı 0 olsa bile akış sırasıyla döner.
        byStage: APPLICATION_STAGES.map((stage) => ({ stage, count: stageCounts.get(stage) ?? 0 })),
        overall: await repo.overallFunnel(tx),
        byCvVersion: [...(await repo.funnelByCvVersion(tx))],
        bySource: [...(await repo.funnelBySource(tx))],
        weekly: [...(await repo.weeklyApplications(tx, todayIn(this.timeZone, now)))],
        followUpCount: await repo.countFollowUps(tx, now),
        nextInterview: await repo.nextInterview(tx, now),
      };
    });
  }
}

export async function statsRoutes(app: FastifyInstance, opts: { service: StatsService }) {
  app.get('/', async (request): Promise<Stats> => opts.service.get(requireUserId(request)));
}
