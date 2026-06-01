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

// Полный сценарий. Порядок = порядок прохождения.
const ALL_STEPS: ReadonlyArray<TourStep> = [
  {
    id: 'nav',
    route: '/',
    element: '.app-sidebar',
    title: 'Это ваша навигация',
    body:
      'Слева — все разделы системы: клиенты, дела, задачи, календарь и финансы. ' +
      'Текущий раздел подсвечивается. Меню можно свернуть кнопкой вверху, чтобы освободить место.',
    side: 'right',
    align: 'center',
  },
  {
    id: 'search',
    route: '/',
    element: '[data-tour="topbar-search"]',
    title: 'Мгновенный поиск',
    body:
      'Нажмите сюда или <kbd>Ctrl</kbd> + <kbd>K</kbd> в любой момент — поиск по делам, ' +
      'клиентам, задачам и документам. Самый быстрый способ что-то найти.',
    side: 'bottom',
    align: 'end',
    optional: true,
  },
  {
    id: 'dashboard',
    route: '/',
    element: '[data-tour="page-content"]',
    title: 'Дашборд — главный экран',
    body:
      'Здесь сводка: ключевые показатели, воронка дел по этапам и последние дела. ' +
      'Цифры считаются автоматически по мере работы — отдельно ничего вводить не нужно.',
    side: 'over',
  },
  {
    id: 'clients',
    route: '/clients',
    element: '[data-tour="clients-toolbar"]',
    title: 'Клиенты (доверители)',
    body:
      'Список всех клиентов. Сверху — поиск и фильтр по типу (физлицо / компания). ' +
      'У одного клиента может быть несколько дел.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'clients-new',
    route: '/clients',
    element: '[data-tour="clients-new"]',
    title: 'Добавить клиента',
    body:
      'Эта кнопка открывает форму нового клиента. Сейчас откроем её и посмотрим, ' +
      'что нужно заполнить.',
    side: 'left',
    align: 'start',
    optional: true,
    show: (c) => c.caps.create_clients,
  },
  {
    id: 'clients-new-form',
    route: '/clients/new',
    element: '[data-tour="client-form"]',
    title: 'Карточка нового клиента',
    body:
      'Заполните <b>имя</b>, выберите <b>тип</b> (физлицо или компания), добавьте ' +
      'телефон, e-mail и адрес. Важное поле — <b>источник</b> (откуда пришёл клиент: ' +
      'сайт, рекомендация, реклама…). Нажмите «Создать клиента» — и он появится в списке.',
    side: 'over',
    optional: true,
    show: (c) => c.caps.create_clients,
  },
  {
    id: 'cases',
    route: '/cases',
    element: '[data-tour="cases-toolbar"]',
    title: 'Дела — сердце системы',
    body:
      'Дело — это и есть договор. Вокруг него собирается всё: клиент, документы, ' +
      'задачи, команда и деньги. Сверху — поиск и фильтры по этапу, типу, категории, юристу и эксперту.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'cases-new',
    route: '/cases',
    element: '[data-tour="cases-new"]',
    title: 'Новое дело',
    body:
      'Главная кнопка работы — создание дела. Откроем форму и разберём, что в ней.',
    side: 'left',
    align: 'start',
    optional: true,
    show: (c) => c.caps.create_cases,
  },
  {
    id: 'cases-new-form',
    route: '/cases/new',
    element: '[data-tour="case-form"]',
    title: 'Карточка нового дела',
    body:
      'Здесь задаётся всё дело: <b>номер/название</b>, <b>клиент</b>, ' +
      '<b>юрист-продажник</b> (заключил договор) и <b>эксперт-исполнитель</b> (ведёт дело), ' +
      '<b>категория</b> (документ / иск / представительство — от неё считается зарплата), ' +
      '<b>сумма договора</b> и тип оплаты. Кнопка «Создать дело» соберёт вокруг него всё остальное.',
    side: 'over',
    optional: true,
    show: (c) => c.caps.create_cases,
  },
  {
    id: 'cases-board',
    route: '/cases',
    element: '[data-tour="cases-board"]',
    title: 'Доска (канбан)',
    body:
      'Та же база дел, но в виде колонок по этапам воронки. Удобно видеть, ' +
      'на какой стадии каждое дело, и перетаскивать карточки.',
    side: 'left',
    align: 'start',
    optional: true,
  },
  {
    id: 'cases-open',
    route: '/cases',
    element: '[data-tour="first-case-row"]',
    title: 'Откроем дело',
    body:
      'Клик по любой строке открывает карточку дела. Сейчас покажу, что внутри — ' +
      'нажмите «Далее».',
    side: 'bottom',
    align: 'start',
    optional: true,
  },
  {
    id: 'case-overview',
    route: FIRST_CASE_ROUTE,
    element: '#overview',
    title: 'Карточка дела',
    body:
      'Шапка дела: клиент, категория, приоритет и <b>воронка этапов</b>. ' +
      'Этап двигается только вперёд — кликните по следующему шагу, чтобы перевести дело дальше.',
    side: 'bottom',
    align: 'center',
    optional: true,
  },
  {
    id: 'case-documents',
    route: FIRST_CASE_ROUTE,
    element: '#documents',
    title: 'Документы по делу',
    body:
      'Загрузка и хранение файлов: договор, иск, доверенность, переписка и <b>акт</b> ' +
      'приёма-передачи (его прикладывают перед закрытием дела).',
    side: 'top',
    align: 'center',
    optional: true,
  },
  {
    id: 'case-tasks',
    route: FIRST_CASE_ROUTE,
    element: '#tasks',
    title: 'Задачи и сроки',
    body:
      'Задачи, заседания и дедлайны по делу. Всё это автоматически попадает в общий ' +
      'календарь и в напоминания о приближающихся сроках.',
    side: 'top',
    align: 'center',
    optional: true,
  },
  {
    id: 'case-finance',
    route: FIRST_CASE_ROUTE,
    element: '#finance',
    title: 'Платежи и финансы',
    body:
      'Платежи клиента. Система сама считает оплачено / долг и начисляет зарплату ' +
      'команде — <b>процент от оплаченной суммы</b> по категории дела.',
    side: 'top',
    align: 'center',
    optional: true,
  },
  {
    id: 'tasks',
    route: '/tasks',
    element: '[data-tour="page-content"]',
    title: 'Все задачи в одном месте',
    body:
      'Сводный список задач по всем делам, сгруппированный по дням. Можно отметить ' +
      'выполнение прямо отсюда и переключаться между «мои» и «все».',
    side: 'over',
  },
  {
    id: 'calendar',
    route: '/calendar',
    element: '[data-tour="page-content"]',
    title: 'Календарь',
    body:
      'Месячный календарь заседаний и дедлайнов. Цветные точки — типы событий. ' +
      'Клик по дню показывает его задачи.',
    side: 'over',
  },
  {
    id: 'payroll',
    route: '/reports/payroll',
    element: '[data-tour="page-content"]',
    title: 'Финансы и зарплата',
    body:
      'Зарплата = процент от оплат по делам (документ 7% · иск 10% · представительство 25%). ' +
      'Здесь — начисления, история и отметки о выплатах.',
    side: 'over',
  },
  {
    id: 'settings',
    route: '/settings',
    element: '[data-tour="settings-content"]',
    title: 'Настройки',
    body:
      'Цветовая тема, ставки зарплаты по категориям и управление пользователями и ' +
      'правами доступа. Доступно владельцу и администратору.',
    side: 'over',
    optional: true,
    show: (c) => c.caps.manage_users || c.caps.edit_payroll_rates,
  },
  {
    id: 'finish',
    route: '/help',
    element: '[data-tour="page-content"]',
    title: 'Готово! 🎉',
    body:
      'Это вся система в общих чертах. На странице <b>«Справка»</b> можно перезапустить ' +
      'этот тур в любой момент и почитать ответы на частые вопросы. Удачной работы!',
    side: 'over',
  },
];

/** Отфильтрованный под роль/права сценарий. */
export function buildTourSteps(ctx: TourCtx): TourStep[] {
  return ALL_STEPS.filter((s) => !s.show || s.show(ctx));
}

// ============================================================================
// Тур ПО ФИЧЕ «Зарплата и выплаты» (релиз 1.0). Запускается из модалки «Что
// нового», ведёт только по новому разделу (а не по всему приложению).
// ============================================================================

const PAYROLL_STEPS: ReadonlyArray<TourStep> = [
  {
    id: 'pay-nav',
    route: '/reports/payroll',
    element: '[data-tour="nav-payroll"]',
    title: 'Раздел «Финансы и ЗП»',
    body:
      'Здесь всё про зарплату команды: сколько начислено, сколько выплачено и ' +
      'сколько ещё к выплате — по каждому сотруднику.',
    side: 'right',
    align: 'center',
  },
  {
    id: 'payroll-list',
    route: '/reports/payroll',
    element: '[data-tour="payroll-list"]',
    title: 'Сотрудники и суммы',
    body:
      'По каждому сотруднику: <b>начислено</b> (процент от оплат по делам), ' +
      '<b>премии</b>, <b>выплачено</b> и <b>к выплате</b>. Клик по строке открывает ' +
      'карточку сотрудника — сейчас откроем.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'pay-summary',
    route: FIRST_EMPLOYEE_ROUTE,
    element: '[data-tour="payroll-summary"]',
    title: 'Сводка по сотруднику',
    body:
      'Крупно — <b>сколько ещё к выплате</b>, рядом разбивка: заработано за дела, ' +
      'премии и сколько уже выплачено.',
    side: 'bottom',
    align: 'center',
    optional: true,
  },
  {
    id: 'pay-cases',
    route: FIRST_EMPLOYEE_ROUTE,
    element: '[data-tour="payroll-cases"]',
    title: 'Заработок по делам',
    body:
      'По каждому делу видно: сколько заработано (процент от оплат клиента), сколько ' +
      'уже выплачено и сколько осталось. Учитываются и открытые дела в работе.',
    side: 'top',
    align: 'center',
    optional: true,
  },
  {
    id: 'pay-actions',
    route: FIRST_EMPLOYEE_ROUTE,
    element: '[data-tour="payroll-actions"]',
    title: 'Выплаты и премии',
    body:
      '<b>Выплата</b> — отмечаете галочками, за какие дела платите (и невыплаченные ' +
      'премии), сумма складывается сама; можно указать дату (например, 15-е и конец ' +
      'месяца). <b>Премия</b> — бонус сверх заработка по делам. Доступно владельцу и ' +
      'администратору.',
    side: 'bottom',
    align: 'end',
    optional: true,
    show: (c) => c.role === 'owner' || c.role === 'admin',
  },
];

/** Сценарий тура по разделу ЗП, отфильтрованный под роль/права. */
export function buildPayrollTourSteps(ctx: TourCtx): TourStep[] {
  return PAYROLL_STEPS.filter((s) => !s.show || s.show(ctx));
}
