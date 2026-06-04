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
export const APP_VERSION = '2.0';

// Свежие релизы — сверху. RELEASES[0] = текущий (по нему строится модалка).
export const RELEASES: ReadonlyArray<Release> = [
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
