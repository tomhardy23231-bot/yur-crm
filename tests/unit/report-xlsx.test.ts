import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReportWorkbook } from '@/lib/reports/export/xlsx';
import type { ReportDoc } from '@/lib/reports/export/types';

// Выгрузка отчёта в XLSX (2026-08-03). Главное, что проверяем: суммы уходят
// ЧИСЛАМИ с денежным форматом, а не текстом «12 500,00 ₴». Иначе бухгалтер не
// сможет ничего сложить в выгруженном файле, и весь смысл Excel теряется.

const DOC: ReportDoc = {
  title: 'Оборотно-сальдова відомість',
  periodLabel: 'Липень 2026',
  org: { name: 'ТОВ «ОЛІМП»', edrpou: '45679789' },
  columns: [
    { key: 'account', label: 'Рахунок', type: 'text' },
    { key: 'opening', label: 'Залишок на початок', type: 'money' },
    { key: 'inflow', label: 'Надходження', type: 'money' },
    { key: 'share', label: 'Частка', type: 'percent' },
    { key: 'cnt', label: 'Операцій', type: 'number' },
  ],
  rows: [
    {
      cells: { account: 'Моно', opening: 10000, inflow: 25000.5, share: 0.75, cnt: 12 },
    },
    {
      cells: { account: 'Готівка', opening: 0, inflow: 8333.33, share: 0.25, cnt: 4 },
    },
  ],
  totals: { account: 'Разом', opening: 10000, inflow: 33333.83, share: 1, cnt: 16 },
  notes: ['Каса ведеться з 27.07.2026.'],
  generatedAt: '03.08.2026 20:15',
  generatedBy: 'Владелец (owner)',
  fileBase: 'oborotka-2026-07-01_2026-07-31',
};

async function load(buf: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}

function allText(ws: ExcelJS.Worksheet): string {
  const parts: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => parts.push(String(cell.value ?? '')));
  });
  return parts.join('\n');
}

/** Первая ячейка с указанным числовым значением. */
function findNumeric(ws: ExcelJS.Worksheet, value: number): ExcelJS.Cell | null {
  let found: ExcelJS.Cell | null = null;
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (!found && typeof cell.value === 'number' && cell.value === value) {
        found = cell;
      }
    });
  });
  return found;
}

describe('buildReportWorkbook', () => {
  it('строит книгу и кладёт в неё шапку, период и реквизиты', async () => {
    const ws = await load(await buildReportWorkbook(DOC));
    const text = allText(ws);
    expect(text).toContain('Оборотно-сальдова відомість');
    expect(text).toContain('Липень 2026');
    expect(text).toContain('ТОВ «ОЛІМП»');
    expect(text).toContain('45679789');
  });

  it('заголовки колонок и названия строк на месте', async () => {
    const ws = await load(await buildReportWorkbook(DOC));
    const text = allText(ws);
    expect(text).toContain('Рахунок');
    expect(text).toContain('Залишок на початок');
    expect(text).toContain('Моно');
    expect(text).toContain('Готівка');
    expect(text).toContain('Разом');
  });

  it('деньги уходят числом с денежным форматом, а не строкой', async () => {
    const ws = await load(await buildReportWorkbook(DOC));
    const cell = findNumeric(ws, 25000.5);
    expect(cell).not.toBeNull();
    expect(cell!.numFmt).toBe('#,##0.00');
  });

  it('доля уходит числом 0..1 с процентным форматом', async () => {
    const ws = await load(await buildReportWorkbook(DOC));
    const cell = findNumeric(ws, 0.75);
    expect(cell).not.toBeNull();
    expect(cell!.numFmt).toBe('0.0%');
  });

  it('итоговая строка содержит сумму', async () => {
    const ws = await load(await buildReportWorkbook(DOC));
    expect(findNumeric(ws, 33333.83)).not.toBeNull();
  });

  it('сноски и подпись формирования попадают в файл', async () => {
    const ws = await load(await buildReportWorkbook(DOC));
    const text = allText(ws);
    expect(text).toContain('Каса ведеться з 27.07.2026.');
    expect(text).toContain('03.08.2026 20:15');
    expect(text).toContain('Владелец (owner)');
  });

  it('шапка таблицы закреплена и включён автофильтр', async () => {
    const ws = await load(await buildReportWorkbook(DOC));
    expect(ws.views[0]?.state).toBe('frozen');
    expect(ws.autoFilter).toBeTruthy();
  });

  it('пустой отчёт не падает и остаётся без автофильтра', async () => {
    const empty: ReportDoc = { ...DOC, rows: [], totals: null };
    const ws = await load(await buildReportWorkbook(empty));
    expect(allText(ws)).toContain('Оборотно-сальдова відомість');
    expect(ws.autoFilter).toBeFalsy();
  });

  it('пустые ячейки (null) не превращаются в нули', async () => {
    const withNull: ReportDoc = {
      ...DOC,
      rows: [{ cells: { account: 'Без даних', opening: null, inflow: null, share: null, cnt: null } }],
      totals: null,
    };
    const ws = await load(await buildReportWorkbook(withNull));
    expect(findNumeric(ws, 0)).toBeNull();
  });
});
