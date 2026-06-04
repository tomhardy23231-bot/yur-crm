// Журнал изменений по делу (история событий): блок-карточка, форматирование
// действий, diff'ов полей и относительного времени.

export const activity = {
  // Блок «История» на карточке дела (case-activity-block.tsx).
  block: {
    title: 'История',
    // Счётчик событий рядом с заголовком.
    count: {
      one: '{n} событие',
      few: '{n} события',
      many: '{n} событий',
    },
    empty: 'Изменений по делу пока не было.',
    showingLast: 'Показаны {limit} последних событий',
  },

  // ФИО автора события (если user_id=null — service_role / системное действие).
  actorSystem: 'Система',

  // Человекочитаемые названия полей для diff'а (case.stage → «этап»).
  field: {
    number_title: 'номер/название',
    client_id: 'клиента',
    lawyer_id: 'юриста (договор)',
    responsible_id: 'Експерта',
    opened_at: 'дату открытия',
    case_type: 'тип дела',
    category: 'категорию',
    subject: 'предмет договора',
    stage: 'этап',
    priority: 'приоритет',
    contract_sum: 'сумму договора',
    billing_types: 'тип оплаты',
    opponent: 'оппонента',
    court_case_number: 'номер суддела',
    court: 'суд',
    tags: 'теги',
    source: 'источник',
    title: 'название',
    kind: 'тип',
    assignee_id: 'исполнителя',
    due_at: 'срок',
    description: 'описание',
  },

  // Подписи action-кодов (fallback в default-ветке formatActivity).
  action: {
    case_created: 'создал(а) дело',
    case_updated: 'обновил(а) дело',
    case_deleted: 'удалил(а) дело',
    stage_corrected: 'скорректировал(а) этап',
    client_created: 'создал(а) клиента',
    client_updated: 'обновил(а) клиента',
    client_deleted: 'удалил(а) клиента',
    document_uploaded: 'загрузил(а) документ',
    document_deleted: 'удалил(а) документ',
    payment_created: 'добавил(а) платёж',
    payment_deleted: 'удалил(а) платёж',
    task_created: 'создал(а) задачу',
    task_updated: 'обновил(а) задачу',
    task_toggled: 'переключил(а) статус задачи',
    task_deleted: 'удалил(а) задачу',
    payroll_paid: 'отметил(а) выплату зарплаты',
    payroll_reverted: 'откатил(а) выплату зарплаты',
    user_created: 'создал(а) пользователя',
    user_role_changed: 'изменил(а) роль пользователя',
    user_deactivated: 'деактивировал(а) пользователя',
    user_reactivated: 'реактивировал(а) пользователя',
  },

  // Богатые формулировки конкретных событий (ветки switch в formatActivity).
  event: {
    caseCreated: 'создал(а) дело',
    caseChanged: 'изменил(а) {detail}',
    caseUpdated: 'обновил(а) дело',
    caseDeleted: 'удалил(а) дело',
    stageReverted: 'откатил(а) этап: {from} → {to}',

    documentUploadedTyped: 'загрузил(а) документ «{name}» ({type})',
    documentUploaded: 'загрузил(а) документ «{name}»',
    documentDeleted: 'удалил(а) документ «{name}»',

    paymentAdded: 'добавил(а) {parts}',
    paymentChunk: 'платёж {amount}',
    paymentFrom: 'от {date}',
    paymentDeleted: 'удалил(а) платёж {amount}',

    // Винительный падеж типа задачи (TASK_KIND_LABEL — именительный).
    taskAccTask: 'задачу',
    taskAccHearing: 'заседание',
    taskAccDeadline: 'дедлайн',
    taskCreated: 'создал(а) {kind} «{title}»',
    taskChanged: 'изменил(а) задачу{suffix}: {detail}',
    taskUpdated: 'обновил(а) задачу{suffix}',
    taskTitleSuffix: ' «{title}»',
    taskDone: 'завершил(а) задачу{suffix}',
    taskReopened: 'открыл(а) задачу{suffix} заново',
    taskToggled: 'переключил(а) статус задачи{suffix}',
    taskDeleted: 'удалил(а) задачу «{title}»',

    payrollPaid: 'отметил(а) выплату зарплаты',
    payrollReverted: 'откатил(а) выплату зарплаты',
    payrollDetail: '{verb}: {tail}',

    // Неизвестный/новый action-код.
    unknownAction: 'действие: {action}',
  },

  // Относительное время события (formatActivityTime).
  time: {
    justNow: 'только что',
    minAgo: '{n} мин назад',
    hAgo: '{n} ч назад',
    yesterday: 'вчера',
    daysAgo: '{n} дн назад',
  },
};

export type ActivityMessages = typeof activity;
