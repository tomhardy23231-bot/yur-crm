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
import { ReleaseModal } from '@/components/releases/release-modal';
import { CURRENT_RELEASE } from '@/lib/releases/releases';
import { useI18n } from '@/lib/i18n/provider';
import {
  buildTourSteps,
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

type Ctx = {
  /** Открыть приветственную модалку (например, из «Справки»). */
  openWelcome: () => void;
  /** Сразу запустить общий пошаговый тур, минуя модалку. */
  startTour: () => void;
  /** Запустить тур по фиче текущего обновления (если у релиза есть tourId). */
  startReleaseTour: () => void;
  /** Открыть модалку «Что нового» (текущее обновление) вручную. */
  openWhatsNew: () => void;
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

export function OnboardingProvider({
  ctx,
  children,
}: {
  ctx: TourCtx;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, fmt } = useI18n();

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

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

  // Тур по фиче текущего релиза. Сейчас единственный сценарий — 'payroll'.
  const startReleaseTour = useCallback(() => {
    const steps =
      CURRENT_RELEASE.tourId === 'payroll'
        ? buildPayrollTourSteps(ctxRef.current, tourRef.current)
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

  // Авто-показ при первом визите в этом браузере:
  //   • новичок (онбординг не показан) → приветствие + тур;
  //   • остальные, не видевшие текущее обновление → модалка «Что нового».
  // Приветствие имеет приоритет; пройдя его, пользователь не получит ещё и
  // модалку обновления (startTour/skipWelcome помечают релиз показанным).
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
  }, []);

  const value = useMemo<Ctx>(
    () => ({ openWelcome, startTour, startReleaseTour, openWhatsNew }),
    [openWelcome, startTour, startReleaseTour, openWhatsNew],
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
    </OnboardingContext.Provider>
  );
}
