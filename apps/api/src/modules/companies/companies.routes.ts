import type { FastifyInstance } from 'fastify';
import {
  companyCreateSchema,
  companyUpdateSchema,
  type Company,
  type CompanyDetail,
} from '@jobtrack/shared';
import { parseId, requireUserId } from '../../lib/http.js';
import type { CompanyService } from './companies.service.js';

export async function companyRoutes(app: FastifyInstance, opts: { service: CompanyService }) {
  const { service } = opts;

  app.get('/', async (request): Promise<{ companies: Company[] }> => ({
    companies: await service.list(requireUserId(request)),
  }));

  app.post('/', async (request, reply): Promise<Company> => {
    const input = companyCreateSchema.parse(request.body);
    reply.status(201);
    return service.create(requireUserId(request), input);
  });

  app.get('/:id', async (request): Promise<CompanyDetail> =>
    service.get(requireUserId(request), parseId(request.params)),
  );

  app.patch('/:id', async (request): Promise<Company> => {
    const userId = requireUserId(request);
    const id = parseId(request.params);
    return service.update(userId, id, companyUpdateSchema.parse(request.body));
  });

  app.delete('/:id', async (request, reply) => {
    await service.delete(requireUserId(request), parseId(request.params));
    return reply.status(204).send();
  });
}
