import type { ActivityMessages } from '../ru/activity';

// Журнал змін у справі (історія подій): блок-картка, форматування дій,
// diff'ів полів і відносного часу.
export const activity: ActivityMessages = {
  block: {
    title: 'Історія',
    count: {
      one: '{n} подія',
      few: '{n} події',
      many: '{n} подій',
    },
    empty: 'Змін у справі поки не було.',
    showingLast: 'Показано {limit} останніх подій',
  },

  actorSystem: 'Система',

  field: {
    number_title: 'номер/назву',
    client_id: 'клієнта',
    lawyer_id: 'юриста (договір)',
    responsible_id: 'Експерта',
    opened_at: 'дату відкриття',
    case_type: 'тип справи',
    category: 'категорію',
    subject: 'предмет договору',
    stage: 'етап',
    priority: 'пріоритет',
    contract_sum: 'суму договору',
    billing_types: 'тип оплати',
    opponent: 'опонента',
    court_case_number: 'номер судової справи',
    court: 'суд',
    tags: 'теги',
    source: 'джерело',
    title: 'назву',
    kind: 'тип',
    assignee_id: 'виконавця',
    due_at: 'строк',
    description: 'опис',
  },

  action: {
    case_created: 'створив(ла) справу',
    case_updated: 'оновив(ла) справу',
    case_deleted: 'видалив(ла) справу',
    stage_corrected: 'скоригував(ла) етап',
    client_created: 'створив(ла) клієнта',
    client_updated: 'оновив(ла) клієнта',
    client_deleted: 'видалив(ла) клієнта',
    document_uploaded: 'завантажив(ла) документ',
    document_deleted: 'видалив(ла) документ',
    payment_created: 'додав(ла) платіж',
    payment_deleted: 'видалив(ла) платіж',
    task_created: 'створив(ла) завдання',
    task_updated: 'оновив(ла) завдання',
    task_toggled: 'перемкнув(ла) статус завдання',
    task_deleted: 'видалив(ла) завдання',
    comment_edited: 'відредагував(ла) коментар',
    payroll_paid: 'відмітив(ла) виплату зарплати',
    payroll_reverted: 'відкотив(ла) виплату зарплати',
    user_created: 'створив(ла) користувача',
    user_role_changed: 'змінив(ла) роль користувача',
    user_deactivated: 'деактивував(ла) користувача',
    user_reactivated: 'реактивував(ла) користувача',
  },

  event: {
    caseCreated: 'створив(ла) справу',
    caseChanged: 'змінив(ла) {detail}',
    caseUpdated: 'оновив(ла) справу',
    caseDeleted: 'видалив(ла) справу',
    stageReverted: 'відкотив(ла) етап: {from} → {to}',

    documentUploadedTyped: 'завантажив(ла) документ «{name}» ({type})',
    documentUploaded: 'завантажив(ла) документ «{name}»',
    documentDeleted: 'видалив(ла) документ «{name}»',

    paymentAdded: 'додав(ла) {parts}',
    paymentChunk: 'платіж {amount}',
    paymentFrom: 'від {date}',
    paymentDeleted: 'видалив(ла) платіж {amount}',

    taskAccTask: 'завдання',
    taskAccHearing: 'засідання',
    taskAccDeadline: 'дедлайн',
    taskCreated: 'створив(ла) {kind} «{title}»',
    taskChanged: 'змінив(ла) завдання{suffix}: {detail}',
    taskUpdated: 'оновив(ла) завдання{suffix}',
    taskTitleSuffix: ' «{title}»',
    taskDone: 'завершив(ла) завдання{suffix}',
    taskReopened: 'відкрив(ла) завдання{suffix} знову',
    taskToggled: 'перемкнув(ла) статус завдання{suffix}',
    taskDeleted: 'видалив(ла) завдання «{title}»',

    commentEdited: 'змінив(ла) коментар: «{from}» → «{to}»',

    payrollPaid: 'відмітив(ла) виплату зарплати',
    payrollReverted: 'відкотив(ла) виплату зарплати',
    payrollDetail: '{verb}: {tail}',

    unknownAction: 'дія: {action}',
  },

  time: {
    justNow: 'щойно',
    minAgo: '{n} хв тому',
    hAgo: '{n} год тому',
    yesterday: 'вчора',
    daysAgo: '{n} дн тому',
  },
};
