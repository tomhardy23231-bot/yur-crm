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
    case_lost: 'закрыл(а) дело без договора',
    case_archived: 'отправил(а) дело в архив',
    case_restored: 'вернул(а) дело из архива',
    stage_corrected: 'скорректировал(а) этап',
    client_created: 'создал(а) клиента',
    client_updated: 'обновил(а) клиента',
    client_deleted: 'удалил(а) клиента',
    document_uploaded: 'загрузил(а) документ',
    document_deleted: 'удалил(а) документ',
    payment_created: 'добавил(а) платёж',
    payment_updated: 'изменил(а) платёж',
    payment_deleted: 'удалил(а) платёж',
    payment_plan_updated: 'изменил(а) график платежей',
    task_created: 'создал(а) задачу',
    task_updated: 'обновил(а) задачу',
    task_toggled: 'переключил(а) статус задачи',
    task_deleted: 'удалил(а) задачу',
    comment_edited: 'отредактировал(а) комментарий',
    act_created: 'выписал(а) акт',
    act_paid: 'подтвердил(а) оплату акта',
    act_deleted: 'удалил(а) акт',
    payroll_paid: 'отметил(а) выплату зарплаты',
    payroll_reverted: 'откатил(а) выплату зарплаты',
    payroll_payout: 'выплатил(а) зарплату',
    user_created: 'создал(а) пользователя',
    user_role_changed: 'изменил(а) роль пользователя',
    user_deactivated: 'деактивировал(а) пользователя',
    user_reactivated: 'реактивировал(а) пользователя',
    user_permissions_changed: 'изменил(а) права пользователя',
    user_department_changed: 'изменил(а) подразделение пользователя',
    user_salary_changed: 'изменил(а) зарплату пользователя',
    user_password_reset: 'сбросил(а) пароль пользователя',
    user_email_changed: 'изменил(а) логин пользователя',
    user_invited: 'отправил(а) приглашение сотруднику',
    user_deleted: 'удалил(а) пользователя',
    department_created: 'создал(а) подразделение',
    department_renamed: 'переименовал(а) подразделение',
    department_activated: 'активировал(а) подразделение',
    department_deactivated: 'деактивировал(а) подразделение',
    // Журнал 2026-07-21 (миграция 0006) — fallback-подписи новых действий.
    comment_added: 'добавил(а) комментарий',
    comment_deleted: 'удалил(а) комментарий',
    document_downloaded: 'скачал(а) документ',
    act_completion_changed: 'изменил(а) отметку выполнения акта',
    payroll_bonus: 'начислил(а) премию',
    payroll_tx_deleted: 'удалил(а) движение зарплаты',
    user_password_changed: 'сменил(а) свой пароль',
    user_login: 'вошёл (вошла) в систему',
    user_login_failed: 'неудачная попытка входа',
    absence_created: 'внёс(ла) отсутствие',
    absence_deleted: 'снял(а) отсутствие',
    cash_account_created: 'создал(а) счёт кассы',
    cash_account_updated: 'изменил(а) счёт кассы',
    cash_entry_created: 'внёс(ла) операцию кассы',
    cash_entry_updated: 'изменил(а) операцию кассы',
    cash_entry_deleted: 'удалил(а) операцию кассы',
    payroll_rates_changed: 'изменил(а) ставки зарплаты',
    org_requisites_updated: 'обновил(а) реквизиты компании',
  },

  // Богатые формулировки конкретных событий (ветки switch в formatActivity).
  event: {
    caseCreated: 'создал(а) дело',
    caseChanged: 'изменил(а) {detail}',
    caseUpdated: 'обновил(а) дело',
    caseDeleted: 'удалил(а) дело',
    caseLost: 'закрыл(а) дело без договора',
    caseLostReason: 'закрыл(а) дело без договора: {reason}',
    stageReverted: 'откатил(а) этап: {from} → {to}',

    documentUploadedTyped: 'загрузил(а) документ «{name}» ({type})',
    documentUploaded: 'загрузил(а) документ «{name}»',
    documentDeleted: 'удалил(а) документ «{name}»',

    paymentAdded: 'добавил(а) {parts}',
    paymentChunk: 'платёж {amount}',
    paymentFrom: 'от {date}',
    paymentUpdated: 'изменил(а) платёж',
    paymentUpdatedAmount: 'изменил(а) платёж {amount}',
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

    commentEdited: 'изменил(а) комментарий: «{from}» → «{to}»',

    payrollPaid: 'отметил(а) выплату зарплаты',
    payrollReverted: 'откатил(а) выплату зарплаты',
    payrollDetail: '{verb}: {tail}',
    payrollPayout: 'провёл(ла) выплату зарплаты',
    payrollPayoutDetail: 'выплата зарплаты: {tail}',

    actDeleted: 'удалил(а) акт №{number} на {amount}',

    // ── Журнал 2026-07-21: новые события ──
    commentAdded: 'добавил(а) комментарий: «{text}»',
    commentDeleted: 'удалил(а) комментарий: «{text}»',

    documentDownloadedTyped: 'скачал(а) документ «{name}» ({type})',
    documentDownloaded: 'скачал(а) документ «{name}»',

    actCompletionChanged: 'изменил(а) отметку выполнения акта №{number}: {completion}',

    payrollBonus: 'начислил(а) премию: {tail}',
    payrollBonusComment: ' — «{comment}»',
    // kind-хвост подставляется из payrollTxKind*.
    payrollTxDeleted: 'удалил(а) {kind}: {tail}',
    payrollTxKindPayout: 'выплату зарплаты',
    payrollTxKindBonus: 'премию',

    passwordChanged: 'сменил(а) свой пароль',

    login: 'вошёл (вошла) в систему',
    loginIp: ' (IP {ip})',
    loginFailedPassword: 'неудачная попытка входа: неверный пароль (попытка {n})',
    loginFailedInactive: 'попытка входа в деактивированную учётку',
    loginFailed: 'неудачная попытка входа',

    absenceCreated: 'внёс(ла) отсутствие: {tail}',
    absenceDeleted: 'снял(а) отсутствие: {tail}',
    // Хвост: «Иванов — Отпуск, 01.08–14.08».
    absencePeriod: '{who} — {kind}, {from} – {to}',

    cashAccountCreated: 'создал(а) счёт кассы «{name}»',
    cashAccountUpdated: 'изменил(а) счёт кассы «{name}»',
    cashEntryIn: 'внёс(ла) приход в кассу: {amount}{account} — «{description}»',
    cashEntryOut: 'внёс(ла) расход из кассы: {amount}{account} — «{description}»',
    cashEntryDeleted: 'удалил(а) операцию кассы: {amount}{account} — «{description}»',
    cashEntryUpdated: 'изменил(а) операцию кассы: {amount}{account} — «{description}»',
    // Подстановка счёта: « (Готівка)».
    cashAccountSuffix: ' ({name})',

    ratesChanged: 'изменил(а) ставки зарплаты: {detail}',
    // Одна категория diff'а: «Иск: юрист 10% → 12%, эксперт 10% → 12%».
    ratesCategory: '{category}: юрист {lawyerFrom}% → {lawyerTo}%, эксперт {expertFrom}% → {expertTo}%',

    requisitesUpdated: 'обновил(а) реквизиты компании ({org})',
    requisitesUpdatedPlain: 'обновил(а) реквизиты компании',

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
