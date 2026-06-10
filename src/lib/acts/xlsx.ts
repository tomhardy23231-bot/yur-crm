// Генерация печатной формы «Рахунок-Акт» в XLSX по образцу клиента
// (docs/samples/rahunok-akt-sample.xlsx). exceljs, без шаблонного бинарника —
// структура и стили собираются кодом. Чистый серверный модуль (exceljs — node).

import ExcelJS from 'exceljs';

import { hryvniaInWords } from '@/lib/acts/amount-in-words';
import type { ActPrintData } from '@/lib/acts/queries';

const UA_MONTHS_GENITIVE = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];

// «2026-05-29» → «29 травня 2026 р.»
function formatUaDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const name = UA_MONTHS_GENITIVE[month - 1] ?? '';
  return `${day} ${name} ${year} р.`;
}

// «РНОКПП 123…» для физлица/ФОП; «ЄДРПОУ 123…» для компании.
function customerTaxLabel(clientKind: string, inn: string | null): string {
  if (!inn) return '';
  const label = clientKind === 'company' ? 'ЄДРПОУ' : 'РНОКПП';
  return `${label} ${inn}`;
}

const MONEY_FMT = '#,##0.00';
const FONT = 'Arial';

// Текст условий принятия — фиксированные пункты из образца клиента.
const TERMS = [
  '1. Послуги (роботи) надано (виконано) відповідно до умов договору та цього рахунку-акта.',
  '2. У разі відсутності письмових заперечень з боку Замовника протягом 5 (п’яти) робочих днів з дати отримання цього рахунку-акта послуги (роботи) вважаються прийнятими без зауважень.',
  '3. Оплата цього рахунку-акта є підтвердженням прийняття послуг (робіт) Замовником та відсутності претензій щодо їх обсягу, якості та вартості.',
  '4. Цей рахунок-акт є первинним документом, що підтверджує факт надання послуг (виконання робіт). Підпис Замовника на цьому документі не є обов’язковим за умови дотримання сторонами погодженого порядку документування відповідно до ст. 9 Закону України «Про бухгалтерський облік та фінансову звітність в Україні».',
];

export async function buildActWorkbook(data: ActPrintData): Promise<Buffer> {
  const { act, client, org } = data;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Юр CRM';
  const ws = wb.addWorksheet('Рахунок-Акт', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // 7 колонок под таблицу услуг (№ | Артикул | Назва | Од.вим | К-сть | Ціна | Сума).
  ws.columns = [
    { width: 6 },
    { width: 11 },
    { width: 36 },
    { width: 10 },
    { width: 11 },
    { width: 14 },
    { width: 16 },
  ];

  const numberStr = String(act.number);
  const issuedStr = formatUaDate(act.issued_at);
  const words = hryvniaInWords(act.amount);

  let r = 1;
  const base = () => ws.getRow(r);

  // 1) Заголовок
  ws.mergeCells(r, 1, r, 7);
  const title = base().getCell(1);
  title.value = `РАХУНОК-АКТ № ${numberStr} від ${issuedStr}`;
  title.font = { name: FONT, size: 14, bold: true };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  base().height = 22;
  r += 2;

  // 2) ВИКОНАВЕЦЬ / ЗАМОВНИК — две колонки.
  const left = (text: string, opts: { bold?: boolean } = {}) => {
    ws.mergeCells(r, 1, r, 3);
    const c = ws.getRow(r).getCell(1);
    c.value = text;
    c.font = { name: FONT, size: 10, bold: opts.bold };
    c.alignment = { wrapText: true, vertical: 'top' };
  };
  const right = (text: string, opts: { bold?: boolean } = {}) => {
    ws.mergeCells(r, 4, r, 7);
    const c = ws.getRow(r).getCell(4);
    c.value = text;
    c.font = { name: FONT, size: 10, bold: opts.bold };
    c.alignment = { wrapText: true, vertical: 'top' };
  };

  left('ВИКОНАВЕЦЬ:', { bold: true });
  right('ЗАМОВНИК:', { bold: true });
  r += 1;
  left(org.org_name, { bold: true });
  right(client?.name ?? '', { bold: true });
  base().height = 30;
  r += 1;
  left(org.edrpou ? `ЄДРПОУ ${org.edrpou}` : '');
  right(customerTaxLabel(client?.client_kind ?? '', client?.inn ?? null));
  r += 1;
  left(org.address ? `Адреса ${org.address}` : '');
  base().height = 26;
  r += 1;
  left(org.phone ? `Телефон ${org.phone}` : '');
  r += 1;
  if (org.iban) {
    left(`П/р ${org.iban}${org.bank_name ? ` в ${org.bank_name}` : ''}${org.mfo ? ` МФО ${org.mfo}` : ''}`);
    base().height = 26;
    r += 1;
  }
  for (const line of org.tax_status_lines) {
    left(line);
    r += 1;
  }
  r += 1;

  // 3) Підстава + період
  const wide = (text: string, opts: { bold?: boolean } = {}) => {
    ws.mergeCells(r, 1, r, 7);
    const c = ws.getRow(r).getCell(1);
    c.value = text;
    c.font = { name: FONT, size: 10, bold: opts.bold };
    c.alignment = { wrapText: true, vertical: 'top' };
  };
  wide(`Підстава: Договір${data.caseTitle ? ` ${data.caseTitle}` : ''}`);
  r += 1;
  if (act.service_period) {
    wide(`Період надання послуг / виконання робіт: ${act.service_period}`);
    r += 1;
  }
  r += 1;

  // 4) Таблица услуг
  const thin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
  };
  const headers = ['№ з.п.', 'Артикул', 'Назва', 'Од. вим.', 'Кількість', 'Ціна', 'Сума'];
  const headRow = ws.getRow(r);
  headers.forEach((h, i) => {
    const c = headRow.getCell(i + 1);
    c.value = h;
    c.font = { name: FONT, size: 9, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = thin;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  });
  headRow.height = 26;
  r += 1;

  const dataRow = ws.getRow(r);
  const cells: Array<string | number> = [1, '', act.service_name, 'послуга', 1, act.amount, act.amount];
  cells.forEach((v, i) => {
    const c = dataRow.getCell(i + 1);
    c.value = v;
    c.font = { name: FONT, size: 10 };
    c.border = thin;
    if (i === 0 || i === 3 || i === 4) c.alignment = { horizontal: 'center', vertical: 'middle' };
    else c.alignment = { vertical: 'middle', wrapText: true };
    if (i === 5 || i === 6) c.numFmt = MONEY_FMT;
  });
  dataRow.height = 22;
  r += 2;

  // 5) Итоги (правый столбец — суммы)
  const totalRow = (label: string, value: number, bold = false) => {
    ws.mergeCells(r, 1, r, 6);
    const l = ws.getRow(r).getCell(1);
    l.value = label;
    l.font = { name: FONT, size: 10, bold };
    l.alignment = { horizontal: 'right', vertical: 'middle' };
    const v = ws.getRow(r).getCell(7);
    v.value = value;
    v.numFmt = MONEY_FMT;
    v.font = { name: FONT, size: 10, bold };
    v.alignment = { horizontal: 'right', vertical: 'middle' };
    r += 1;
  };
  totalRow('Разом без ПДВ', act.amount);
  totalRow('ПДВ', 0);
  totalRow('Усього', act.amount, true);
  r += 1;

  // 6) Сумма прописью + призначення + до оплати
  wide(`Загальна вартість: ${words}`, { bold: true });
  base().height = 18;
  r += 1;
  wide(`Призначення платежу: Оплата за рахунком-актом № ${numberStr} від ${issuedStr}`);
  r += 1;
  wide(`До оплати: ${words}`, { bold: true });
  r += 2;

  // 7) Умови прийняття
  wide('Умови прийняття:', { bold: true });
  r += 1;
  for (const term of TERMS) {
    ws.mergeCells(r, 1, r, 7);
    const c = ws.getRow(r).getCell(1);
    c.value = term;
    c.font = { name: FONT, size: 9 };
    c.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(r).height = term.length > 160 ? 46 : 26;
    r += 1;
  }
  r += 1;

  // 8) Подпись
  wide('Від Виконавця: __________________________  (підпис / КЕП)');
  r += 1;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as unknown as ArrayBuffer);
}
