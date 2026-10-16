import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown, parseBlocks } from './markdown';

afterEach(cleanup);

describe('Markdown (yazdırma görünümü, FR-24)', () => {
  it('başlık, liste ve paragrafları ayırır', () => {
    expect(parseBlocks('# Ad\n\nÖzet satırı\nikinci satır\n- Python\n* SQL\n\n## Deneyim')).toEqual(
      [
        { kind: 'heading', level: 1, text: 'Ad' },
        { kind: 'paragraph', text: 'Özet satırı ikinci satır' },
        { kind: 'list', items: ['Python', 'SQL'] },
        { kind: 'heading', level: 2, text: 'Deneyim' },
      ],
    );
  });

  it('satır içi biçimleri öğe olarak, HTML’i metin olarak yazar; bağlantı tıklanamaz', () => {
    const { container } = render(
      <Markdown
        source={
          '**Kalın** ve *italik* `kod` [Profil](javascript:alert(1)) <img src=x onerror=alert(1)>'
        }
      />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('Kalın');
    expect(container.querySelector('em')?.textContent).toBe('italik');
    expect(container.querySelector('code')?.textContent).toBe('kod');
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Profil (javascript:alert(1))');
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
