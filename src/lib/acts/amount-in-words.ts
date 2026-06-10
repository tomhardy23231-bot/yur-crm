// Сумма прописью на украинском для печатной формы «Рахунок-Акт» (v2 Этап 5).
//
// Гривни — словами с правильным родом/склонением, копейки — двузначным числом
// + склонённое «копійок» (как в образце клиента: «Дев'ятнадцять тисяч гривень
// 00 копійок»). Чистая функция без зависимостей и 'server-only' → используется и
// генератором XLSX, и юнит-тестами.
//
// Род: гривня и тисяча — женский («одна гривня», «дві тисячі»); мільйон/мільярд —
// мужской («один мільйон», «два мільйони»). Апостроф — типографский (’, U+2019),
// чтобы совпадать с образцом.

const ONES_M = ['', 'один', 'два', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять'];
const ONES_F = ['', 'одна', 'дві', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять'];
const TEENS = [
  'десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять',
  'п’ятнадцять', 'шістнадцять', 'сімнадцять', 'вісімнадцять', 'дев’ятнадцять',
];
const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', 'п’ятдесят', 'шістдесят', 'сімдесят', 'вісімдесят', 'дев’яносто'];
const HUNDREDS = ['', 'сто', 'двісті', 'триста', 'чотириста', 'п’ятсот', 'шістсот', 'сімсот', 'вісімсот', 'дев’ятсот'];

// Украинское/славянское правило множественного: [1, 2–4, 0/5–9/11–14].
function plural(n: number, forms: readonly [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

// Слова для трёхзначной группы (0–999) с учётом рода единиц (1, 2).
function group3(n: number, feminine: boolean): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) out.push(HUNDREDS[h]!);
  if (rest >= 10 && rest < 20) {
    out.push(TEENS[rest - 10]!);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) out.push(TENS[t]!);
    if (o) out.push((feminine ? ONES_F : ONES_M)[o]!);
  }
  return out;
}

type Scale = { words: readonly [string, string, string] | null; feminine: boolean };

// units → род женский (гривня); тисяча — ж.р.; мільйон/мільярд — м.р.
const SCALES: readonly Scale[] = [
  { words: null, feminine: true },
  { words: ['тисяча', 'тисячі', 'тисяч'], feminine: true },
  { words: ['мільйон', 'мільйони', 'мільйонів'], feminine: false },
  { words: ['мільярд', 'мільярди', 'мільярдів'], feminine: false },
];

const HRYVNIA: readonly [string, string, string] = ['гривня', 'гривні', 'гривень'];
const KOPECK: readonly [string, string, string] = ['копійка', 'копійки', 'копійок'];

// Целое число гривен → слова (без валютного слова).
function integerToWords(n: number): string[] {
  if (n === 0) return ['нуль'];
  const groups: number[] = [];
  let x = n;
  while (x > 0) {
    groups.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (g === 0) continue;
    const scale = SCALES[Math.min(i, SCALES.length - 1)]!;
    out.push(...group3(g, scale.feminine));
    if (scale.words) out.push(plural(g, scale.words));
  }
  return out;
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/**
 * Сумма прописью (укр.): «Дев'ятнадцять тисяч гривень 00 копійок».
 * Гривни — словами, копейки — двузначным числом + склонённое «копійок».
 * Отрицательные/нечисловые → пустая строка (в акте сумма всегда > 0).
 */
export function hryvniaInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '';
  const cents = Math.round(amount * 100);
  const hrn = Math.floor(cents / 100);
  const kop = cents % 100;

  const words = integerToWords(hrn).join(' ');
  const hrnWord = plural(hrn, HRYVNIA);
  const kopStr = String(kop).padStart(2, '0');
  const kopWord = plural(kop, KOPECK);

  return `${capitalize(words)} ${hrnWord} ${kopStr} ${kopWord}`;
}
