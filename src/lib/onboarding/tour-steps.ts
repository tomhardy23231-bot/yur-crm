// ============================================================================
// Сценарий интерактивного гайд-тура (driver.js).
// ----------------------------------------------------------------------------
// Каждый шаг знает: на каком МАРШРУТЕ должен жить (`route`), какой ЭЛЕМЕНТ
// подсветить (`element` — CSS-селектор), и текст. Контроллер в
// onboarding-provider навигирует на route, дожидается появления элемента и
// подсвечивает его.
//
// `route` = 'FIRST_CASE' — особый случай: маршрут берётся из ссылки первой
// строки списка дел (захватывается на шаге `cases-open`). Если дел нет —
// такие шаги (помеченные `optional`) пропускаются.
//
// `show(ctx)` гейтит шаг по роли/правам (например, «Новое дело» — только при
// праве create_cases). Селекторы — стабильные `data-tour`-якоря или `#id`
// секций карточки дела (#overview/#documents/#tasks/#finance уже есть в DOM).
// ============================================================================

import type { EffectiveCaps, Role } from '@/lib/types/db';
import type { HelpMessages } from '@/lib/i18n/messages/ru/help';

// Словарь шагов тура (help.tour) — передаётся в build-функции, чтобы заголовки
// и тексты шагов были на активном языке.
type TourMessages = HelpMessages['tour'];

export type TourCtx = {
  role: Role;
  isStaff: boolean;
  caps: EffectiveCaps;
};

export type TourSide = 'top' | 'right' | 'bottom' | 'left' | 'over';
export type TourAlign = 'start' | 'center' | 'end';

export type TourStep = {
  id: string;
  /** Маршрут, на котором живёт шаг. 'FIRST_CASE' — динамический (см. выше). */
  route: string;
  /** CSS-селектор подсвечиваемого элемента. */
  element: string;
  title: string;
  /** HTML (driver.js рендерит через innerHTML) — допустимы <b>, <br>, <kbd>. */
  body: string;
  side?: TourSide;
  align?: TourAlign;
  /** Пропустить шаг, если элемент не найден (или маршрут FIRST_CASE не разрешён). */
  optional?: boolean;
  /** Показывать шаг только при выполнении условия по роли/правам. */
  show?: (ctx: TourCtx) => boolean;
};

export const FIRST_CASE_ROUTE = 'FIRST_CASE';
// Динамический маршрут карточки сотрудника — берётся из первой строки списка
// /reports/payroll (захватывается на шаге `payroll-list`). Нет сотрудников →
// шаги карточки (optional) пропускаются.
export const FIRST_EMPLOYEE_ROUTE = 'FIRST_EMPLOYEE';

// Полный сценарий. Порядок = порядок прохождения. Тексты берутся из словаря
// (help.tour) — поэтому шаги собираются функцией, принимающей `t`.
function allSteps(t: TourMessages): ReadonlyArray<TourStep> {
  return [
    {
      id: 'nav',
      route: '/',
      element: '.app-sidebar',
      title: t.navTitle,
      body: t.navBody,
      side: 'right',
      align: 'center',
    },
    {
      id: 'search',
      route: '/',
      element: '[data-tour="topbar-search"]',
      title: t.searchTitle,
      body: t.searchBody,
      side: 'bottom',
      align: 'end',
      optional: true,
    },
    {
      id: 'dashboard',
      route: '/',
      element: '[data-tour="page-content"]',
      title: t.dashboardTitle,
      body: t.dashboardBody,
      side: 'over',
    },
    {
      id: 'clients',
      route: '/clients',
      element: '[data-tour="clients-toolbar"]',
      title: t.clientsTitle,
      body: t.clientsBody,
      side: 'bottom',
      align: 'start',
    },
    {
      id: 'clients-new',
      route: '/clients',
      element: '[data-tour="clients-new"]',
      title: t.clientsNewTitle,
      body: t.clientsNewBody,
      side: 'left',
      align: 'start',
      optional: true,
      show: (c) => c.caps.create_clients,
    },
    {
      id: 'clients-new-form',
      route: '/clients/new',
      element: '[data-tour="client-form"]',
      title: t.clientsNewFormTitle,
      body: t.clientsNewFormBody,
      side: 'over',
      optional: true,
      show: (c) => c.caps.create_clients,
    },
    {
      id: 'cases',
      route: '/cases',
      element: '[data-tour="cases-toolbar"]',
      title: t.casesTitle,
      body: t.casesBody,
      side: 'bottom',
      align: 'start',
    },
    {
      id: 'cases-new',
      route: '/cases',
      element: '[data-tour="cases-new"]',
      title: t.casesNewTitle,
      body: t.casesNewBody,
      side: 'left',
      align: 'start',
      optional: true,
      show: (c) => c.caps.create_cases,
    },
    {
      id: 'cases-new-form',
      route: '/cases/new',
      element: '[data-tour="case-form"]',
      title: t.casesNewFormTitle,
      body: t.casesNewFormBody,
      side: 'over',
      optional: true,
      show: (c) => c.caps.create_cases,
    },
    {
      id: 'cases-board',
      route: '/cases',
      element: '[data-tour="cases-board"]',
      title: t.casesBoardTitle,
      body: t.casesBoardBody,
      side: 'left',
      align: 'start',
      optional: true,
    },
    {
      id: 'cases-open',
      route: '/cases',
      element: '[data-tour="first-case-row"]',
      title: t.casesOpenTitle,
      body: t.casesOpenBody,
      side: 'bottom',
      align: 'start',
      optional: true,
    },
    {
      id: 'case-overview',
      route: FIRST_CASE_ROUTE,
      element: '#overview',
      title: t.caseOverviewTitle,
      body: t.caseOverviewBody,
      side: 'bottom',
      align: 'center',
      optional: true,
    },
    {
      id: 'case-documents',
      route: FIRST_CASE_ROUTE,
      element: '#documents',
      title: t.caseDocumentsTitle,
      body: t.caseDocumentsBody,
      side: 'top',
      align: 'center',
      optional: true,
    },
    {
      id: 'case-tasks',
      route: FIRST_CASE_ROUTE,
      element: '#tasks',
      title: t.caseTasksTitle,
      body: t.caseTasksBody,
      side: 'top',
      align: 'center',
      optional: true,
    },
    {
      id: 'case-finance',
      route: FIRST_CASE_ROUTE,
      element: '#finance',
      title: t.caseFinanceTitle,
      body: t.caseFinanceBody,
      side: 'top',
      align: 'center',
      optional: true,
    },
    {
      id: 'tasks',
      route: '/tasks',
      element: '[data-tour="page-content"]',
      title: t.tasksTitle,
      body: t.tasksBody,
      side: 'over',
    },
    {
      id: 'calendar',
      route: '/calendar',
      element: '[data-tour="page-content"]',
      title: t.calendarTitle,
      body: t.calendarBody,
      side: 'over',
    },
    {
      id: 'payroll',
      route: '/reports/payroll',
      element: '[data-tour="page-content"]',
      title: t.payrollTitle,
      body: t.payrollBody,
      side: 'over',
    },
    {
      id: 'settings',
      route: '/settings',
      element: '[data-tour="settings-content"]',
      title: t.settingsTitle,
      body: t.settingsBody,
      side: 'over',
      optional: true,
      show: (c) => c.caps.manage_users || c.caps.edit_payroll_rates,
    },
    {
      id: 'finish',
      route: '/help',
      element: '[data-tour="page-content"]',
      title: t.finishTitle,
      body: t.finishBody,
      side: 'over',
    },
  ];
}

/** Отфильтрованный под роль/права сценарий. */
export function buildTourSteps(ctx: TourCtx, t: TourMessages): TourStep[] {
  return allSteps(t).filter((s) => !s.show || s.show(ctx));
}

// ============================================================================
// Тур ПО ФИЧЕ «Зарплата и выплаты» (релиз 1.0). Запускается из модалки «Что
// нового», ведёт только по новому разделу (а не по всему приложению).
// ============================================================================

function payrollSteps(t: TourMessages): ReadonlyArray<TourStep> {
  return [
    {
      id: 'pay-nav',
      route: '/reports/payroll',
      element: '[data-tour="nav-payroll"]',
      title: t.payNavTitle,
      body: t.payNavBody,
      side: 'right',
      align: 'center',
    },
    {
      id: 'payroll-list',
      route: '/reports/payroll',
      element: '[data-tour="payroll-list"]',
      title: t.payrollListTitle,
      body: t.payrollListBody,
      side: 'top',
      align: 'center',
    },
    {
      id: 'pay-summary',
      route: FIRST_EMPLOYEE_ROUTE,
      element: '[data-tour="payroll-summary"]',
      title: t.paySummaryTitle,
      body: t.paySummaryBody,
      side: 'bottom',
      align: 'center',
      optional: true,
    },
    {
      id: 'pay-cases',
      route: FIRST_EMPLOYEE_ROUTE,
      element: '[data-tour="payroll-cases"]',
      title: t.payCasesTitle,
      body: t.payCasesBody,
      side: 'top',
      align: 'center',
      optional: true,
    },
    {
      id: 'pay-actions',
      route: FIRST_EMPLOYEE_ROUTE,
      element: '[data-tour="payroll-actions"]',
      title: t.payActionsTitle,
      body: t.payActionsBody,
      side: 'bottom',
      align: 'end',
      optional: true,
      show: (c) => c.role === 'owner' || c.role === 'admin',
    },
  ];
}

/** Сценарий тура по разделу ЗП, отфильтрованный под роль/права. */
export function buildPayrollTourSteps(ctx: TourCtx, t: TourMessages): TourStep[] {
  return payrollSteps(t).filter((s) => !s.show || s.show(ctx));
}
