import 'server-only';

import { cache } from 'react';

import { getT } from '@/lib/i18n/server';
import { getOrgRequisites } from '@/lib/org/queries';
import { getCurrentUser } from '@/lib/auth/current-user';
import { monthLabel, monthNamesFrom } from '@/lib/payroll/month';
import type { CashIncomeDim } from '@/lib/db/rpc';
import type { ReportDoc, ReportRow } from '@/lib/reports/export/types';
import { monthsInPeriod, periodLabel, type Period } from '@/lib/reports/period';
import { round2 } from '@/lib/cash/saldo';
import { getCashReportData } from '@/lib/cash/queries';
import {
  getExpensesByCategory,
  getProfitByCase,
  sumCategorySpend,
  sumProfit,
} from '@/lib/expenses/report';
import { cashStartDate, getFlowData, getIncomeData, getTurnoverData } from './queries';

// Сборка отчётов кассы в общую модель ReportDoc (2026-08-03).
//
// ОДИН источник цифр для всех трёх выходов: экран, Excel и печатная версия
// (PDF) читают этот же документ. Поэтому сумма в выгрузке физически не может
// разойтись с суммой на экране — она одна и та же.

/** Какие отчёты умеет строить касса. */
export type CashReportKind =
  | 'turnover'
  | 'flow'
  | 'income'
  | 'expenses'
  | 'profit'
  | 'summary'
  | 'registry';

export const CASH_REPORT_KINDS: CashReportKind[] = [
  'turnover',
  'flow',
  'income',
  'expenses',
  'profit',
  'summary',
  'registry',
];

export function isCashReportKind(v: string | null | undefined): v is CashReportKind {
  return CASH_REPORT_KINDS.includes(v as CashReportKind);
}

const INCOME_DIMS: CashIncomeDim[] = [
  'case',
  'client',
  'lawyer',
  'expert',
  'method',
  'account',
];

export function isIncomeDim(v: string | null | undefined): v is CashIncomeDim {
  return INCOME_DIMS.includes(v as CashIncomeDim);
}

/** Момент формирования в киевском времени — 'DD.MM.YYYY HH:mm'. */
function kyivStamp(): string {
  const parts = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return parts.replace(',', '');
}

/**
 * Общая шапка: реквизиты фирмы + кто и когда выгрузил.
 * cache(): страница строит семь документов, шапка у всех одна.
 */
const commonHeader = cache(async function commonHeader() {
  const [org, user] = await Promise.all([getOrgRequisites(), getCurrentUser()]);
  return {
    org: org.org_name ? { name: org.org_name, edrpou: org.edrpou } : null,
    generatedAt: kyivStamp(),
    generatedBy: user?.profile.full_name ?? null,
  };
});

/** 'oborotka-2026-07-01_2026-07-31' — стабильное имя файла выгрузки. */
const FILE_NAMES: Record<CashReportKind, string> = {
  turnover: 'oborotka',
  flow: 'rukh-koshtiv',
  income: 'dokhody',
  expenses: 'vytraty',
  profit: 'prybutkovist',
  summary: 'pidsumok',
  registry: 'reyestr-operaciy',
};

function fileBase(kind: CashReportKind, period: Period, suffix?: string): string {
  const tail = suffix ? `-${suffix}` : '';
  return `${FILE_NAMES[kind]}${tail}-${period.from}_${period.to}`;
}

async function labelOf(period: Period): Promise<string> {
  const { t } = await getT();
  return periodLabel(period, monthNamesFrom(t.payroll), {
    quarter: t.cash.period.quarterWord,
    year: t.cash.period.yearWord,
  });
}

// ── 1. Оборотно-сальдовая ведомость ───────────────────────────────────────
export async function buildTurnoverDoc(period: Period): Promise<ReportDoc> {
  const { t, fmt } = await getT();
  const r = t.cash.reports;
  const [{ accounts, turnover, before, through }, header, label] = await Promise.all([
    getTurnoverData(period),
    commonHeader(),
    labelOf(period),
  ]);

  const rows: ReportRow[] = accounts.map((a) => {
    const tv = turnover[a.id];
    const opening = round2(a.opening_balance + (before[a.id] ?? 0));
    const closing = round2(a.opening_balance + (through[a.id] ?? 0));
    return {
      cells: {
        account: a.name,
        opening,
        inflow: tv?.inflow ?? 0,
        outflow: tv?.outflow ?? 0,
        closing,
        cnt: tv?.cnt ?? 0,
      },
    };
  });

  const sum = (key: string) =>
    round2(rows.reduce((s, row) => s + Number(row.cells[key] ?? 0), 0));

  const start = cashStartDate(accounts);
  const notes: string[] = [];
  if (start && period.from < start) {
    notes.push(fmt(r.emptyCashHint, { date: start.split('-').reverse().join('.') }));
  }

  return {
    title: r.turnoverHeading,
    periodLabel: label,
    ...header,
    columns: [
      { key: 'account', label: r.colAccount, type: 'text', width: 30 },
      { key: 'opening', label: r.colOpeningBalance, type: 'money' },
      { key: 'inflow', label: r.colInflow, type: 'money' },
      { key: 'outflow', label: r.colOutflow, type: 'money' },
      { key: 'closing', label: r.colClosingBalance, type: 'money' },
      { key: 'cnt', label: r.colOperations, type: 'number', width: 11 },
    ],
    rows,
    totals:
      rows.length > 0
        ? {
            account: r.totalRow,
            opening: sum('opening'),
            inflow: sum('inflow'),
            outflow: sum('outflow'),
            closing: sum('closing'),
            cnt: sum('cnt'),
          }
        : null,
    notes,
    fileBase: fileBase('turnover', period),
  };
}

// ── 2. Движение денег по месяцам ──────────────────────────────────────────
export async function buildFlowDoc(period: Period): Promise<ReportDoc> {
  const { t } = await getT();
  const r = t.cash.reports;
  const names = monthNamesFrom(t.payroll);
  const [flow, header, label] = await Promise.all([
    getFlowData(period),
    commonHeader(),
    labelOf(period),
  ]);

  const byMonth = new Map(flow.map((f) => [f.month, f]));
  // Дорисовываем месяцы без операций: провал в феврале должен читаться как
  // ноль, а не как отсутствие февраля.
  const rows: ReportRow[] = monthsInPeriod(period.from, period.to).map((m) => {
    const f = byMonth.get(m);
    const inflow = f?.inflow ?? 0;
    const outflow = f?.outflow ?? 0;
    return {
      cells: {
        month: monthLabel(m, names),
        inflow,
        outflow,
        net: round2(inflow - outflow),
        cnt: f?.cnt ?? 0,
      },
    };
  });

  const sum = (key: string) =>
    round2(rows.reduce((s, row) => s + Number(row.cells[key] ?? 0), 0));

  return {
    title: r.flowHeading,
    periodLabel: label,
    ...header,
    columns: [
      { key: 'month', label: r.colMonth, type: 'text', width: 20 },
      { key: 'inflow', label: r.colInflow, type: 'money' },
      { key: 'outflow', label: r.colOutflow, type: 'money' },
      { key: 'net', label: r.colNet, type: 'money' },
      { key: 'cnt', label: r.colOperations, type: 'number', width: 11 },
    ],
    // Строка на каждый месяц периода есть всегда; итог показываем, только
    // если по кассе вообще было движение.
    rows: flow.length > 0 ? rows : [],
    totals:
      flow.length > 0
        ? {
            month: r.totalRow,
            inflow: sum('inflow'),
            outflow: sum('outflow'),
            net: sum('net'),
            cnt: sum('cnt'),
          }
        : null,
    fileBase: fileBase('flow', period),
  };
}

// ── 3. Доходы: откуда пришли деньги ───────────────────────────────────────
export async function buildIncomeDoc(
  period: Period,
  dim: CashIncomeDim,
): Promise<ReportDoc> {
  const { t, fmt } = await getT();
  const r = t.cash.reports;
  const [income, header, label, turnoverData] = await Promise.all([
    getIncomeData(period, dim),
    commonHeader(),
    labelOf(period),
    getTurnoverData(period),
  ]);

  const total = round2(income.reduce((s, row) => s + row.total, 0));

  // Служебные корзины из SQL приходят без подписи — она локализуется здесь.
  const bucketLabel = (key: string, label: string | null): string => {
    if (label) return label;
    if (key === 'unset') return r.bucketUnset;
    if (key === 'no_account') return r.bucketNoAccount;
    return r.bucketUnknown;
  };

  const rows: ReportRow[] = income.map((row) => ({
    cells: {
      name: bucketLabel(row.bucket_key, row.bucket_label),
      amount: row.total,
      // Доля хранится как 0..1 — Excel сам покажет её процентом.
      share: total > 0 ? row.total / total : 0,
      cnt: row.cnt,
    },
    href:
      row.ref_id && dim === 'case'
        ? `/cases/${row.ref_id}`
        : row.ref_id && dim === 'client'
          ? `/clients/${row.ref_id}`
          : undefined,
  }));

  // Ключевая сноска: почему сумма тут не равна обороту кассы.
  const start = cashStartDate(turnoverData.accounts);
  const note = start
    ? fmt(r.incomeSourceNote, { date: start.split('-').reverse().join('.') })
    : r.incomeSourceNoteNoCash;

  return {
    title: `${r.incomeHeading} · ${dimLabel(r, dim)}`,
    periodLabel: label,
    ...header,
    columns: [
      { key: 'name', label: r.colName, type: 'text', width: 40 },
      { key: 'amount', label: r.colAmount, type: 'money' },
      { key: 'share', label: r.colShare, type: 'percent', width: 10 },
      { key: 'cnt', label: r.colCount, type: 'number', width: 10 },
    ],
    rows,
    totals:
      rows.length > 0
        ? { name: r.totalRow, amount: total, share: total > 0 ? 1 : 0, cnt:
            rows.reduce((s, row) => s + Number(row.cells.cnt ?? 0), 0) }
        : null,
    notes: [note],
    fileBase: fileBase('income', period, dim),
  };
}

/** Подпись разреза доходов. */
export function dimLabel(
  r: {
    dimCase: string;
    dimClient: string;
    dimLawyer: string;
    dimExpert: string;
    dimMethod: string;
    dimAccount: string;
  },
  dim: CashIncomeDim,
): string {
  switch (dim) {
    case 'case':
      return r.dimCase;
    case 'client':
      return r.dimClient;
    case 'lawyer':
      return r.dimLawyer;
    case 'expert':
      return r.dimExpert;
    case 'method':
      return r.dimMethod;
    case 'account':
      return r.dimAccount;
  }
}

// ── 4. Расходы: куда ушли деньги (по статьям) ─────────────────────────────
export async function buildExpensesDoc(period: Period): Promise<ReportDoc> {
  const { t } = await getT();
  const r = t.cash.reports;
  const [spend, header, label] = await Promise.all([
    getExpensesByCategory(period.from, period.to),
    commonHeader(),
    labelOf(period),
  ]);

  const totals = sumCategorySpend(spend);
  const rows: ReportRow[] = spend.map((s) => ({
    cells: {
      category: s.label,
      amount: s.total,
      share: totals.total > 0 ? s.total / totals.total : 0,
      fromCases: s.case_total,
      fromCompany: s.company_total,
      cnt: s.cnt,
    },
  }));

  return {
    title: r.expensesHeading,
    periodLabel: label,
    ...header,
    columns: [
      { key: 'category', label: r.colCategory, type: 'text', width: 34 },
      { key: 'amount', label: r.colAmount, type: 'money' },
      { key: 'share', label: r.colShare, type: 'percent', width: 10 },
      { key: 'fromCases', label: r.colFromCases, type: 'money' },
      { key: 'fromCompany', label: r.colFromCompany, type: 'money' },
      { key: 'cnt', label: r.colOperations, type: 'number', width: 11 },
    ],
    rows,
    totals:
      rows.length > 0
        ? {
            category: r.totalRow,
            amount: totals.total,
            share: totals.total > 0 ? 1 : 0,
            fromCases: totals.caseTotal,
            fromCompany: totals.companyTotal,
            cnt: rows.reduce((s, row) => s + Number(row.cells.cnt ?? 0), 0),
          }
        : null,
    fileBase: fileBase('expenses', period),
  };
}

// ── 5. Прибыльность дел ───────────────────────────────────────────────────
export async function buildProfitDoc(period: Period): Promise<ReportDoc> {
  const { t } = await getT();
  const r = t.cash.reports;
  const [profit, header, label] = await Promise.all([
    getProfitByCase(period.from, period.to),
    commonHeader(),
    labelOf(period),
  ]);

  const totals = sumProfit(profit);
  const rows: ReportRow[] = profit.map((p) => ({
    cells: {
      case: p.number_title,
      client: p.client_name ?? '',
      income: p.income,
      expense: p.expense,
      margin: p.margin,
    },
    href: `/cases/${p.case_id}`,
  }));

  return {
    title: r.profitHeading,
    periodLabel: label,
    ...header,
    columns: [
      { key: 'case', label: r.colCase, type: 'text', width: 24 },
      { key: 'client', label: r.colClient, type: 'text', width: 30 },
      { key: 'income', label: r.colIncome, type: 'money' },
      { key: 'expense', label: r.colExpense, type: 'money' },
      { key: 'margin', label: r.colMargin, type: 'money' },
    ],
    rows,
    totals:
      rows.length > 0
        ? {
            case: r.totalRow,
            client: '',
            income: totals.income,
            expense: totals.expense,
            margin: totals.margin,
          }
        : null,
    notes: [r.profitNote],
    fileBase: fileBase('profit', period),
  };
}

// ── 6. Финансовый итог периода ────────────────────────────────────────────
// Одна страница «как отработали»: доход − расходы = результат, с детализацией
// расходов по статьям. Доход берётся из оплат по делам (см. решение о двух
// источниках в шапке миграции 0017), расход — из expenses.
export async function buildSummaryDoc(period: Period): Promise<ReportDoc> {
  const { t, fmt } = await getT();
  const r = t.cash.reports;
  const [income, spend, header, label, turnoverData] = await Promise.all([
    getIncomeData(period, 'case'),
    getExpensesByCategory(period.from, period.to),
    commonHeader(),
    labelOf(period),
    getTurnoverData(period),
  ]);

  const incomeTotal = round2(income.reduce((s, row) => s + row.total, 0));
  const spendTotals = sumCategorySpend(spend);
  const result = round2(incomeTotal - spendTotals.total);

  const rows: ReportRow[] = [
    { cells: { metric: r.rowIncome, amount: incomeTotal }, emphasis: true },
    { cells: { metric: r.rowExpenses, amount: spendTotals.total }, emphasis: true },
    // Детализация расходов — отступ подсказывает вложенность и в Excel тоже.
    ...spend.map((s) => ({
      cells: { metric: `    ${s.label}`, amount: s.total },
    })),
    { cells: { metric: r.rowResult, amount: result }, emphasis: true },
  ];

  const start = cashStartDate(turnoverData.accounts);
  const note = start
    ? fmt(r.incomeSourceNote, { date: start.split('-').reverse().join('.') })
    : r.incomeSourceNoteNoCash;

  return {
    title: r.summaryHeading,
    periodLabel: label,
    ...header,
    columns: [
      { key: 'metric', label: r.colMetric, type: 'text', width: 44 },
      { key: 'amount', label: r.colAmount, type: 'money' },
    ],
    // Пустой период — пустой отчёт (а не строки с нулями): «нет данных»
    // читается честнее, чем «доход 0, расход 0, результат 0».
    rows: incomeTotal === 0 && spendTotals.total === 0 ? [] : rows,
    totals: null,
    notes: [note],
    fileBase: fileBase('summary', period),
  };
}

// ── 7. Реестр операций кассы ──────────────────────────────────────────────
// Плоский журнал за период — первичка для сверки с банком.
export async function buildRegistryDoc(period: Period): Promise<ReportDoc> {
  const { t } = await getT();
  const r = t.cash.reports;
  const [{ accounts, entries, truncated }, header, label] = await Promise.all([
    getCashReportData(period),
    commonHeader(),
    labelOf(period),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const rows: ReportRow[] = entries.map((e) => ({
    cells: {
      date: e.entry_date.split('-').reverse().join('.'),
      account: accountName.get(e.account_id) ?? '',
      description: e.description,
      case: e.case?.number_title ?? '',
      inflow: e.direction === 'in' ? e.amount : null,
      outflow: e.direction === 'out' ? e.amount : null,
    },
    href: e.case_id ? `/cases/${e.case_id}` : undefined,
  }));

  const sum = (key: string) =>
    round2(rows.reduce((s, row) => s + Number(row.cells[key] ?? 0), 0));

  const notes: string[] = [];
  // Молчаливое усечение в отчёте недопустимо: если строк больше потолка,
  // это должно быть написано прямо на документе, включая выгрузку.
  if (truncated) notes.push(t.cash.report.truncatedWarning);

  return {
    title: r.registryHeading,
    periodLabel: label,
    ...header,
    columns: [
      { key: 'date', label: r.colDate, type: 'date', width: 12 },
      { key: 'account', label: r.colAccount, type: 'text', width: 18 },
      { key: 'description', label: r.colDescription, type: 'text', width: 40 },
      { key: 'case', label: r.colCase, type: 'text', width: 18 },
      { key: 'inflow', label: r.colInflow, type: 'money' },
      { key: 'outflow', label: r.colOutflow, type: 'money' },
    ],
    rows,
    totals:
      rows.length > 0
        ? {
            date: '',
            account: '',
            description: r.totalRow,
            case: '',
            inflow: sum('inflow'),
            outflow: sum('outflow'),
          }
        : null,
    notes,
    fileBase: fileBase('registry', period),
  };
}

/** Документ по виду отчёта — единая точка входа для страницы и для выгрузки. */
export async function buildCashReportDoc(
  kind: CashReportKind,
  period: Period,
  dim: CashIncomeDim = 'case',
): Promise<ReportDoc> {
  switch (kind) {
    case 'turnover':
      return buildTurnoverDoc(period);
    case 'flow':
      return buildFlowDoc(period);
    case 'income':
      return buildIncomeDoc(period, dim);
    case 'expenses':
      return buildExpensesDoc(period);
    case 'profit':
      return buildProfitDoc(period);
    case 'summary':
      return buildSummaryDoc(period);
    case 'registry':
      return buildRegistryDoc(period);
  }
}
