import type { FastifyInstance } from 'fastify';
import {
  profileExtractRequestSchema,
  profileUpdateSchema,
  type Profile,
  type ProfileDraft,
} from '@jobtrack/shared';
import { requireUserId } from '../../lib/http.js';
import type { ProfileService } from './profile.service.js';

/** Dolu bir profil (30 deneyim × 2000 karakter, Türkçe) genel 100 KB sınırını aşabilir. */
const PROFILE_BODY_LIMIT = 256 * 1024;

export async function profileRoutes(app: FastifyInstance, opts: { service: ProfileService }) {
  const { service } = opts;

  app.get('/', async (request): Promise<Profile> => service.get(requireUserId(request)));

  app.put('/', { bodyLimit: PROFILE_BODY_LIMIT }, async (request): Promise<Profile> => {
    const input = profileUpdateSchema.parse(request.body);
    return service.put(requireUserId(request), input);
  });

  app.delete('/', async (request, reply) => {
    await service.delete(requireUserId(request));
    return reply.status(204).send();
  });

  // OCR pahalıdır: genel sınırdan çok daha sıkı bir IP sınırı uygulanır (DoS, ADR-0008).
  app.post(
    '/extract',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (request): Promise<ProfileDraft> => {
      const { cvVersionId } = profileExtractRequestSchema.parse(request.body);
      return service.extract(requireUserId(request), cvVersionId);
    },
  );
}
