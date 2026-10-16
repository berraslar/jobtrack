import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import { testConfig } from '../../test/helpers.js';
import { GeminiProvider } from './gemini.js';
import { createAiProvider } from './index.js';
import { SYSTEM_INSTRUCTION } from './prompt.js';

// ADR-0010: Gemini çağrısı, geri çekilme ve yanıtın şema doğrulaması.

const INPUT = {
  maskedCv: '# [[AD_1]]\n## Deneyim\n### Veri Bilimci — Acme (2021 – 2024)',
  jobDescription: 'Python ve SQL',
  positionTitle: 'Veri Bilimci',
  companyName: 'Örnek',
};

const RESULT = {
  tailoredMarkdown: '# [[AD_1]]\n## Deneyim\n### Veri Bilimci — Acme (2021 – 2024)',
  matchScore: 72,
  missingKeywords: ['Airflow'],
  changes: ['Python deneyimi öne alındı.'],
};

const ok = (payload: unknown = RESULT, finishReason = 'STOP') =>
  Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason }],
  });

const exhausted = (retryDelay?: string) =>
  Response.json(
    {
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: retryDelay
          ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }]
          : [],
      },
    },
    { status: 429 },
  );

function setup(responses: (Response | Error)[], fallbackModels?: string[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const waits: number[] = [];
  let clock = 0;
  const provider = new GeminiProvider({
    apiKey: 'gizli-anahtar',
    model: 'gemini-3.8-flash',
    ...(fallbackModels ? { fallbackModels } : {}),
    fetch: (url, init) => {
      requests.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
      const next = responses.shift();
      if (!next) throw new Error('beklenmeyen istek');
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    sleep: (ms) => {
      waits.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    random: () => 0.5,
    now: () => clock,
  });
  return { provider, requests, waits };
}

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError ? `${String(error.statusCode)} ${error.code ?? ''}` : 'other';
  }
  return 'resolved';
};

describe('GeminiProvider', () => {
  it('anahtarı başlıkta gönderir, sistem talimatı ve JSON şemasıyla ister', async () => {
    const { provider, requests } = setup([ok()]);
    await expect(provider.tailor(INPUT)).resolves.toEqual({
      ...RESULT,
      model: 'gemini:gemini-3.8-flash',
    });
    const [request] = requests;
    expect(request?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    );
    expect(request?.url).not.toContain('gizli-anahtar');
    expect((request?.init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'gizli-anahtar',
    );
    const body = JSON.parse(request?.init.body as string) as {
      systemInstruction: { parts: { text: string }[] };
      contents: { parts: { text: string }[] }[];
      generationConfig: { responseMimeType: string; responseSchema: { required: string[] } };
    };
    expect(body.systemInstruction.parts[0]?.text).toBe(SYSTEM_INSTRUCTION);
    expect(body.contents[0]?.parts[0]?.text).toContain('<cv>\n# [[AD_1]]');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.required).toEqual([
      'tailoredMarkdown',
      'matchScore',
      'missingKeywords',
      'changes',
    ]);
    expect(provider.model).toBe('gemini:gemini-3.8-flash');
  });

  it('sistem talimatı kullanıcının kurallarını içerir', () => {
    for (const rule of [
      'Never invent experience, skills, tools, certifications',
      'reorder sections and bullet points, rephrase sentences',
      'Copy every date, date range, duration',
      'company name exactly',
      '"matchScore": an integer from 0 to 100',
      '"missingKeywords"',
      '"changes"',
    ]) {
      expect(SYSTEM_INSTRUCTION).toContain(rule);
    }
  });

  it('429 RESOURCE_EXHAUSTED sonrası üstel bekleyip yeniden dener', async () => {
    const { provider, waits, requests } = setup([exhausted(), exhausted(), ok()]);
    await expect(provider.tailor(INPUT)).resolves.toEqual({
      ...RESULT,
      model: 'gemini:gemini-3.8-flash',
    });
    expect(requests).toHaveLength(3);
    expect(waits).toEqual([1125, 2125]);
  });

  it('sağlayıcının önerdiği bekleme süresini kullanır', async () => {
    const { provider, waits } = setup([exhausted('3.5s'), ok()]);
    await provider.tailor(INPUT);
    expect(waits).toEqual([3500]);
  });

  it('denemeler tükenince anlaşılır bir 429 döner', async () => {
    const { provider, requests } = setup([exhausted(), exhausted(), exhausted()]);
    expect(await codeOf(provider.tailor(INPUT))).toBe('429 ai_rate_limited');
    expect(requests).toHaveLength(3);
  });

  it('önerilen bekleme çok uzunsa beklemeden 429 döner', async () => {
    const { provider, waits } = setup([exhausted('45s')]);
    expect(await codeOf(provider.tailor(INPUT))).toBe('429 ai_rate_limited');
    expect(waits).toEqual([]);
  });

  it('503 yanıtını yeniden dener, sürerse servis yok der', async () => {
    const unavailable = () => new Response('', { status: 503 });
    const { provider } = setup([unavailable(), unavailable(), unavailable()]);
    expect(await codeOf(provider.tailor(INPUT))).toBe('503 ai_unavailable');
  });

  it('tek sayfa istenirse uzunluk kurallarını ekler; uydurma yasağı yine baştadır', async () => {
    const { provider, requests } = setup([ok(), ok()]);
    const sentInstruction = (i: number) =>
      (
        JSON.parse(requests.at(i)?.init.body as string) as {
          systemInstruction: { parts: { text: string }[] };
        }
      ).systemInstruction.parts[0]?.text ?? '';
    await provider.tailor({ ...INPUT, onePage: true });
    await provider.tailor({ ...INPUT, onePage: false });
    expect(sentInstruction(0)).toContain('fit on a single A4 page');
    expect(sentInstruction(0)).toContain('under 2200 characters');
    expect(sentInstruction(0)).toContain('Never merge roles or change their dates');
    expect(sentInstruction(0).startsWith(SYSTEM_INSTRUCTION)).toBe(true);
    expect(sentInstruction(1)).toBe(SYSTEM_INSTRUCTION);
  });

  it('Gemini 3 modellerinde düşük düşünme düzeyi ister', async () => {
    const { provider, requests } = setup([ok()]);
    await provider.tailor(INPUT);
    const sent = JSON.parse(requests[0]?.init.body as string) as {
      generationConfig: { thinkingConfig?: { thinkingLevel: string } };
    };
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('ana model yoğunsa (503) beklemeden yedek modele geçer ve yanıtı üreten modeli bildirir', async () => {
    const busy = () => new Response('', { status: 503 });
    const { provider, requests, waits } = setup(
      [busy(), busy(), ok()],
      ['gemini-3.7-flash', 'gemini-3.5-flash-lite'],
    );
    await expect(provider.tailor(INPUT)).resolves.toEqual({
      ...RESULT,
      model: 'gemini:gemini-3.5-flash-lite',
    });
    expect(requests.map((r) => r.url.split('/').at(-1))).toEqual([
      'gemini-3.8-flash:generateContent',
      'gemini-3.7-flash:generateContent',
      'gemini-3.5-flash-lite:generateContent',
    ]);
    expect(waits).toEqual([]);
  });

  it('zaman aşımında yedek modele geçer; yedekler de yoğunsa son modelde geri çekilir', async () => {
    const busy = () => new Response('', { status: 503 });
    const { provider, requests, waits } = setup(
      [new DOMException('zaman aşımı', 'TimeoutError'), busy(), busy(), busy()],
      ['gemini-3.7-flash'],
    );
    expect(await codeOf(provider.tailor(INPUT))).toBe('503 ai_unavailable');
    expect(requests).toHaveLength(4);
    expect(waits).toEqual([1125, 2125]);
  });

  it('kalıcı hatada (400) yedek modele geçmez', async () => {
    const { provider, requests } = setup(
      [new Response('{}', { status: 400 })],
      ['gemini-3.7-flash'],
    );
    expect(await codeOf(provider.tailor(INPUT))).toBe('503 ai_rejected');
    expect(requests).toHaveLength(1);
  });

  it.each([
    [404, '502 ai_model_not_found'],
    [400, '503 ai_rejected'],
    [403, '503 ai_rejected'],
  ])('%i yanıtını yeniden denemez: %s', async (status, expected) => {
    const { provider, requests } = setup([new Response('{}', { status })]);
    expect(await codeOf(provider.tailor(INPUT))).toBe(expected);
    expect(requests).toHaveLength(1);
  });

  it('ağ hatasında servis yok der', async () => {
    const { provider } = setup([new TypeError('fetch failed')]);
    expect(await codeOf(provider.tailor(INPUT))).toBe('503 ai_unavailable');
  });

  it.each([
    [
      'JSON olmayan metin',
      () => Response.json({ candidates: [{ content: { parts: [{ text: 'merhaba' }] } }] }),
    ],
    ['skor aralık dışı', () => ok({ ...RESULT, matchScore: 150 })],
    ['ondalık skor', () => ok({ ...RESULT, matchScore: 72.5 })],
    ['eksik alan', () => ok({ tailoredMarkdown: 'x', matchScore: 1, missingKeywords: [] })],
    ['tanımsız alan', () => ok({ ...RESULT, systemPrompt: 'sızdı' })],
    ['boş CV', () => ok({ ...RESULT, tailoredMarkdown: '   ' })],
    ['fazla anahtar kelime', () => ok({ ...RESULT, missingKeywords: Array(31).fill('x') })],
    ['güvenlik nedeniyle kesildi', () => ok(RESULT, 'SAFETY')],
    ['istem engellendi', () => Response.json({ promptFeedback: { blockReason: 'OTHER' } })],
    ['boş gövde', () => new Response('', { status: 200 })],
  ])('şemaya uymayan yanıtı reddeder: %s', async (_label, response) => {
    const { provider } = setup([response()]);
    expect(await codeOf(provider.tailor(INPUT))).toBe('502 ai_invalid_response');
  });
});

describe('yapay zekâ yapılandırması (ADR-0010)', () => {
  it('varsayılan olarak kapalıdır; model varsayılanı doğrulanmış Flash modelidir', () => {
    const config = testConfig();
    expect(createAiProvider(config)).toBeNull();
    expect(config.GEMINI_MODEL).toBe('gemini-3.8-flash');
    expect(config.GEMINI_FALLBACK_MODELS).toEqual(['gemini-3.7-flash', 'gemini-3.5-flash-lite']);
  });

  it('yedek modeller virgülle verilir; boş değer yedeği kapatır; adlar doğrulanır', () => {
    expect(
      testConfig({ GEMINI_FALLBACK_MODELS: ' gemini-3.6-flash , gemini-3.5-flash ' })
        .GEMINI_FALLBACK_MODELS,
    ).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash']);
    expect(testConfig({ GEMINI_FALLBACK_MODELS: '' }).GEMINI_FALLBACK_MODELS).toEqual([]);
    expect(() => testConfig({ GEMINI_FALLBACK_MODELS: 'gemini-3.7-flash,../x' })).toThrow();
  });

  it('Compose’un geçirdiği boş değerler tanımsız sayılır', () => {
    const config = testConfig({ AI_PROVIDER: '', GEMINI_API_KEY: '', GEMINI_MODEL: '' });
    expect(config.AI_PROVIDER).toBeUndefined();
    expect(config.GEMINI_MODEL).toBe('gemini-3.8-flash');
    expect(createAiProvider(config)).toBeNull();
  });

  it('Gemini için anahtar zorunludur', () => {
    expect(() => testConfig({ AI_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/);
    const provider = createAiProvider(
      testConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.6-flash' }),
    );
    expect(provider?.model).toBe('gemini:gemini-3.6-flash');
  });

  it('sahte sağlayıcı testler dışında seçilemez; model adı doğrulanır', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://a:b@127.0.0.1:1/c',
      APP_ORIGIN: 'https://jobtrack.example',
      APP_SECRET: Buffer.alloc(32, 1).toString('base64'),
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
      SMTP_HOST: 'smtp.example',
    };
    expect(() => loadConfig({ ...base, AI_PROVIDER: 'fake' })).toThrow(/yalnızca testlerde/);
    expect(() => loadConfig({ ...base, GEMINI_MODEL: '../../etc' })).toThrow(/model adı/);
  });
});
