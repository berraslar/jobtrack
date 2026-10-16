import { describe, expect, it } from 'vitest';
import {
  canonicalLinkedInJobUrl,
  cleanJobUrl,
  cleanMultiline,
  cleanText,
  hasPrefill,
  parsePrefill,
} from './prefill.js';

const params = (init: Record<string, string>) => new URLSearchParams(init);

describe('canonicalLinkedInJobUrl (FR-22, ADR-0009)', () => {
  it('ilan yolundan temiz bağlantı üretir, izleme parametrelerini atar', () => {
    expect(
      canonicalLinkedInJobUrl(
        'https://www.linkedin.com/jobs/view/4012345678/?refId=abc&trackingId=xyz%3D%3D',
      ),
    ).toBe('https://www.linkedin.com/jobs/view/4012345678/');
  });

  it('başlıklı yoldan ve currentJobId parametresinden kimliği alır', () => {
    expect(
      canonicalLinkedInJobUrl('https://tr.linkedin.com/jobs/view/veri-bilimci-at-acme-4012345678'),
    ).toBe('https://www.linkedin.com/jobs/view/4012345678/');
    expect(
      canonicalLinkedInJobUrl(
        'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678&origin=x',
      ),
    ).toBe('https://www.linkedin.com/jobs/view/4012345678/');
    expect(canonicalLinkedInJobUrl('https://linkedin.com/jobs/view/4012345678')).toBe(
      'https://www.linkedin.com/jobs/view/4012345678/',
    );
  });

  it.each([
    ['benzer alan adı', 'https://linkedin.com.evil.com/jobs/view/4012345678/'],
    ['alt alan adı gibi görünen başka alan', 'https://evillinkedin.com/jobs/view/4012345678/'],
    ['kullanıcı bilgisiyle yanıltma', 'https://www.linkedin.com@evil.com/jobs/view/4012345678/'],
    ['kullanıcı bilgisi', 'https://user:pw@www.linkedin.com/jobs/view/4012345678/'],
    ['http', 'http://www.linkedin.com/jobs/view/4012345678/'],
    ['javascript', 'javascript:alert(1)//www.linkedin.com/jobs/view/4012345678/'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['sorguda linkedin', 'https://evil.com/?u=https://www.linkedin.com/jobs/view/4012345678/'],
    ['ilan değil', 'https://www.linkedin.com/in/berra/'],
    ['sayısal olmayan kimlik', 'https://www.linkedin.com/jobs/view/abc/'],
    ['kimlikte enjeksiyon', 'https://www.linkedin.com/jobs/?currentJobId=1234567"><img>'],
    ['bozuk adres', 'not a url'],
  ])('reddeder: %s', (_label, url) => {
    expect(canonicalLinkedInJobUrl(url)).toBeNull();
  });

  it('aşırı uzun adresi ayrıştırmadan reddeder', () => {
    expect(
      canonicalLinkedInJobUrl(
        `https://www.linkedin.com/jobs/view/4012345678/?x=${'a'.repeat(3000)}`,
      ),
    ).toBeNull();
  });
});

describe('cleanJobUrl (FR-22)', () => {
  it('LinkedIn dışı https ilanlarını alır; izleme parametrelerini ve adres parçasını atar', () => {
    expect(
      cleanJobUrl(
        'https://www.kariyer.net/is-ilani/b-bilisim-bilgisayar-muhendisi-4580270?utm_source=x&gclid=1#basvur',
      ),
    ).toBe('https://www.kariyer.net/is-ilani/b-bilisim-bilgisayar-muhendisi-4580270');
    expect(cleanJobUrl('https://boards.greenhouse.io/acme/jobs/123?gh_jid=123&utm_medium=li')).toBe(
      'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123',
    );
  });

  it('LinkedIn adresini kanonik ilan bağlantısına çevirir; ilan değilse reddeder', () => {
    expect(cleanJobUrl('https://www.linkedin.com/jobs/view/4012345678/?trk=x')).toBe(
      'https://www.linkedin.com/jobs/view/4012345678/',
    );
    expect(cleanJobUrl('https://www.linkedin.com/feed/')).toBeNull();
  });

  it.each([
    'http://www.kariyer.net/is-ilani/x-1',
    'javascript:alert(1)',
    'https://kullanici:parola@example.com/ilan',
    'data:text/html,<script>1</script>',
    'ilan',
    `https://example.com/${'a'.repeat(2050)}`,
  ])('reddeder: %s', (raw) => {
    expect(cleanJobUrl(raw)).toBeNull();
  });
});

describe('cleanMultiline', () => {
  it('satır sonlarını korur, kontrol karakterlerini ve fazla boş satırları atar', () => {
    expect(cleanMultiline('  Görevler\r\n\n\n\n- Python\u0000  ile\u200b  analiz \n')).toBe(
      'Görevler\n\n- Python ile analiz',
    );
  });
});

describe('ilan metni (#ilan=, FR-22, FR-23)', () => {
  const hashOf = (text: string) => `#ilan=${encodeURIComponent(text)}`;

  it('adres parçasından okunur ve temizlenir', () => {
    const { values, rejected } = parsePrefill(params({}), hashOf('İş Tanımı\n\n- SQL\u0007'));
    expect(values.jobDescription).toBe('İş Tanımı\n\n- SQL');
    expect(rejected).toEqual([]);
    expect(hasPrefill(params({}), hashOf('x'))).toBe(true);
  });

  it('20.000 karakteri aşan metni reddeder', () => {
    const { values, rejected } = parsePrefill(params({}), hashOf('a'.repeat(20_001)));
    expect(values.jobDescription).toBeUndefined();
    expect(rejected).toEqual(['description']);
  });

  it('parça yoksa ya da başka bir parça varsa yok sayar', () => {
    expect(parsePrefill(params({}), '').values).toEqual({});
    expect(parsePrefill(params({}), '#bolum').values).toEqual({});
  });
});

describe('cleanText', () => {
  it('kontrol ve görünmez biçim karakterlerini atar, boşlukları sadeleştirir', () => {
    expect(cleanText('  Veri\u0000 Bilimci\n\t(Uzaktan)\u202e\u200b ')).toBe(
      'Veri Bilimci (Uzaktan)',
    );
  });
});

describe('parsePrefill (FR-22)', () => {
  it('yer imi betiğinin gönderdiği alanları forma çevirir', () => {
    const { values, rejected } = parsePrefill(
      params({
        title: 'Veri Bilimci',
        company: 'Örnek Analitik',
        location: 'İstanbul, Türkiye (Hibrit)',
        url: 'https://www.linkedin.com/jobs/view/4012345678/?trk=x',
        source: 'linkedin',
        appliedAt: '2026-10-14',
      }),
    );
    expect(rejected).toEqual([]);
    expect(values).toEqual({
      positionTitle: 'Veri Bilimci',
      companyName: 'Örnek Analitik',
      location: 'İstanbul, Türkiye (Hibrit)',
      jobUrl: 'https://www.linkedin.com/jobs/view/4012345678/',
      source: 'linkedin',
      appliedAt: '2026-10-14',
    });
  });

  it('HTML içeren metni olduğu gibi metin olarak taşır (kaçışlama React çıktısında yapılır)', () => {
    const { values } = parsePrefill(params({ title: '<img src=x onerror=alert(1)>' }));
    expect(values.positionTitle).toBe('<img src=x onerror=alert(1)>');
  });

  it('sınırı aşan ve geçersiz değerleri reddeder; diğerlerini alır', () => {
    const { values, rejected } = parsePrefill(
      params({
        title: 'a'.repeat(201),
        company: 'Acme',
        location: 'x'.repeat(5000),
        url: 'http://kariyer.net/is-ilani/x-1',
        source: 'facebook',
        appliedAt: '14.10.2026',
      }),
    );
    expect(values).toEqual({ companyName: 'Acme' });
    expect(rejected.sort()).toEqual(['appliedAt', 'location', 'source', 'title', 'url']);
  });

  it('200 karakter sınırında kabul eder', () => {
    expect(parsePrefill(params({ title: 'a'.repeat(200) })).values.positionTitle).toHaveLength(200);
  });

  it('boş ve yalnızca boşluk olan parametreleri sessizce atlar, bilinmeyenleri yok sayar', () => {
    const result = parsePrefill(params({ title: '   ', company: '', extra: 'x' }));
    expect(result).toEqual({ values: {}, rejected: [] });
  });

  it('önceden doldurma parametresi olup olmadığını söyler', () => {
    expect(hasPrefill(params({ title: 'x' }))).toBe(true);
    expect(hasPrefill(params({ gorunum: 'kanban' }))).toBe(false);
  });
});
