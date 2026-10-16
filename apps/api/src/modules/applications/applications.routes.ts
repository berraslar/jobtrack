import type { FastifyInstance } from 'fastify';
import {
  activityCreateSchema,
  activityUpdateSchema,
  applicationCreateSchema,
  applicationListQuerySchema,
  applicationUpdateSchema,
  stageChangeSchema,
  type Activity,
  type Application,
  type ApplicationDetail,
} from '@jobtrack/shared';
import { parseId, requireUserId } from '../../lib/http.js';
import type { ApplicationService } from './applications.service.js';

export async function applicationRoutes(
  app: FastifyInstance,
  opts: { service: ApplicationService },
) {
  const { service } = opts;

  app.get('/', async (request): Promise<{ applications: Application[] }> => ({
    applications: await service.list(
      requireUserId(request),
      applicationListQuerySchema.parse(request.query),
    ),
  }));

  app.post('/', async (request, reply): Promise<ApplicationDetail> => {
    const input = applicationCreateSchema.parse(request.body);
    reply.status(201);
    return service.create(requireUserId(request), input);
  });

  app.get('/:id', async (request): Promise<ApplicationDetail> =>
    service.get(requireUserId(request), parseId(request.params)),
  );

  app.patch('/:id', async (request): Promise<ApplicationDetail> => {
    const userId = requireUserId(request);
    const id = parseId(request.params);
    return service.update(userId, id, applicationUpdateSchema.parse(request.body));
  });

  app.delete('/:id', async (request, reply) => {
    await service.delete(requireUserId(request), parseId(request.params));
    return reply.status(204).send();
  });

  app.post('/:id/stage', async (request): Promise<ApplicationDetail> => {
    const userId = requireUserId(request);
    const id = parseId(request.params);
    return service.changeStage(userId, id, stageChangeSchema.parse(request.body).stage);
  });

  app.post('/:id/archive', async (request): Promise<ApplicationDetail> =>
    service.setArchived(requireUserId(request), parseId(request.params), true),
  );

  app.post('/:id/unarchive', async (request): Promise<ApplicationDetail> =>
    service.setArchived(requireUserId(request), parseId(request.params), false),
  );

  app.post('/:id/activities', async (request, reply): Promise<Activity> => {
    const userId = requireUserId(request);
    const id = parseId(request.params);
    const input = activityCreateSchema.parse(request.body);
    reply.status(201);
    return service.addActivity(userId, id, input);
  });
}

/** Etkinlikler kendi ID'leriyle düzenlenir/silinir: /api/activities/:id */
export async function activityRoutes(app: FastifyInstance, opts: { service: ApplicationService }) {
  const { service } = opts;

  app.patch('/:id', async (request): Promise<Activity> => {
    const userId = requireUserId(request);
    const id = parseId(request.params);
    return service.updateActivity(userId, id, activityUpdateSchema.parse(request.body));
  });

  app.delete('/:id', async (request, reply) => {
    await service.deleteActivity(requireUserId(request), parseId(request.params));
    return reply.status(204).send();
  });
}
