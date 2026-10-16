/*
 * "JobTrack'e kaydet" yer imi betiği (FR-22, ADR-0009). Okunabilir kaynak budur; Ayarlar
 * sayfasındaki bağlantı, bundan üretilen küçültülmüş sürümü kullanır:
 *   corepack pnpm --filter @jobtrack/web build:bookmarklet
 *
 * Betik yalnızca açık ilan sayfasını okur ve JobTrack'te yeni başvuru formunu önceden dolu açar.
 * Ağ isteği yapmaz, sayfaya bir şey eklemez, çerez okumaz. Kaydı kullanıcı yapar.
 * Okuma sırası: siteye özel alanlar (LinkedIn, Kariyer.net), sonra sayfadaki schema.org
 * JobPosting verisi (Youthall ve çoğu şirket kariyer sayfası), en son sayfa başlığı.
 * İlan metni sorgu dizesinde değil adres parçasında (#ilan=) gider: sunucuya ulaşmaz, loglanmaz.
 * __JOBTRACK_ORIGIN__ yer tutucusu Ayarlar sayfasında uygulamanın kökeniyle değiştirilir.
 */
(() => {
  const ORIGIN = '__JOBTRACK_ORIGIN__';
  const MAX_LENGTH = 200;
  const MAX_DESCRIPTION = 20000;
  const CARD = '.job-details-jobs-unified-top-card__';

  const host = location.hostname.toLowerCase();
  const on = (domain) => host === domain || host.endsWith(`.${domain}`);

  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  /** Satır sonlarını koruyarak sadeleştirir. */
  const multiline = (value) =>
    (value || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) =>
        line
          .replace(/[^\S\n]+/g, ' ')
          .trim()
          .replace(/^[•·▪●◦‣]\s*/, '- '),
      )
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  /** Seçicileri sırayla dener; ilk dolu metni döndürür. */
  const pick = (selectors) => {
    for (const selector of selectors) {
      const text = clean(document.querySelector(selector)?.textContent);
      if (text) return text;
    }
    return '';
  };
  /**
   * HTML ilan metnini düz metne çevirir: metindeki boşluklar tarayıcıdaki gibi tek boşluğa iner,
   * paragraf ve `<br>` satır, liste öğesi "- " maddesi olur. DOMParser betik çalıştırmaz, resim
   * yüklemez; sayfanın kendi HTML'i de bu yoldan geçer.
   */
  const htmlToText = (html) => {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    for (const node of doc.querySelectorAll('script, style, noscript, template')) node.remove();
    const walker = doc.createTreeWalker(doc.body, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      node.nodeValue = node.nodeValue.replace(/\s+/g, ' ');
    }
    for (const br of doc.querySelectorAll('br')) br.replaceWith('\n');
    for (const li of doc.querySelectorAll('li')) li.prepend('- ');
    for (const block of doc.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, tr, ul, ol')) {
      block.append('\n');
    }
    return multiline(doc.body.textContent);
  };

  /** Çok satırlı metin bölümü: ilk dolu seçicinin içeriği, düz metin olarak. */
  const pickBlock = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = element ? htmlToText(element.innerHTML) : '';
      if (text) return text;
    }
    return '';
  };

  /** Sayfadaki schema.org JobPosting nesnesi (JSON-LD), yoksa null. */
  const jobPosting = () => {
    const isPosting = (node) =>
      node && [].concat(node['@type']).some((type) => type === 'JobPosting');
    const find = (node) => {
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = find(item);
          if (found) return found;
        }
        return null;
      }
      if (!node || typeof node !== 'object') return null;
      return isPosting(node) ? node : find(node['@graph']);
    };
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const found = find(JSON.parse(script.textContent));
        if (found) return found;
      } catch {
        // Bozuk JSON-LD: sonraki blok denenir.
      }
    }
    return null;
  };

  /** İlan metni bölümünün başlığı ("İş Tanımı", "About the job" …). */
  const SECTION_HEADING =
    /^(iş tanımı|iş ilanı hakkında|ilan detayı|ilan açıklaması|genel nitelikler|aranan nitelikler|nitelikler|görev ve sorumluluklar|görevler|sorumluluklar|pozisyon hakkında|about the job|about the role|job description|description|responsibilities|requirements|qualifications|what you'?ll do)\b/;

  /**
   * Son çare: sayfada ilan metni başlığı arar ve onu içeren, en az 300 karakterlik ilk bloğu alır.
   * Sitelere özel seçiciler değiştiğinde (sınıf adları sık değişir) metni yine bulmak içindir.
   */
  const byHeading = () => {
    for (const element of document.querySelectorAll(
      'h1, h2, h3, h4, h5, strong, b, span, p, div',
    )) {
      if (element.children.length > 1) continue;
      const own = clean(element.textContent).replace(/[:：]$/, '');
      if (own.length > 60) continue;
      if (
        !SECTION_HEADING.test(own.toLocaleLowerCase('tr')) &&
        !SECTION_HEADING.test(own.toLowerCase())
      ) {
        continue;
      }
      let box = element.parentElement;
      while (box && clean(box.textContent).length < 300) box = box.parentElement;
      if (!box || box === document.body || box === document.documentElement) continue;
      const text = htmlToText(box.innerHTML);
      if (text.length >= 200 && text.length <= MAX_DESCRIPTION) return text;
    }
    return '';
  };

  const posting = jobPosting();
  const fromPosting = () => {
    if (!posting) return {};
    const org = posting.hiringOrganization;
    const places = []
      .concat(posting.jobLocation || [])
      .map((place) => {
        const address = place?.address || {};
        return clean(typeof address === 'string' ? address : address.addressLocality);
      })
      .filter((place, i, all) => place && all.indexOf(place) === i);
    const remote = [].concat(posting.jobLocationType || []).includes('TELECOMMUTE');
    return {
      title: clean(posting.title),
      company: clean(typeof org === 'string' ? org : org?.name),
      // Çok şehirli ilanlarda (Youthall'da 81 il olabiliyor) ilk üçü ve kalan sayısı.
      place:
        (places.length > 3
          ? `${places.slice(0, 3).join(', ')} +${String(places.length - 3)}`
          : places.join(', ')) || (remote ? 'Uzaktan' : ''),
      description: htmlToText(posting.description),
    };
  };

  let title = '';
  let company = '';
  let place = '';
  let description = '';
  let url;
  let source = 'company_site';

  if (on('linkedin.com')) {
    source = 'linkedin';
    title = pick([`${CARD}job-title h1`, `${CARD}job-title`]);
    company = pick([`${CARD}company-name a`, `${CARD}company-name`]);
    // Konum, açıklama satırının " · " ile ayrılmış ilk parçasıdır ("İstanbul, Türkiye · 2 gün önce").
    const summary = pick([
      `${CARD}primary-description-container`,
      `${CARD}tertiary-description-container`,
    ]);
    place = clean(summary.split('·')[0]) || pick([`${CARD}bullet`]);
    description =
      pickBlock([
        '#job-details',
        '.jobs-description__content',
        '.jobs-box__html-content',
        '[class*="jobs-description"]',
      ]) ||
      fromPosting().description ||
      byHeading();

    // Yedek: sekme başlığı "(3) Veri Bilimci | Örnek Analitik | LinkedIn" biçimindedir.
    if (!title || !company) {
      const parts = document.title.split(' | ').map(clean);
      if (!title && parts.length >= 2) title = clean(parts[0].replace(/^\(\d+\)/, ''));
      if (!company && parts.length >= 3) company = parts[1];
    }

    // Temiz ilan bağlantısı: currentJobId parametresinden ya da /jobs/view/<id> yolundan.
    const segments = location.pathname.split('/').filter(Boolean);
    const last = segments[0] === 'jobs' && segments[1] === 'view' ? segments[2] || '' : '';
    const id =
      new URLSearchParams(location.search).get('currentJobId') ||
      last.slice(last.lastIndexOf('-') + 1);
    url = /^\d{6,20}$/.test(id) ? `https://www.linkedin.com/jobs/view/${id}/` : '';
  } else {
    if (on('kariyer.net')) {
      source = 'kariyer_net';
      title = pick(['[data-test="job-title"]']);
      company = pick(['[data-test="company-name"]']);
      place = pick(['[data-test="company-location"]']);
      description = pickBlock([
        '.job-detail-content',
        '[data-test="qualifications-and-job-description"]',
      ]);
    } else if (on('youthall.com')) {
      source = 'youthall';
    }
    const ld = fromPosting();
    title = title || ld.title || pick(['h1']) || clean(document.title);
    company =
      company ||
      ld.company ||
      clean(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content'));
    place = place || ld.place || '';
    description = description || ld.description || byHeading();
    // Kanonik bağlantı varsa o (izleme parametresiz olur), yoksa sayfa adresi. JobTrack yeniden
    // doğrular: yalnızca https kabul edilir, izleme parametreleri atılır.
    const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
    url = /^https:\/\//.test(canonical) ? canonical : location.href;
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const params = new URLSearchParams();
  const put = (name, value) => {
    if (value) params.set(name, value.slice(0, MAX_LENGTH));
  };
  put('title', title);
  put('company', company);
  put('location', place);
  if (url) params.set('url', url.slice(0, 2048));
  params.set('source', source);
  params.set('appliedAt', today);
  // Yer imi sürümü: JobTrack eski yer imiyle açılan formda yenilemeyi önerir.
  params.set('yerimi', '2');

  // Kesim bir emojinin ortasına denk gelirse yarım kalan vekil karakter atılır (encodeURIComponent
  // yarım vekil karakterde hata verir).
  const cut = description.slice(0, MAX_DESCRIPTION).replace(/[\ud800-\udbff]$/, '');
  const fragment = cut ? `#ilan=${encodeURIComponent(cut)}` : '';
  window.open(`${ORIGIN}/basvurular/yeni?${params.toString()}${fragment}`, '_blank', 'noopener');
})();
