import { describe, it, expect } from 'vitest';
import { hryvniaInWords } from '@/lib/acts/amount-in-words';

// Сумма прописью (укр.) для печатной формы «Рахунок-Акт» (v2 Этап 5).
// Эталон — образец клиента: 19000 → «Дев'ятнадцять тисяч гривень 00 копійок».

describe('hryvniaInWords', () => {
  it('совпадает с образцом клиента (19000)', () => {
    expect(hryvniaInWords(19000)).toBe('Дев’ятнадцять тисяч гривень 00 копійок');
  });

  it('нуль', () => {
    expect(hryvniaInWords(0)).toBe('Нуль гривень 00 копійок');
  });

  it('род «гривня» — 1/2/5 (женский)', () => {
    expect(hryvniaInWords(1)).toBe('Одна гривня 00 копійок');
    expect(hryvniaInWords(2)).toBe('Дві гривні 00 копійок');
    expect(hryvniaInWords(5)).toBe('П’ять гривень 00 копійок');
  });

  it('склонение гривні: 21 / 24 / 25', () => {
    expect(hryvniaInWords(21)).toBe('Двадцять одна гривня 00 копійок');
    expect(hryvniaInWords(24)).toBe('Двадцять чотири гривні 00 копійок');
    expect(hryvniaInWords(25)).toBe('Двадцять п’ять гривень 00 копійок');
  });

  it('тисячі — женский род, склонение', () => {
    expect(hryvniaInWords(1000)).toBe('Одна тисяча гривень 00 копійок');
    expect(hryvniaInWords(2000)).toBe('Дві тисячі гривень 00 копійок');
    expect(hryvniaInWords(5000)).toBe('П’ять тисяч гривень 00 копійок');
  });

  it('мільйон/мільярд — мужской род', () => {
    expect(hryvniaInWords(1_000_000)).toBe('Один мільйон гривень 00 копійок');
    expect(hryvniaInWords(2_000_000)).toBe('Два мільйони гривень 00 копійок');
    expect(hryvniaInWords(1_000_000_000)).toBe('Один мільярд гривень 00 копійок');
  });

  it('копейки: 1 / 2 / 5 / 56 + двузначное число', () => {
    expect(hryvniaInWords(0.01)).toBe('Нуль гривень 01 копійка');
    expect(hryvniaInWords(0.02)).toBe('Нуль гривень 02 копійки');
    expect(hryvniaInWords(0.05)).toBe('Нуль гривень 05 копійок');
    expect(hryvniaInWords(1234.56)).toBe('Одна тисяча двісті тридцять чотири гривні 56 копійок');
  });

  it('сотни и десятки', () => {
    expect(hryvniaInWords(999)).toBe('Дев’ятсот дев’яносто дев’ять гривень 00 копійок');
    expect(hryvniaInWords(115)).toBe('Сто п’ятнадцять гривень 00 копійок');
  });

  it('копейки из дробной части (0.1 → 10)', () => {
    expect(hryvniaInWords(0.1)).toBe('Нуль гривень 10 копійок');
  });

  it('отрицательное/NaN → пустая строка', () => {
    expect(hryvniaInWords(-5)).toBe('');
    expect(hryvniaInWords(Number.NaN)).toBe('');
  });
});
