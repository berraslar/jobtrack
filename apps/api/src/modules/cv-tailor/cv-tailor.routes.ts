import type { FastifyInstance } from 'fastify';
import {
  CV_FILE_MAX_BYTES,
  CV_FILE_TYPE,
  idParamSchema,
  jobDescriptionUpdateSchema,
  masterCvUpdateSchema,
  tailorRequestSchema,
  tailoredCvCreateSchema,
  tailoredCvUpdateSchema,
  type AiStatus,
  type JobDescription,
  type MasterCv,
  type MasterCvImport,
  type TailorDraft,
  type TailoredCv,
} from '@jobtrack/shared';
import { requireUserId } from '../../lib/http.js';
import type { CvTailorService } from './cv-tailor.service.js';

/** 30.000 karakterlik Türkçe Markdown UTF-8'de 100 KB genel sınırını aşabilir. */
const MASTER_CV_BODY_LIMIT = 128 * 1024;

/** FR-23: `/master-cv`. Tam oturum ister (varsayılan). */
export async function masterCvRoutes(app: FastifyInstance, opts: { service: CvTailorService }) {
  const { service } = opts;

  app.get('/', async (request): Promise<MasterCv> => service.getMasterCv(requireUserId(request)));

  app.put('/', { bodyLimit: MASTER_CV_BODY_LIMIT }, async (request): Promise<MasterCv> => {
    const { markdown } = masterCvUpdateSchema.parse(request.body);
    return service.putMasterCv(requireUserId(request), markdown);
  });

  // ADR-0008: PDF ham gövde olarak gelir; 5 MB sınırı yalnızca bu eklentideki rotalara uygulanır.
  app.addContentTypeParser(
    CV_FILE_TYPE,
    { parseAs: 'buffer', bodyLimit: CV_FILE_MAX_BYTES },
    (_request, body, done) => {
      done(null, body);
    },
  );

  // OCR pahalıdır: genel sınırdan çok daha sıkı bir IP sınırı uygulanır (DoS, ADR-0008).
  app.post(
    '/import',
    { bodyLimit: CV_FILE_MAX_BYTES, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (request): Promise<MasterCvImport> => {
      const pdf = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      return service.importMasterCv(requireUserId(request), pdf);
    },
  );
}

/**
 * FR-23/FR-24: `/applications/:id/job-description`, `/applications/:id/tailor`,
 * `/applications/:id/tailored-cvs`. Başkasının başvurusu 404 döner.
 */
export async function applicationTailorRoutes(
  app: FastifyInstance,
  opts: { service: CvTailorService },
) {
  const { service } = opts;

  app.get('/:id/job-description', async (request): Promise<JobDescription> => {
    const { id } = idParamSchema.parse(request.params);
    return service.getJobDescription(requireUserId(request), id);
  });

  app.put('/:id/job-description', async (request): Promise<JobDescription> => {
    const { id } = idParamSchema.parse(request.params);
    const { jobDescription } = jobDescriptionUpdateSchema.parse(request.body);
    return service.setJobDescription(requireUserId(request), id, jobDescription);
  });

  // ADR-0010: taslak üretir, yazmaz. Onay (consent: true) şemada zorunludur.
  app.post('/:id/tailor', async (request): Promise<TailorDraft> => {
    const { id } = idParamSchema.parse(request.params);
    const { extraMaskTerms, onePage } = tailorRequestSchema.parse(request.body);
    return service.tailor(requireUserId(request), id, extraMaskTerms, onePage);
  });

  app.get('/:id/tailored-cvs', async (request): Promise<{ tailoredCvs: TailoredCv[] }> => {
    const { id } = idParamSchema.parse(request.params);
    return { tailoredCvs: await service.listTailoredCvs(requireUserId(request), id) };
  });

  app.post('/:id/tailored-cvs', { bodyLimit: MASTER_CV_BODY_LIMIT }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const input = tailoredCvCreateSchema.parse(request.body);
    const created = await service.createTailoredCv(requireUserId(request), id, input);
    return reply.status(201).send(created);
  });
}

/** FR-24: `/tailored-cvs/:id`. Başkasının sürümü 404 döner. */
export async function tailoredCvRoutes(app: FastifyInstance, opts: { service: CvTailorService }) {
  const { service } = opts;

  app.get('/:id', async (request): Promise<TailoredCv> => {
    const { id } = idParamSchema.parse(request.params);
    return service.getTailoredCv(requireUserId(request), id);
  });

  app.put('/:id', { bodyLimit: MASTER_CV_BODY_LIMIT }, async (request): Promise<TailoredCv> => {
    const { id } = idParamSchema.parse(request.params);
    const { markdown } = tailoredCvUpdateSchema.parse(request.body);
    return service.updateTailoredCv(requireUserId(request), id, markdown);
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await service.deleteTailoredCv(requireUserId(request), id);
    return reply.status(204).send();
  });
}

/** ADR-0010: özelliğin açık olup olmadığı. Anahtar ya da yapılandırma ayrıntısı dönmez. */
export async function aiStatusRoutes(
  app: FastifyInstance,
  opts: { service: CvTailorService; model: string | null },
) {
  app.get('/status', async (request): Promise<AiStatus> => {
    requireUserId(request);
    return { enabled: opts.service.aiEnabled, model: opts.service.aiEnabled ? opts.model : null };
  });
}
