import { apiErrorSchema, meResponseSchema, type MeResponse } from '@jobtrack/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | undefined;

/** CSRF token'ı /me yanıtından gelir; durum değiştiren her istekte başlık olarak gönderilir (A08). */
export function setCsrfToken(token: string | undefined): void {
  csrfToken = token;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Tüm API çağrıları buradan geçer. Yanıt Zod şemasıyla doğrulanır; beklenmeyen bir yanıt
 * arayüze ulaşmadan hata olur.
 */
export async function api<T>(
  path: string,
  options: {
    method?: string;
    /** JSON'a çevrilir; Blob (dosya) ise kendi türüyle olduğu gibi gönderilir. */
    body?: unknown;
    headers?: Record<string, string>;
    schema?: z.ZodType<T>;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const isBlob = options.body instanceof Blob;
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) {
    headers['content-type'] = isBlob ? (options.body as Blob).type : 'application/json';
  }
  if (UNSAFE.has(method) && csrfToken) headers['x-csrf-token'] = csrfToken;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    ...(options.body !== undefined
      ? { body: isBlob ? (options.body as Blob) : JSON.stringify(options.body) }
      : {}),
  });

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw parsed.success
      ? new ApiError(res.status, parsed.data.error, parsed.data.code, parsed.data.traceId)
      : new ApiError(res.status, 'Beklenmeyen bir hata oluştu.');
  }
  if (!options.schema) return data as T;
  const parsed = options.schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(500, 'Sunucudan beklenmeyen yanıt alındı.', 'invalid_response');
  }
  return parsed.data;
}

/** Oturum yoksa null döner. */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const me = await api('/auth/me', { schema: meResponseSchema });
    setCsrfToken(me.csrfToken);
    return me;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setCsrfToken(undefined);
      return null;
    }
    throw err;
  }
}

/** Form alanının metin değeri; dosya veya eksik alan için boş metin. */
export function formText(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value : '';
}
