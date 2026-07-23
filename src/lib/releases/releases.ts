// ============================================================================
// Реестр обновлений CRM («Что нового»).
// ----------------------------------------------------------------------------
// Каждое заметное изменение фиксируем здесь как релиз. Крупное обновление →
// поднимаем версию (например, 0.1 → 1.0) и помечаем `major: true` — тогда в
// модалке «Что нового» предлагается пройти тур.
//
// Модалка показывается ОДИН раз на устройство (браузер) для текущей версии:
// факт показа хранится в localStorage по ключу `yk_release_seen_<version>`.
// Один и тот же аккаунт с другого компьютера/браузера → увидит снова (это и
// нужно: «показываем каждый раз с нового места, но не повторяем на том же»).
//
// Тексты релизов переведены в i18n-неймспейсе `help.releases`. Здесь хранятся
// только КЛЮЧИ перевода (`titleKey`, `leadKey`, `headingKey`, `itemKeys`),
// которые модалка резолвит через активный словарь. Нетекстовые поля (версия,
// дата, tourId, major) остаются как есть.
//
// Как добавить новый релиз:
//   1) подними APP_VERSION;
//   2) добавь ключи текста в src/lib/i18n/messages/ru|uk/help.ts (releases.*);
//   3) добавь объект в начало RELEASES (свежие — сверху) со ссылками на ключи;
//   4) для крупного — `major: true` (предложит тур).
// ============================================================================

import type { HelpMessages } from '@/lib/i18n/messages/ru/help';

// Ключ строки в словаре релизов (help.releases.*).
export type ReleaseTextKey = keyof HelpMessages['releases'];

export type ReleaseSection = {
  /** Ключ заголовка секции (help.releases.*). */
  headingKey: ReleaseTextKey;
  /** Ключи пунктов секции (help.releases.*). */
  itemKeys: ReadonlyArray<ReleaseTextKey>;
  /**
   * Секцию видит ТОЛЬКО владелец (owner). Для фич, которые сотрудникам не
   * анонсируются (например, журнал активности, 2.8) — модалка фильтрует.
   */
  ownerOnly?: boolean;
};

export type Release = {
  /** Версия — она же ключ «показано» в localStorage. */
  version: string;
  /** Ключ короткого заголовка обновления (help.releases.*). */
  titleKey: ReleaseTextKey;
  /** Дата релиза YYYY-MM-DD (для подписи). */
  date: string;
  /** Необязательный ключ плашки-статуса (например, «ещё в разработке»). */
  badgeKey?: ReleaseTextKey;
  /** Ключ вводного абзаца (help.releases.*). */
  leadKey: ReleaseTextKey;
  /**
   * Заголовок/вводка ДЛЯ ВЛАДЕЛЬЦА, если общие тексты сознательно умалчивают
   * owner-only фичу (см. ReleaseSection.ownerOnly). Не заданы → общие.
   */
  ownerTitleKey?: ReleaseTextKey;
  ownerLeadKey?: ReleaseTextKey;
  /** Блоки: что добавлено / изменено / как работает. */
  sections: ReadonlyArray<ReleaseSection>;
  /** Крупное обновление (акцент). */
  major?: boolean;
  /**
   * Идентификатор тура ПО ЭТОЙ фиче (а не общий онбординг). Если задан — в
   * модалке появляется «Пройти тур», который ведёт по новому разделу.
   * Сейчас поддерживается 'payroll'. Для будущих крупных фич — добавить новый id
   * и его сценарий в lib/onboarding/tour-steps.ts.
   */
  tourId?: 'payroll';
};

// Текущая версия системы. Поднимается с каждым заметным обновлением.
export const APP_VERSION = '2.9';

// Свежие релизы — сверху. RELEASES[0] = текущий (по нему строится модалка).
export const RELEASES: ReadonlyArray<Release> = [
  {
    // Совмещение ролей (0007): одинарное начисление ЗП при юрист = эксперт.
    version: '2.9',
    titleKey: 'v2_9Title',
    date: '2026-07-23',
    leadKey: 'v2_9Lead',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: ['v2_9Added1', 'v2_9Added2', 'v2_9Added3'],
      },
      {
        headingKey: 'headingChanged',
        itemKeys: ['v2_9Changed1'],
      },
    ],
  },
  {
    version: '2.8',
    // Сотрудникам — только улучшения списка (журнал не анонсируем, решение
    // владельца 2026-07-22); владельцу — полные тексты (ownerTitle/ownerLead).
    titleKey: 'v2_8TitleStaff',
    date: '2026-07-22',
    major: true,
    leadKey: 'v2_8LeadStaff',
    ownerTitleKey: 'v2_8Title',
    ownerLeadKey: 'v2_8Lead',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: ['v2_8Added1', 'v2_8Added2', 'v2_8Added3', 'v2_8Added4'],
        ownerOnly: true,
      },
      {
        headingKey: 'headingHowItWorks',
        itemKeys: ['v2_8How1'],
        ownerOnly: true,
      },
      {
        // Кастомный заголовок секции: улучшения списка дел этой же сессии.
        headingKey: 'v2_8HeadingCases',
        itemKeys: ['v2_8Cases1', 'v2_8Cases2', 'v2_8Cases3', 'v2_8Cases4', 'v2_8Cases5'],
      },
      {
        headingKey: 'headingChanged',
        itemKeys: ['v2_8Changed1'],
      },
    ],
  },
  {
    version: '2.7',
    titleKey: 'v2_7Title',
    date: '2026-06-07',
    leadKey: 'v2_7Lead',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: ['v2_7Added1', 'v2_7Added2', 'v2_7Added3', 'v2_7Added4'],
      },
    ],
  },
  {
    version: '2.6',
    titleKey: 'v2_6Title',
    date: '2026-06-07',
    leadKey: 'v2_6Lead',
    sections: [
      {
        headingKey: 'headingChanged',
        itemKeys: ['v2_6Changed1', 'v2_6Changed2', 'v2_6Changed3'],
      },
    ],
  },
  {
    version: '2.5',
    titleKey: 'v2_5Title',
    date: '2026-06-07',
    leadKey: 'v2_5Lead',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: [
          'v2_5Added1',
          'v2_5Added2',
          'v2_5Added3',
          'v2_5Added4',
          'v2_5Added5',
        ],
      },
    ],
  },
  {
    version: '2.4',
    titleKey: 'v2_4Title',
    date: '2026-06-07',
    leadKey: 'v2_4Lead',
    sections: [
      {
        headingKey: 'headingChanged',
        itemKeys: [
          'v2_4Changed1',
          'v2_4Changed2',
          'v2_4Changed3',
          'v2_4Changed4',
          'v2_4Changed5',
          'v2_4Changed6',
        ],
      },
    ],
  },
  {
    version: '2.3',
    titleKey: 'v2_3Title',
    date: '2026-06-06',
    leadKey: 'v2_3Lead',
    sections: [
      {
        headingKey: 'headingChanged',
        itemKeys: [
          'v2_3Changed1',
          'v2_3Changed2',
          'v2_3Changed3',
          'v2_3Changed4',
        ],
      },
    ],
  },
  {
    version: '2.2',
    titleKey: 'v2_2Title',
    date: '2026-06-06',
    leadKey: 'v2_2Lead',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: ['v2_2Added1', 'v2_2Added2', 'v2_2Added3'],
      },
      {
        headingKey: 'headingHowItWorks',
        itemKeys: ['v2_2How1', 'v2_2How2'],
      },
    ],
  },
  {
    version: '2.1',
    titleKey: 'v2_1Title',
    date: '2026-06-04',
    leadKey: 'v2_1Lead',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: ['v2_1Added1', 'v2_1Added2', 'v2_1Added3'],
      },
      {
        headingKey: 'headingHowItWorks',
        itemKeys: ['v2_1How1', 'v2_1How2'],
      },
    ],
  },
  {
    version: '2.0',
    titleKey: 'v2_0Title',
    date: '2026-06-03',
    major: true,
    leadKey: 'v2_0Lead',
    sections: [
      {
        headingKey: 'headingChanged',
        itemKeys: [
          'v2_0Changed1',
          'v2_0Changed2',
          'v2_0Changed3',
          'v2_0Changed4',
          'v2_0Changed5',
          'v2_0Changed6',
        ],
      },
      {
        headingKey: 'headingKept',
        itemKeys: ['v2_0Kept1', 'v2_0Kept2'],
      },
    ],
  },
  {
    version: '1.2',
    titleKey: 'v1_2Title',
    date: '2026-06-02',
    leadKey: 'v1_2Lead',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: ['v1_2Added1', 'v1_2Added2', 'v1_2Added3', 'v1_2Added4'],
      },
      {
        headingKey: 'headingHowItWorks',
        itemKeys: ['v1_2How1', 'v1_2How2', 'v1_2How3'],
      },
    ],
  },
  {
    version: '1.1',
    titleKey: 'v1_1Title',
    date: '2026-06-01',
    leadKey: 'v1_1Lead',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: ['v1_1Added1', 'v1_1Added2', 'v1_1Added3'],
      },
      {
        headingKey: 'headingHowItWorks',
        itemKeys: ['v1_1How1', 'v1_1How2', 'v1_1How3'],
      },
    ],
  },
  {
    version: '1.0',
    titleKey: 'v1_0Title',
    date: '2026-06-01',
    badgeKey: 'badgeInDev',
    leadKey: 'v1_0Lead',
    major: true,
    tourId: 'payroll',
    sections: [
      {
        headingKey: 'headingAdded',
        itemKeys: [
          'v1_0Added1',
          'v1_0Added2',
          'v1_0Added3',
          'v1_0Added4',
          'v1_0Added5',
        ],
      },
      {
        headingKey: 'headingHowItWorks',
        itemKeys: ['v1_0How1', 'v1_0How2', 'v1_0How3'],
      },
    ],
  },
];

export const CURRENT_RELEASE: Release = RELEASES[0]!;
