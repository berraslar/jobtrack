import type { TailorResult } from '@jobtrack/shared';
import type { CvTailorProvider, TailorInput } from './provider.js';

/**
 * Testler için deterministik sağlayıcı (ADR-0010). Veri sunucudan çıkmaz; yalnızca NODE_ENV=test
 * iken seçilebilir. İlan metni `[[UYDUR]]` içerirse çıktıya Ana CV'de olmayan bir deneyim ekler
 * (uydurma denetimini uçtan uca sınamak için).
 */
export class FakeProvider implements CvTailorProvider {
  readonly model = 'fake:deterministic';
  readonly calls: TailorInput[] = [];

  tailor(input: TailorInput): Promise<TailorResult> {
    this.calls.push(input);
    const cvWords = new Set(input.maskedCv.toLocaleLowerCase('tr').split(/[^\p{L}\p{N}+#]+/u));
    const wanted = [
      ...new Set(
        input.jobDescription
          .split(/[^\p{L}\p{N}+#]+/u)
          .filter((word) => word.length >= 3 && /^\p{Lu}/u.test(word)),
      ),
    ];
    const missing = wanted.filter((word) => !cvWords.has(word.toLocaleLowerCase('tr')));
    const matched = wanted.length - missing.length;
    const invented = input.jobDescription.includes('[[UYDUR]]')
      ? '\n\n### Kıdemli Analist — Hayali Holding A.Ş. (2015 – 2017, 2 yıl)\n'
      : '';
    return Promise.resolve({
      tailoredMarkdown: `${input.maskedCv.trim()}${invented}`,
      matchScore: wanted.length === 0 ? 50 : Math.round((matched / wanted.length) * 100),
      missingKeywords: missing.slice(0, 30),
      changes: ['Sahte sağlayıcı: metin olduğu gibi döndürüldü.'],
    });
  }
}
