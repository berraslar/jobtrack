import { describe, expect, it } from 'vitest';
import { maskPii, restorePii } from './masking.js';

// ADR-0010: maskeleme ve geri yerleştirme.

const CV = `# AYŞE YILMAZ
Ayşe Yılmaz · Veri Bilimci
ayse.yilmaz@example.com | +90 (532) 123 45 67 | Kadıköy, İstanbul
https://www.linkedin.com/in/ayseyilmaz · github.com/ayse-y

## Deneyim
### Veri Bilimci — Örnek Analitik A.Ş. (03/2021 – Halen, 3 yıl)
- Talep tahmini; referans: Yılmaz, A. (2023)
- Moda Cad. No: 12 Daire 3 adresindeki ofiste hibrit çalıştı.
- İletişim: ik@ornek.com.tr veya 0212 555 12 34.
`;

const known = {
  fullName: 'Ayşe Yılmaz',
  email: 'ayse.yilmaz@example.com',
  phone: '+90 (532) 123 45 67',
  location: 'Kadıköy, İstanbul',
  links: ['https://www.linkedin.com/in/ayseyilmaz', null],
  extraTerms: ['Moda Cad. No: 12 Daire 3'],
};

describe('maskPii', () => {
  const { masked, mapping } = maskPii(CV, known);

  it('ad, e-posta, telefon, adres, bağlantı ve ek ifadeleri metinden çıkarır', () => {
    for (const secret of [
      'Ayşe Yılmaz',
      'AYŞE YILMAZ',
      'Yılmaz',
      'ayse.yilmaz@example.com',
      'ik@ornek.com.tr',
      '+90 (532) 123 45 67',
      '0212 555 12 34',
      'Kadıköy, İstanbul',
      'linkedin.com/in/ayseyilmaz',
      'github.com/ayse-y',
      'Moda Cad. No: 12',
    ]) {
      expect(masked).not.toContain(secret);
    }
    expect(masked).toContain('[[AD_1]]');
    expect(masked).toContain('[[EPOSTA_1]]');
    expect(masked).toContain('[[TELEFON_1]]');
    expect(masked).toContain('[[ADRES_1]]');
    expect(masked).toContain('[[BAGLANTI_1]]');
    expect(masked).toContain('[[OZEL_1]]');
  });

  it('deneyim, şirket adı, tarih ve süreleri olduğu gibi bırakır', () => {
    expect(masked).toContain('Veri Bilimci — Örnek Analitik A.Ş. (03/2021 – Halen, 3 yıl)');
    expect(masked).toContain('(2023)');
  });

  it('aynı değer her yerde aynı yer tutucuyu alır', () => {
    const emailTokens = [...mapping.entries()].filter(([, v]) => v === known.email);
    expect(emailTokens).toHaveLength(1);
  });

  it('geri yerleştirince özgün metin birebir döner', () => {
    expect(restorePii(masked, mapping)).toEqual({ text: CV, unknownPlaceholders: [] });
  });

  it('model metni yeniden düzenlese de yer tutucular geri yerleşir; uydurulanlar raporlanır', () => {
    const output = '# [[AD_1]]\n[[EPOSTA_1]] · [[BAGLANTI_1]]\nReferans: [[AD_9]]';
    expect(restorePii(output, mapping)).toEqual({
      text: '# Ayşe Yılmaz\nayse.yilmaz@example.com · https://www.linkedin.com/in/ayseyilmaz\nReferans: [[AD_9]]',
      unknownPlaceholders: ['[[AD_9]]'],
    });
  });

  it('kelime içindeki parçaları maskelemez ve kısa ad parçalarını tek başına aramaz', () => {
    const { masked: out } = maskPii('Can Ak; Akdeniz projesi, Cankaya ofisi.', {
      fullName: 'Can Ak',
    });
    expect(out).toBe('[[AD_1]]; Akdeniz projesi, Cankaya ofisi.');
  });

  it('yılları ve tarih aralıklarını telefon sanmaz; bağlantı sonundaki noktayı korur', () => {
    const { masked: out } = maskPii('2019 - 2021, 03/2021. Bkz. www.ornek.com.', {});
    expect(out).toBe('2019 - 2021, 03/2021. Bkz. [[BAGLANTI_1]].');
  });

  it('bilinen değer yoksa ve metinde kişisel bilgi yoksa metni değiştirmez', () => {
    expect(maskPii('Python, SQL, dbt', {}).masked).toBe('Python, SQL, dbt');
  });

  it('uzun ve patolojik girdide hızlı kalır', () => {
    const evil = `${'a.'.repeat(20_000)}@${'1 '.repeat(10_000)}`;
    const started = performance.now();
    maskPii(evil, {});
    expect(performance.now() - started).toBeLessThan(500);
  });
});
