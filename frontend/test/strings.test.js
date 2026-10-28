import { describe, expect, it } from 'vitest';
import { DEFAULT_LANG, LANGS, STRINGS } from '../src/i18n/strings';

const placeholders = (text) => (typeof text === 'string' ? [...text.matchAll(/\{(\w+)[}|]/g)].map((m) => m[1]).sort() : []);

describe('translations', () => {
  it('has Thai first, and English', () => {
    expect(LANGS).toEqual(['th', 'en']);
    expect(DEFAULT_LANG).toBe('th');
  });

  it('has every Thai text in English and every English text in Thai', () => {
    const th = Object.keys(STRINGS.th);
    const en = Object.keys(STRINGS.en);
    expect(th.filter((k) => !(k in STRINGS.en))).toEqual([]);
    expect(en.filter((k) => !(k in STRINGS.th))).toEqual([]);
  });

  it('uses the same {placeholders} in both languages', () => {
    const differ = Object.keys(STRINGS.th).filter(
      (k) => placeholders(STRINGS.th[k]).join() !== placeholders(STRINGS.en[k]).join()
    );
    expect(differ).toEqual([]);
  });
});
