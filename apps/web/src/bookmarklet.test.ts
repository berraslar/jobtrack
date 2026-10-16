import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePrefill } from '@jobtrack/shared';
import { buildBookmarklet, SOURCE } from '../scripts/bookmarklet.mjs';
import { BOOKMARKLET_ORIGIN_PLACEHOLDER, BOOKMARKLET_TEMPLATE } from './generated/bookmarklet';

// FR-22, ADR-0009: yer imi betiğinin okuma davranışı ve küçültülmüş sürümün güncelliği.

// Testler paket kökünde (apps/web) çalışır.
// eslint-disable-next-line security/detect-non-literal-fs-filename -- sabit kaynak yolu
const source = readFileSync(resolve(process.cwd(), SOURCE), 'utf8');

const ORIGIN = 'https://jobtrack.example';

interface Run {
  opened: string | undefined;
  alerted: string | undefined;
}

/** Betiği verilen sayfa adresiyle çalıştırır; açılan JobTrack adresini döndürür. */
function run(href: string, code = source.replaceAll('__JOBTRACK_ORIGIN__', ORIGIN)): Run {
  const page = new URL(href);
  const result: Run = { opened: undefined, alerted: undefined };
  const fakeWindow = {
    open: (url: string) => {
      result.opened = url;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const execute = new Function('window', 'location', 'alert', code) as (
    w: unknown,
    l: unknown,
    a: unknown,
  ) => void;
  execute(fakeWindow, page, (message: string) => {
    result.alerted = message;
  });
  return result;
}

const prefillOf = (opened: string | undefined) => {
  expect(opened).toBeDefined();
  const url = new URL(opened ?? '');
  return { url, parsed: parsePrefill(url.searchParams, url.hash) };
};

const TOP_CARD = `
  <div class="job-details-jobs-unified-top-card__job-title"><h1> Veri   Bilimci </h1></div>
  <div class="job-details-jobs-unified-top-card__company-name"><a href="#">Örnek Analitik</a></div>
  <div class="job-details-jobs-unified-top-card__primary-description-container">
    İstanbul, Türkiye · 2 gün önce · 100+ başvuru
  </div>`;

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.title = '';
  vi.useRealTimers();
});

describe('yer imi betiği (FR-22)', () => {
  it('ilan kartından okur ve formu önceden dolu açar', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 14, 10, 0) });
    document.body.innerHTML = TOP_CARD;
    const { opened } = run(
      'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678&trk=x',
    );
    const { url, parsed } = prefillOf(opened);
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/basvurular/yeni`);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.values).toEqual({
      positionTitle: 'Veri Bilimci',
      companyName: 'Örnek Analitik',
      location: 'İstanbul, Türkiye',
      jobUrl: 'https://www.linkedin.com/jobs/view/4012345678/',
      source: 'linkedin',
      appliedAt: '2026-10-14',
    });
  });

  it('kart yoksa sekme başlığından okur; ilan yolundan bağlantı üretir', () => {
    document.title = '(3) ML Mühendisi | Kuzey Yazılım | LinkedIn';
    const { opened } = run('https://tr.linkedin.com/jobs/view/ml-muhendisi-at-kuzey-4099999999/');
    const { parsed } = prefillOf(opened);
    expect(parsed.values).toMatchObject({
      positionTitle: 'ML Mühendisi',
      companyName: 'Kuzey Yazılım',
      jobUrl: 'https://www.linkedin.com/jobs/view/4099999999/',
    });
    expect(parsed.values.location).toBeUndefined();
  });

  it('ilan kimliği yoksa bağlantı göndermez', () => {
    document.body.innerHTML = TOP_CARD;
    const { url } = prefillOf(run('https://www.linkedin.com/jobs/search/?keywords=veri').opened);
    expect(url.searchParams.has('url')).toBe(false);
  });

  it('uzun alanları 200 karakterde keser', () => {
    document.title = `${'a'.repeat(300)} | Acme | LinkedIn`;
    const { parsed } = prefillOf(run('https://www.linkedin.com/jobs/view/4012345678/').opened);
    expect(parsed.values.positionTitle).toHaveLength(200);
  });

  it('LinkedIn ilan metnini satır sonlarıyla adres parçasında taşır', () => {
    document.body.innerHTML = `${TOP_CARD}
      <div id="job-details"><p>İş   Tanımı</p><ul>
          <li>Python ile
            modelleme</li>
          <li>SQL raporları</li></ul><script>gizli()</script></div>`;
    const { url, parsed } = prefillOf(run('https://www.linkedin.com/jobs/view/4012345678/').opened);
    expect(url.search).not.toContain('ilan');
    expect(parsed.values.jobDescription).toBe('İş Tanımı\n- Python ile modelleme\n- SQL raporları');
  });

  it('LinkedIn sınıf adları değişse de "About the job" başlığından ilan metnini bulur', () => {
    document.body.innerHTML = `${TOP_CARD}
      <div class="x7f3a"><div class="q1"><h2>About the job</h2></div>
        <div class="q2"><p>${'We build data platforms for payments. '.repeat(10)}</p>
        <ul><li>Go</li><li>Kafka</li></ul></div></div>`;
    const { url, parsed } = prefillOf(run('https://www.linkedin.com/jobs/view/4012345678/').opened);
    expect(parsed.values.jobDescription).toMatch(/^About the job\n\nWe build data platforms/);
    expect(parsed.values.jobDescription).toContain('- Go\n- Kafka');
    expect(url.searchParams.get('yerimi')).toBe('2');
  });

  it('LinkedIn’de seçici bulunmazsa JobPosting verisindeki ilan metnini alır', () => {
    document.body.innerHTML = TOP_CARD;
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'Veri Bilimci',
      description: '<p>Python ve SQL</p>',
    })}</script>`;
    const { parsed } = prefillOf(run('https://www.linkedin.com/jobs/view/4012345678/').opened);
    expect(parsed.values.jobDescription).toBe('Python ve SQL');
  });

  it('Kariyer.net ilanını data-test alanlarından okur', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 16, 10, 0) });
    document.body.innerHTML = `
      <h1><div data-test="job-title"> Bilgisayar Mühendisi </div>
        <a data-test="company-name" href="#"> B.Bilişim </a></h1>
      <span data-test="company-location"> Adana, Adıyaman </span>
      <div class="job-detail-content"><div data-test="qualifications-and-job-description">Java bilen
        mühendis arıyoruz.<br>Tam zamanlı.</div></div>`;
    const { parsed } = prefillOf(
      run('https://www.kariyer.net/is-ilani/b-bilisim-bilgisayar-muhendisi-4580270?utm_source=x')
        .opened,
    );
    expect(parsed.rejected).toEqual([]);
    expect(parsed.values).toEqual({
      positionTitle: 'Bilgisayar Mühendisi',
      companyName: 'B.Bilişim',
      location: 'Adana, Adıyaman',
      jobUrl: 'https://www.kariyer.net/is-ilani/b-bilisim-bilgisayar-muhendisi-4580270',
      source: 'kariyer_net',
      appliedAt: '2026-10-16',
      jobDescription: 'Java bilen mühendis arıyoruz.\nTam zamanlı.',
    });
  });

  it('Youthall ve şirket sayfalarında schema.org JobPosting verisini okur', () => {
    const posting = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Youthall' },
        {
          '@type': 'JobPosting',
          title: 'Veri Bilimci Yetiştirme Programı',
          hiringOrganization: { '@type': 'Organization', name: 'Code2Work' },
          jobLocation: [
            { '@type': 'Place', address: { addressLocality: 'Adana' } },
            { '@type': 'Place', address: { addressLocality: 'İstanbul' } },
            { '@type': 'Place', address: { addressLocality: 'Adana' } },
          ],
          description:
            '<p><b>Program</b></p><ul><li>6 ay eğitim</li><li>İşe giriş desteği</li></ul><img src=x onerror="window.hacked=1">',
        },
      ],
    };
    document.head.innerHTML = `<link rel="canonical" href="https://www.youthall.com/tr/code2work/program_11/">
      <script type="application/ld+json">{bozuk</script>
      <script type="application/ld+json">${JSON.stringify(posting)}</script>`;
    const { parsed } = prefillOf(
      run('https://www.youthall.com/tr/code2work/program_11/?ref=liste').opened,
    );
    expect(parsed.values).toMatchObject({
      positionTitle: 'Veri Bilimci Yetiştirme Programı',
      companyName: 'Code2Work',
      location: 'Adana, İstanbul',
      jobUrl: 'https://www.youthall.com/tr/code2work/program_11/',
      source: 'youthall',
      jobDescription: 'Program\n- 6 ay eğitim\n- İşe giriş desteği',
    });
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
  });

  it('çok şehirli ilanda ilk üç şehri ve kalan sayısını yazar; madde işaretini "- " yapar', () => {
    const posting = {
      '@type': 'JobPosting',
      title: 'Stajyer',
      hiringOrganization: 'Acme',
      jobLocation: ['Adana', 'Ankara', 'Bursa', 'İzmir', 'Van'].map((city) => ({
        '@type': 'Place',
        address: { addressLocality: city },
      })),
      description: '<p>• Takım çalışması</p>',
    };
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify(posting)}</script>`;
    const { parsed } = prefillOf(run('https://www.youthall.com/tr/acme/stajyer_3/').opened);
    expect(parsed.values.location).toBe('Adana, Ankara, Bursa +2');
    expect(parsed.values.companyName).toBe('Acme');
    expect(parsed.values.jobDescription).toBe('- Takım çalışması');
  });

  it('veri yoksa şirket sayfasında başlık ve adresle açar; https olmayan adresi göndermez', () => {
    document.head.innerHTML = '<meta property="og:site_name" content="Acme Kariyer">';
    document.body.innerHTML = '<h1> Kıdemli Backend Geliştirici </h1>';
    const secure = prefillOf(run('https://kariyer.acme.com/ilanlar/42?utm_campaign=x').opened);
    expect(secure.parsed.values).toMatchObject({
      positionTitle: 'Kıdemli Backend Geliştirici',
      companyName: 'Acme Kariyer',
      jobUrl: 'https://kariyer.acme.com/ilanlar/42',
      source: 'company_site',
    });
    expect(secure.parsed.values.jobDescription).toBeUndefined();

    const insecure = prefillOf(run('http://kariyer.acme.com/ilanlar/42').opened);
    expect(insecure.parsed.rejected).toEqual(['url']);
    expect(insecure.parsed.values.positionTitle).toBe('Kıdemli Backend Geliştirici');
  });

  it('ilan metnini 20.000 karakterde keser; emojinin ortasından kesmez', () => {
    document.body.innerHTML = `${TOP_CARD}<div id="job-details">${'a'.repeat(19_999)}😀sonrası</div>`;
    const { parsed } = prefillOf(run('https://www.linkedin.com/jobs/view/4012345678/').opened);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.values.jobDescription).toBe('a'.repeat(19_999));
  });

  it('küçültülmüş sürüm kaynakla güncel ve aynı davranır', async () => {
    expect(BOOKMARKLET_TEMPLATE).toBe(await buildBookmarklet(source));
    expect(BOOKMARKLET_TEMPLATE.startsWith('javascript:')).toBe(true);
    expect(BOOKMARKLET_TEMPLATE).toContain(BOOKMARKLET_ORIGIN_PLACEHOLDER);

    document.body.innerHTML = TOP_CARD;
    const minified = decodeURIComponent(
      BOOKMARKLET_TEMPLATE.slice('javascript:'.length),
    ).replaceAll(BOOKMARKLET_ORIGIN_PLACEHOLDER, ORIGIN);
    const { url, parsed } = prefillOf(
      run('https://www.linkedin.com/jobs/view/4012345678/', minified).opened,
    );
    expect(url.origin).toBe(ORIGIN);
    expect(parsed.values.positionTitle).toBe('Veri Bilimci');
  });
});
