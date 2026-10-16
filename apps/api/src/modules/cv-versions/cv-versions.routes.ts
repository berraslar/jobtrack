import type { FastifyInstance } from 'fastify';
import {
  CV_FILE_MAX_BYTES,
  CV_FILE_TYPE,
  cvFileUploadHeadersSchema,
  cvVersionCreateSchema,
  cvVersionUpdateSchema,
  cvVersionUploadHeadersSchema,
  type CvVersion,
} from '@jobtrack/shared';
import { attachmentDisposition, parseId, requireUserId } from '../../lib/http.js';
import type { CvVersionService } from './cv-versions.service.js';

export async function cvVersionRoutes(app: FastifyInstance, opts: { service: CvVersionService }) {
  const { service } = opts;

  // ADR-0006: CV dosyası ham PDF gövdesi olarak gelir. Ayrıştırıcı ve 5 MB sınırı yalnızca bu
  // eklentideki rotalara uygulanır; uygulamanın geri kalanında 100 KB sınırı geçerlidir (A06).
  app.addContentTypeParser(
    CV_FILE_TYPE,
    { parseAs: 'buffer', bodyLimit: CV_FILE_MAX_BYTES },
    (_request, body, done) => {
      done(null, body);
    },
  );
  const fileBody = (body: unknown): Buffer => (Buffer.isBuffer(body) ? body : Buffer.alloc(0));

  app.get('/', async (request): Promise<{ cvVersions: CvVersion[] }> => ({
    cvVersions: await service.list(requireUserId(request)),
  }));

  app.post('/', async (request, reply): Promise<CvVersion> => {
    const input = cvVersionCreateSchema.parse(request.body);
    reply.status(201);
    return service.create(requireUserId(request), input);
  });

  app.patch('/:id', async (request): Promise<CvVersion> => {
    const userId = requireUserId(request);
    const id = parseId(request.params);
    return service.update(userId, id, cvVersionUpdateSchema.parse(request.body));
  });

  app.delete('/:id', async (request, reply) => {
    await service.delete(requireUserId(request), parseId(request.params));
    return reply.status(204).send();
  });

  /** Sürükle-bırak: yeni versiyon ve dosyası tek istekte (etiket ve ad başlıkta). */
  app.post('/upload', { bodyLimit: CV_FILE_MAX_BYTES }, async (request, reply) => {
    const headers = cvVersionUploadHeadersSchema.parse(request.headers);
    const created = await service.createWithFile(requireUserId(request), {
      label: headers['x-cv-label'],
      fileName: headers['x-file-name'],
      data: fileBody(request.body),
    });
    reply.status(201);
    return created;
  });

  app.put('/:id/file', { bodyLimit: CV_FILE_MAX_BYTES }, async (request): Promise<CvVersion> => {
    const userId = requireUserId(request);
    const id = parseId(request.params);
    const headers = cvFileUploadHeadersSchema.parse(request.headers);
    return service.replaceFile(userId, id, {
      fileName: headers['x-file-name'],
      data: fileBody(request.body),
    });
  });

  app.get('/:id/file', async (request, reply) => {
    const file = await service.getFile(requireUserId(request), parseId(request.params));
    return reply
      .header('content-type', file.contentType)
      .header('content-disposition', attachmentDisposition(file.fileName))
      .header('x-content-type-options', 'nosniff')
      .send(file.data);
  });

  app.delete('/:id/file', async (request, reply) => {
    await service.deleteFile(requireUserId(request), parseId(request.params));
    return reply.status(204).send();
  });
}
