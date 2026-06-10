import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildActWorkbook } from '@/lib/acts/xlsx';
import type { ActPrintData } from '@/lib/acts/queries';

// Печатная форма акта (v2 Этап 5): проверяем, что XLSX строится и содержит
// ключевые поля (номер/дата, реквизиты, заказчик, сумма прописью, призначення).

const DATA: ActPrintData = {
  act: {
    id: 'a1',
    case_id: 'c1',
    number: 40,
    service_name: 'Юридичні послуги',
    service_period: null,
    amount: 19000,
    confirmed_amount: null,
    completion: null,
    status: 'issued',
    issued_at: '2026-05-29',
    paid_at: null,
    scan_document_id: null,
    note: null,
    created_by: 'u1',
    created_at: '2026-05-29T10:00:00Z',
  },
  caseTitle: 'CRM-2026-001',
  caseSubject: null,
  client: { name: 'Новикова Ганна Михайлівна', client_kind: 'individual', inn: '2948213748' },
  org: {
    org_name: 'ТОВ "ЦЕНТР ЮРИДИЧНОГО ЗАХИСТУ "ОЛІМП"',
    edrpou: '45679789',
    address: '49038, м. Дніпро',
    phone: '+380996667366',
    iban: 'UA053220010000026003700003989',
    bank_name: 'АТ "УНІВЕРСАЛ БАНК"',
    mfo: '322001',
    tax_status_lines: ['Не є платником ПДВ', 'Є платником єдиного податку, 3 група'],
    updated_at: '',
  },
};

async function allText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  const parts: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      parts.push(String(cell.value ?? ''));
    });
  });
  return parts.join('\n');
}

describe('buildActWorkbook', () => {
  it('строит валидный XLSX (непустой буфер)', async () => {
    const buf = await buildActWorkbook(DATA);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('содержит номер, дату, реквизиты, заказчика, РНОКПП', async () => {
    const text = await allText(await buildActWorkbook(DATA));
    expect(text).toContain('РАХУНОК-АКТ № 40 від 29 травня 2026 р.');
    expect(text).toContain('ВИКОНАВЕЦЬ:');
    expect(text).toContain('ЗАМОВНИК:');
    expect(text).toContain('ЄДРПОУ 45679789');
    expect(text).toContain('Новикова Ганна Михайлівна');
    expect(text).toContain('РНОКПП 2948213748');
    expect(text).toContain('Не є платником ПДВ');
  });

  it('содержит сумму прописью и призначення платежу', async () => {
    const text = await allText(await buildActWorkbook(DATA));
    expect(text).toContain('Дев’ятнадцять тисяч гривень 00 копійок');
    expect(text).toContain('Призначення платежу: Оплата за рахунком-актом № 40 від 29 травня 2026 р.');
  });

  it('для компании показывает ЄДРПОУ заказчика', async () => {
    const text = await allText(
      await buildActWorkbook({
        ...DATA,
        client: { name: 'ТОВ "Ромашка"', client_kind: 'company', inn: '12345678' },
      }),
    );
    expect(text).toContain('ЄДРПОУ 12345678');
  });
});
