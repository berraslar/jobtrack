import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ExtractError, extractText, MAX_BYTES } from './extract.js';

/**
 * ADR-0008: yalnızca iç ağdan erişilen tek amaçlı servis. Aynı anda tek PDF işlenir (kuyruk);
 * gövde sınırı ve zaman aşımları DoS'u sınırlar. İçerik ve metin loglanmaz.
 */
const PORT = Number(process.env.PORT ?? 8090);
const MAX_QUEUE = 8;

let chain: Promise<unknown> = Promise.resolve();
let queued = 0;

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'cache-control': 'no-store',
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    send(res, 200, { status: 'ok' });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/extract') {
    send(res, 404, { error: 'not_found' });
    return;
  }
  if (req.headers['content-type'] !== 'application/pdf') {
    send(res, 415, { error: 'unsupported_media_type' });
    return;
  }
  if (queued >= MAX_QUEUE) {
    send(res, 503, { error: 'busy' });
    return;
  }
  queued += 1;
  const job = chain.then(async () => {
    try {
      const body = await readBody(req);
      if (!body) {
        send(res, 413, { error: 'too_large' });
        return;
      }
      send(res, 200, await extractText(body));
    } catch (err) {
      if (err instanceof ExtractError) {
        send(res, err.code === 'too_large' ? 413 : 422, { error: err.code });
      } else {
        // Ayrıntı yalnızca türüyle loglanır; PDF içeriği ve metin loglanmaz.
        console.error(
          JSON.stringify({ level: 'error', msg: 'cv-parser hatası', type: (err as Error).name }),
        );
        send(res, 500, { error: 'internal' });
      }
    } finally {
      queued -= 1;
    }
  });
  chain = job.catch(() => undefined);
});

server.requestTimeout = 120_000;
server.headersTimeout = 10_000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', msg: 'cv-parser dinliyor', port: PORT }));
});

const stop = () => {
  server.close(() => process.exit(0));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
