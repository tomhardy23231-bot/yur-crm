'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { usePathname, useRouter } from 'next/navigation';
import { type Driver } from 'driver.js';
// driver.js грузим ДИНАМИЧЕСКИ (import() в startTour) — библиотека не нужна на
// первом рендере, не тянем её JS в основной бандл приложения. Тип Driver —
// импорт только типа (стирается при компиляции, в бандл не попадает).
// Базовый CSS driver.js подключён в globals.css (через @import), чтобы наши
// перекрытия темы шли после него по порядку каскада.

import { WelcomeModal } from './welcome-modal';
import { SetupWizardModal } from './setup-wizard-modal';
import { ReleaseModal } from '@/components/releases/release-modal';
import { CURRENT_RELEASE } from '@/lib/releases/releases';
import { useI18n } from '@/lib/i18n/provider';
import type { AccountingSetupState } from '@/lib/onboarding/setup-state';
import {
  buildTourSteps,
  buildCashTourSteps,
  buildPayrollTourSteps,
  FIRST_CASE_ROUTE,
  FIRST_EMPLOYEE_ROUTE,
  type TourCtx,
  type TourStep,
} from '@/lib/onboarding/tour-steps';

// localStorage-ключ: «онбординг показан в этом браузере». Версия в имени —
// чтобы при будущем редизайне тура можно было показать его заново всем.
const SEEN_KEY = 'yk_onboarding_v1';

// localStorage-ключ: «модалка обновления показана в этом браузере» — по версии.
// Новая версия → новый ключ → модалка покажется снова (на каждом устройстве раз).
const RELEASE_SEEN_KEY = `yk_release_seen_${CURRENT_RELEASE.version}`;

// localStorage-ключ: когда мастер настройки учёта показывался в последний раз
// (timestamp). Мастер напоминает о незакрытых шагах при входе и раз в 4 часа —
// частоту согласовал владелец 2026-07-30.
const SETUP_SHOWN_KEY = 'yk_setup_wizard_last';
const SETUP_INTERVAL_MS = 4 * 60 * 60 * 1000;

type Ctx = {
  /** Открыть приветственную модалку (например, из «Справки»). */
  openWelcome: () => void;
  /** Сразу запустить общий пошаговый тур, минуя модалку. */
  startTour: () => void;
  /** Запустить тур по фиче текущего обновления (если у релиза есть tourId). */
  startReleaseTour: () => void;
  /** Открыть модалку «Что нового» (текущее обновление) вручную. */
  openWhatsNew: () => void;
  /** Открыть мастер настройки учёта (плашка под топбаром, «Справка»). */
  openSetupWizard: () => void;
  /**
   * Есть ли у пользователя права хоть на один шаг настройки учёта — по нему
   * «Справка» решает, показывать ли кнопку мастера. Не то же, что «есть
   * незакрытые шаги»: закрыв всё, владелец должен иметь возможность
   * перепроверить список.
   */
  hasSetupWizard: boolean;
};

const OnboardingContext = createContext<Ctx | null>(null);

export function useOnboarding(): Ctx {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}

// Ждём появления элемента после клиентской навигации. Возвращает true, если
// элемент появился и видим (есть хотя бы один client-rect), иначе false по
// таймауту — тогда optional-шаг пропускается.
function waitForElement(selector: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el && (el as HTMLElement).getClientRects().length > 0) {
        resolve(true);
        return;
      }
      if (performance.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 60);
    };
    tick();
  });
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* приватный режим / отключённое хранилище — не критично */
  }
}

function markReleaseSeen() {
  try {
    window.localStorage.setItem(RELEASE_SEEN_KEY, '1');
  } catch {
    /* приватный режим / отключённое хранилище — не критично */
  }
}

function markSetupShown() {
  try {
    window.localStorage.setItem(SETUP_SHOWN_KEY, String(Date.now()));
  } catch {
    /* приватный режим / отключённое хранилище — не критично */
  }
}

// Прошло ли 4 часа с последнего показа мастера. Хранилище недоступно →
// показываем (лучше напомнить лишний раз, чем не напомнить вовсе).
function setupIntervalPassed(): boolean {
  try {
    const raw = window.localStorage.getItem(SETUP_SHOWN_KEY);
    if (!raw) return true;
    const last = Number(raw);
    return !Number.isFinite(last) || Date.now() - last >= SETUP_INTERVAL_MS;
  } catch {
    return true;
  }
}

export function OnboardingProvider({
  ctx,
  setupState,
  children,
}: {
  ctx: TourCtx;
  /** Незакрытые шаги настройки учёта; undefined — считать нечего (нет прав). */
  setupState?: AccountingSetupState;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, fmt } = useI18n();

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  // Есть ли что показывать в мастере настройки учёта.
  const setupPending = Boolean(
    setupState && setupState.totalCount > setupState.doneCount,
  );

  // Живые зависимости в ref'ах — движок тура (создаётся один раз) читает их
  // на момент вызова, а не на момент создания. Синхронизируются эффектами,
  // чтобы не трогать ref'ы во время рендера (react-hooks/refs).
  const routerRef = useRef(router);
  const pathRef = useRef(pathname);
  const ctxRef = useRef(ctx);
  // Словарь тура и форматтер — тоже через ref'ы, чтобы движок (создаётся один
  // раз) читал актуальный язык на момент построения попапа.
  const tourRef = useRef(t.help.tour);
  const fmtRef = useRef(fmt);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);
  useEffect(() => {
    tourRef.current = t.help.tour;
    fmtRef.current = fmt;
  }, [t, fmt]);

  // Состояние движка.
  const driverRef = useRef<Driver | null>(null);
  const stepsRef = useRef<TourStep[]>([]);
  // Маршрут карточки дела — берётся из первой строки списка дел на шаге
  // `cases-open`. null → дел нет, шаги карточки пропускаются.
  const firstCaseHrefRef = useRef<string | null>(null);
  // Маршрут карточки сотрудника — из первой строки /reports/payroll на шаге
  // `payroll-list`. null → сотрудников нет, шаги карточки пропускаются.
  const firstEmployeeHrefRef = useRef<string | null>(null);

  // Стабильные функции движка — присваиваются один раз в эффекте ниже.
  const goToRef = useRef<(i: number, dir: 1 | -1) => Promise<void>>(
    async () => {},
  );
  const finishRef = useRef<() => void>(() => {});

  // Движок тура. Создаётся один раз; рекурсия и взаимные ссылки живут внутри
  // замыкания эффекта, поэтому никаких «access before declaration».
  useEffect(() => {
    const finish = () => {
      const d = driverRef.current;
      driverRef.current = null;
      if (d) d.destroy();
    };

    const resolveRoute = (step: TourStep): string | null => {
      if (step.route === FIRST_CASE_ROUTE) return firstCaseHrefRef.current;
      if (step.route === FIRST_EMPLOYEE_ROUTE) return firstEmployeeHrefRef.current;
      return step.route;
    };

    const buildPopover = (i: number, step: TourStep) => {
      const total = stepsRef.current.length;
      const isFirst = i === 0;
      const isLast = i === total - 1;
      const tour = tourRef.current;
      const progress = fmtRef.current(tour.progress, {
        current: i + 1,
        total,
      });
      return {
        title: step.title,
        description:
          `<div class="yk-tour-progress">${progress}</div>` +
          `<div class="yk-tour-body">${step.body}</div>`,
        side: step.side ?? 'bottom',
        align: step.align ?? 'start',
        showButtons: (isFirst
          ? ['next', 'close']
          : ['next', 'previous', 'close']) as Array<
          'next' | 'previous' | 'close'
        >,
        nextBtnText: isLast ? tour.finish : tour.next,
        prevBtnText: tour.prev,
        onNextClick: () => {
          void goTo(i + 1, 1);
        },
        onPrevClick: () => {
          void goTo(i - 1, -1);
        },
        onCloseClick: () => {
          finish();
        },
      };
    };

    const goTo = async (i: number, dir: 1 | -1): Promise<void> => {
      const steps = stepsRef.current;
      const d = driverRef.current;
      if (!d) return;

      if (i >= steps.length) {
        finish();
        return;
      }
      if (i < 0) return;

      const step = steps[i];
      if (!step) {
        finish();
        return;
      }

      const route = resolveRoute(step);
      // Маршрут карточки дела не разрешён (нет дел) → пропускаем шаг.
      if (route === null) {
        await goTo(i + dir, dir);
        return;
      }

      if (route !== pathRef.current) {
        routerRef.current.push(route);
        const ok = await waitForElement(step.element, 6000);
        pathRef.current = route;
        if (!ok && step.optional) {
          await goTo(i + dir, dir);
          return;
        }
      } else {
        const ok = await waitForElement(step.element, 2000);
        if (!ok && step.optional) {
          await goTo(i + dir, dir);
          return;
        }
      }

      // На шаге списка дел запоминаем ссылку первой строки — для карточки.
      if (step.id === 'cases-open') {
        const link = document.querySelector<HTMLAnchorElement>(
          '[data-tour="first-case-row"] a[href^="/cases/"]',
        );
        firstCaseHrefRef.current = link?.getAttribute('href') ?? null;
      }
      // На шаге списка ЗП запоминаем маршрут карточки первого сотрудника
      // (строка — кликабельный <tr> без <a>, поэтому ссылку кладём в data-href).
      if (step.id === 'payroll-list') {
        const rowEl = document.querySelector('[data-tour="payroll-first-row"]');
        firstEmployeeHrefRef.current = rowEl?.getAttribute('data-href') ?? null;
      }

      d.highlight({ element: step.element, popover: buildPopover(i, step) });
    };

    finishRef.current = finish;
    goToRef.current = goTo;

    return () => {
      if (driverRef.current) driverRef.current.destroy();
    };
  }, []);

  // steps — кастомный сценарий (тур по фиче). Без него — общий онбординг.
  // Защита: при использовании как onClick-хендлера сюда прилетит событие — его
  // игнорируем (берём общий тур), кастомный сценарий принимаем только массивом.
  const startTour = useCallback(async (steps?: TourStep[] | unknown) => {
    setWelcomeOpen(false);
    setReleaseOpen(false);
    setSetupOpen(false);
    markSeen();
    markReleaseSeen();

    if (driverRef.current) driverRef.current.destroy();

    stepsRef.current = Array.isArray(steps)
      ? (steps as TourStep[])
      : buildTourSteps(ctxRef.current, tourRef.current);
    firstCaseHrefRef.current = null;
    firstEmployeeHrefRef.current = null;

    // Подгружаем движок тура по требованию (не в основном бандле).
    const { driver } = await import('driver.js');
    driverRef.current = driver({
      animate: true,
      overlayColor: '#080A0F' /* = --overlay (driver.js принимает строку, не var) */,
      overlayOpacity: 0.82,
      smoothScroll: true,
      stagePadding: 8,
      stageRadius: 14,
      allowClose: true,
      disableActiveInteraction: true,
      allowKeyboardControl: true,
      popoverClass: 'yk-tour',
      doneBtnText: tourRef.current.finish,
    });

    // Небольшая задержка — дать модалке закрыться, затем первый шаг.
    window.setTimeout(() => {
      void goToRef.current(0, 1);
    }, 180);
  }, []);

  // Тур по фиче текущего релиза: 'payroll' (2.4) или 'cash' (2.11).
  const startReleaseTour = useCallback(() => {
    const id = CURRENT_RELEASE.tourId;
    const steps =
      id === 'payroll'
        ? buildPayrollTourSteps(ctxRef.current, tourRef.current)
        : id === 'cash'
          ? buildCashTourSteps(ctxRef.current, tourRef.current)
          : undefined;
    startTour(steps);
  }, [startTour]);

  const openWelcome = useCallback(() => setWelcomeOpen(true), []);
  const openWhatsNew = useCallback(() => setReleaseOpen(true), []);

  const skipWelcome = useCallback(() => {
    setWelcomeOpen(false);
    markSeen();
  }, []);

  const closeRelease = useCallback(() => {
    setReleaseOpen(false);
    markReleaseSeen();
  }, []);

  // Ручное открытие (плашка под топбаром) тоже сдвигает отсчёт 4 часов —
  // владелец только что видел список, незачем показывать его снова через минуту.
  const openSetupWizard = useCallback(() => {
    setSetupOpen(true);
    markSetupShown();
  }, []);

  const closeSetup = useCallback(() => {
    setSetupOpen(false);
    markSetupShown();
  }, []);

  // Авто-показ при первом визите в этом браузере:
  //   • новичок (онбординг не показан) → приветствие + тур;
  //   • остальные, не видевшие текущее обновление → модалка «Что нового»;
  //   • затем мастер настройки учёта, если есть незакрытые шаги и с прошлого
  //     показа прошло ≥ 4 часа.
  // Порядок = приоритет: два окна разом не всплывают.
  useEffect(() => {
    let onboardingSeen = true;
    let releaseSeen = true;
    try {
      onboardingSeen = window.localStorage.getItem(SEEN_KEY) === '1';
      releaseSeen = window.localStorage.getItem(RELEASE_SEEN_KEY) === '1';
    } catch {
      onboardingSeen = false;
      releaseSeen = false;
    }
    if (!onboardingSeen) {
      const t = window.setTimeout(() => setWelcomeOpen(true), 650);
      return () => window.clearTimeout(t);
    }
    if (!releaseSeen) {
      const t = window.setTimeout(() => setReleaseOpen(true), 650);
      return () => window.clearTimeout(t);
    }
    if (setupPending && setupIntervalPassed()) {
      const t = window.setTimeout(() => {
        setSetupOpen(true);
        markSetupShown();
      }, 900);
      return () => window.clearTimeout(t);
    }
  }, [setupPending]);

  // Напоминание раз в 4 часа, пока вкладка открыта. Тикаем раз в минуту и
  // сверяемся с меткой в localStorage, а не заводим таймер на 4 часа: так
  // отсчёт переживает и засыпание вкладки (фоновые таймеры браузер тормозит),
  // и перезагрузку страницы, и работу в нескольких вкладках сразу.
  useEffect(() => {
    if (!setupPending) return;
    const id = window.setInterval(() => {
      // Поверх приветствия или «Что нового» не лезем — они показываются
      // считаные разы, мастер подождёт следующей минуты.
      if (welcomeOpen || releaseOpen) return;
      if (!setupIntervalPassed()) return;
      setSetupOpen(true);
      markSetupShown();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [setupPending, welcomeOpen, releaseOpen]);

  const value = useMemo<Ctx>(
    () => ({
      openWelcome,
      startTour,
      startReleaseTour,
      openWhatsNew,
      openSetupWizard,
      hasSetupWizard: Boolean(setupState && setupState.totalCount > 0),
    }),
    [
      openWelcome,
      startTour,
      startReleaseTour,
      openWhatsNew,
      openSetupWizard,
      setupState,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <WelcomeModal
        open={welcomeOpen}
        userCtx={ctx}
        onStartTour={startTour}
        onSkip={skipWelcome}
      />
      <ReleaseModal
        open={releaseOpen}
        release={CURRENT_RELEASE}
        // owner-only секции релиза (журнал 2.8) сотрудникам не показываются.
        isOwner={ctx.role === 'owner'}
        onClose={closeRelease}
        // Тур по самой фиче (а не общий онбординг) — только если у релиза есть tourId.
        onStartTour={CURRENT_RELEASE.tourId ? startReleaseTour : undefined}
      />
      {/* Монтируется только на время показа — состояние «раскрытый шаг»
          пересобирается при каждом открытии. */}
      {setupState && setupOpen && (
        <SetupWizardModal state={setupState} onClose={closeSetup} />
      )}
    </OnboardingContext.Provider>
  );
}
