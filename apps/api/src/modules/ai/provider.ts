import type { TailorResult } from '@jobtrack/shared';
import { AppError } from '../../lib/errors.js';

// ADR-0010: yapay zekâ sağlayıcısı bir arayüzün arkasındadır. Gemini bugünkü uygulamadır; Ollama
// gibi yerel bir sağlayıcı aynı arayüzle eklenir ve veri sunucudan çıkmaz.

/** Sağlayıcıya giden girdi. Ana CV burada zaten maskelenmiştir. */
export interface TailorInput {
  maskedCv: string;
  jobDescription: string;
  positionTitle: string;
  companyName: string;
  /** Çıktı tek A4 sayfaya sığmalı (ONE_PAGE_RULES). */
  onePage?: boolean;
}

export interface CvTailorProvider {
  /** Kayıtta ve arayüzde gösterilen model adı (örn. "gemini:gemini-3.8-flash"). */
  readonly model: string;
  /** `model`: yedek modele geçildiyse yanıtı gerçekten üreten model (yoksa `model` alanı). */
  tailor(input: TailorInput): Promise<TailorResult & { model?: string }>;
}

// Kullanıcıya gösterilen hatalar: iç ayrıntı içermez (A10).
export const aiDisabled = () =>
  new AppError(
    503,
    'Yapay zekâ özelliği bu kurulumda kapalı. Açmak için README’deki adımları izleyin.',
    'ai_disabled',
  );
export const aiRateLimited = () =>
  new AppError(
    429,
    'Yapay zekâ servisinin ücretsiz kullanım sınırına ulaşıldı. Birkaç dakika sonra tekrar deneyin.',
    'ai_rate_limited',
  );
export const aiUnavailable = () =>
  new AppError(
    503,
    'Yapay zekâ servisine şu an ulaşılamıyor. Biraz sonra tekrar deneyin.',
    'ai_unavailable',
  );
export const aiRejected = () =>
  new AppError(
    503,
    'Yapay zekâ servisi isteği kabul etmedi. Sunucudaki API anahtarını kontrol edin.',
    'ai_rejected',
  );
export const aiModelNotFound = () =>
  new AppError(
    502,
    'Yapay zekâ modeli bulunamadı. Sunucudaki GEMINI_MODEL ayarını kontrol edin.',
    'ai_model_not_found',
  );
export const aiInvalidResponse = () =>
  new AppError(
    502,
    'Yapay zekâ beklenen biçimde yanıt vermedi. Tekrar deneyin.',
    'ai_invalid_response',
  );
