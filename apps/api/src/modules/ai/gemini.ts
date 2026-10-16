import { tailorResultSchema, type TailorResult } from '@jobtrack/shared';
import { RESPONSE_SCHEMA, systemInstruction, userPrompt } from './prompt.js';
import {
  aiInvalidResponse,
  aiModelNotFound,
  aiRateLimited,
  aiRejected,
  aiUnavailable,
  type CvTailorProvider,
  type TailorInput,
} from './provider.js';

// ADR-0010 (4. ve 5. madde): Gemini generateContent çağrısı.
// - Adres yapılandırmadan gelir, kullanıcı girdisinden gelmez (SSRF yok, A01).
// - Anahtar URL'de değil `x-goog-api-key` başlığında gider; adres loglansa da sızmaz (A02, A04).
// - 503 / 500 / zaman aşımı / ağ hatasında beklemeden sıradaki yedek modele geçilir; yedek
//   kalmayınca ya da 429 / RESOURCE_EXHAUSTED'da üstel geri çekilmeyle yeniden denenir (A10).
// - Gemini 3 modellerinde düşünme düzeyi "low": uyarlama için yeterli, yanıt süresi yarıya iner.
// - İstek ve yanıt gövdeleri hiçbir yerde loglanmaz (A09).

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Ana model yoğunken (503) ya da yanıt vermezken sırayla denenen modeller. */
  fallbackModels?: string[];
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  maxAttempts?: number;
  /** Tek bir isteğin zaman aşımı. */
  requestTimeoutMs?: number;
  /** Tüm denemelerin toplam süresi. */
  deadlineMs?: number;
  /** Bundan uzun bir bekleme önerilirse beklenmez, kullanıcıya sınır mesajı döner. */
  maxWaitMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Google hata gövdesi (google.rpc.Status). Yalnızca kullandığımız alanlar. */
interface GoogleError {
  error?: {
    status?: string;
    details?: { '@type'?: string; retryDelay?: string }[];
  };
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** "30s", "1.5s" → milisaniye. */
function retryDelayMs(body: GoogleError): number | undefined {
  const info = body.error?.details?.find((d) => d['@type']?.endsWith('google.rpc.RetryInfo'));
  const delay = info?.retryDelay;
  if (!delay?.endsWith('s')) return undefined;
  const seconds = Number(delay.slice(0, -1));
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.round(seconds * 1000);
}

async function readJson<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

export class GeminiProvider implements CvTailorProvider {
  readonly model: string;
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;

  private readonly models: string[];

  constructor(private readonly options: GeminiOptions) {
    this.models = [...new Set([options.model, ...(options.fallbackModels ?? [])])];
    this.model = `gemini:${options.model}`;
    this.fetch = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  private request(model: string, input: TailorInput) {
    return {
      url: `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction(input) }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt(input) }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      }),
    };
  }

  async tailor(input: TailorInput): Promise<TailorResult & { model: string }> {
    const maxAttempts = this.options.maxAttempts ?? 3;
    const deadline = this.now() + (this.options.deadlineMs ?? 50_000);
    const maxWait = this.options.maxWaitMs ?? 20_000;
    let index = 0;

    /** Yedek kalmayınca son modelde yapılan deneme sayısı (geri çekilme bunun üzerinden). */
    let attempt = 0;
    for (;;) {
      const remaining = deadline - this.now();
      if (remaining <= 0) throw aiUnavailable();
      const model = this.models.at(index) ?? this.options.model;
      const { url, body } = this.request(model, input);
      const hasFallback = index < this.models.length - 1;
      let res: Response;
      try {
        res = await this.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.options.apiKey },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(Math.min(this.options.requestTimeoutMs ?? 25_000, remaining)),
        });
      } catch {
        // Zaman aşımı ya da ağ hatası: yedek model varsa ona geçilir.
        if (!hasFallback) throw aiUnavailable();
        index++;
        continue;
      }

      if (res.ok)
        return { ...this.parse(await readJson<GenerateResponse>(res)), model: `gemini:${model}` };

      const error = (await readJson<GoogleError>(res)) ?? {};
      const exhausted = res.status === 429 || error.error?.status === 'RESOURCE_EXHAUSTED';
      const retryable = exhausted || res.status === 503 || res.status === 500;
      if (!retryable) {
        if (res.status === 404) throw aiModelNotFound();
        if (res.status === 400 || res.status === 401 || res.status === 403) throw aiRejected();
        throw aiUnavailable();
      }
      // Model yoğun: beklemeden sıradaki modele geçilir (kotalar model başınadır).
      if (hasFallback) {
        index++;
        continue;
      }
      attempt++;
      if (attempt >= maxAttempts) {
        throw exhausted ? aiRateLimited() : aiUnavailable();
      }

      // Üstel bekleme (1 s, 2 s, 4 s…) + rastgele sapma; sağlayıcı süre önerdiyse o kullanılır.
      const wait =
        retryDelayMs(error) ?? 1000 * 2 ** (attempt - 1) + Math.round(this.random() * 250);
      if (wait > maxWait || this.now() + wait >= deadline) {
        throw exhausted ? aiRateLimited() : aiUnavailable();
      }
      await this.sleep(wait);
    }
  }

  /** Yanıt güvenilmeyen girdidir: şemadan geçmeyen her şey reddedilir. */
  private parse(response: GenerateResponse | undefined): TailorResult {
    if (!response || response.promptFeedback?.blockReason) throw aiInvalidResponse();
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw aiInvalidResponse();
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw aiInvalidResponse();
    }
    const parsed = tailorResultSchema.safeParse(json);
    if (!parsed.success) throw aiInvalidResponse();
    return parsed.data;
  }
}
