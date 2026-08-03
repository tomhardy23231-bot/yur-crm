// Рендерер отчёта в XLSX (2026-08-03). Чистый серверный модуль: exceljs — node.
//
// Принцип тот же, что у печатной формы акта (lib/acts/xlsx): без шаблонного
// бинарника, структура и стили собираются кодом. На вход — ReportDoc, на выход
// — буфер книги. Ничего не считает: раскладывает уже готовые значения.
//
// Excel здесь не «картинка таблицы», а рабочий файл: суммы уходят ЧИСЛАМИ с
// денежным форматом (можно тут же сложить), шапка закреплена, включён
// автофильтр. Ради этого money/percent пишутся как number, а не как строка
// «12 500,00 ₴».

import ExcelJS from 'exceljs';

import type { ReportCell, ReportColumn, ReportDoc } from './types';

const FONT = 'Arial';
const MONEY_FMT = '#,##0.00';
const PERCENT_FMT = '0.0%';
const NUMBER_FMT = '#,##0';

const HEAD_FILL = 'FFEFEFEF';
const TOTAL_FILL = 'FFF7F7F7';

function alignFor(type: ReportColumn['type']): Partial<ExcelJS.Alignment> {
  if (type === 'money' || type === 'number' || type === 'percent') {
    return { horizontal: 'right', vertical: 'middle' };
  }
  if (type === 'date') return { horizontal: 'center', vertical: 'middle' };
  return { horizontal: 'left', vertical: 'middle', wrapText: true };
}

function numFmtFor(type: ReportColumn['type']): string | undefined {
  if (type === 'money') return MONEY_FMT;
  if (type === 'percent') return PERCENT_FMT;
  if (type === 'number') return NUMBER_FMT;
  return undefined;
}

// Числовые типы кладём числом, всё прочее — строкой. null оставляем пустым:
// пустая ячейка и ноль в отчёте значат разное.
function cellValue(v: ReportCell, type: ReportColumn['type']): ExcelJS.CellValue {
  if (v === null || v === undefined) return null;
  if (type === 'money' || type === 'number' || type === 'percent') {
    return typeof v === 'number' ? v : Number(v);
  }
  return String(v);
}

export async function buildReportWorkbook(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Юр CRM';
  wb.created = new Date();

  const ws = wb.addWorksheet(doc.title.slice(0, 30), {
    pageSetup: {
      paperSize: 9, // A4
      orientation: doc.columns.length > 5 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2,
      },
    },
  });

  const colCount = doc.columns.length;
  ws.columns = doc.columns.map((c) => ({
    width: c.width ?? (c.type === 'money' ? 16 : c.type === 'text' ? 32 : 12),
  }));

  let r = 1;
  const wide = (
    text: string,
    opts: { bold?: boolean; size?: number; align?: 'left' | 'center' } = {},
  ) => {
    ws.mergeCells(r, 1, r, Math.max(colCount, 1));
    const c = ws.getRow(r).getCell(1);
    c.value = text;
    c.font = { name: FONT, size: opts.size ?? 10, bold: opts.bold };
    c.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', wrapText: true };
    r += 1;
  };

  // ── Шапка ──────────────────────────────────────────────────────────────
  if (doc.org) {
    wide(doc.org.edrpou ? `${doc.org.name} · ЄДРПОУ ${doc.org.edrpou}` : doc.org.name, {
      bold: true,
    });
  }
  wide(doc.title, { bold: true, size: 13, align: 'center' });
  wide(doc.periodLabel, { align: 'center' });
  r += 1;

  // ── Шапка таблицы ──────────────────────────────────────────────────────
  const thin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  const headRowIndex = r;
  const headRow = ws.getRow(r);
  doc.columns.forEach((col, i) => {
    const c = headRow.getCell(i + 1);
    c.value = col.label;
    c.font = { name: FONT, size: 9, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = thin;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
  });
  headRow.height = 26;
  r += 1;

  // ── Строки ─────────────────────────────────────────────────────────────
  for (const row of doc.rows) {
    const excelRow = ws.getRow(r);
    doc.columns.forEach((col, i) => {
      const c = excelRow.getCell(i + 1);
      c.value = cellValue(row.cells[col.key] ?? null, col.type);
      c.font = { name: FONT, size: 9, bold: row.emphasis };
      c.alignment = alignFor(col.type);
      c.border = thin;
      const fmt = numFmtFor(col.type);
      if (fmt) c.numFmt = fmt;
    });
    r += 1;
  }

  // ── Итоги ──────────────────────────────────────────────────────────────
  if (doc.totals) {
    const totalRow = ws.getRow(r);
    doc.columns.forEach((col, i) => {
      const c = totalRow.getCell(i + 1);
      c.value = cellValue(doc.totals?.[col.key] ?? null, col.type);
      c.font = { name: FONT, size: 9.5, bold: true };
      c.alignment = alignFor(col.type);
      c.border = { ...thin, top: { style: 'double' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
      const fmt = numFmtFor(col.type);
      if (fmt) c.numFmt = fmt;
    });
    r += 1;
  }

  // Шапка таблицы остаётся на экране при прокрутке; автофильтр — чтобы
  // бухгалтер мог отсортировать выгрузку, не переделывая её.
  ws.views = [{ state: 'frozen', ySplit: headRowIndex }];
  if (doc.rows.length > 0) {
    ws.autoFilter = {
      from: { row: headRowIndex, column: 1 },
      to: { row: headRowIndex + doc.rows.length, column: colCount },
    };
  }

  // ── Сноски и подпись ───────────────────────────────────────────────────
  r += 1;
  for (const note of doc.notes ?? []) {
    wide(note, { size: 8 });
  }
  const by = doc.generatedBy ? ` · ${doc.generatedBy}` : '';
  wide(`Сформовано: ${doc.generatedAt}${by}`, { size: 8 });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
