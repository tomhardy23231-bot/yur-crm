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
import { driver, type Driver } from 'driver.js';
// Базовый CSS driver.js подключён в globals.css (через @import), чтобы наши
// перекрытия темы шли после него по порядку каскада.

import { WelcomeModal } from './welcome-modal';
import {
  buildTourSteps,
  FIRST_CASE_ROUTE,
  type TourCtx,
  type TourStep,
} from '@/lib/onboarding/tour-steps';

// localStorage-ключ: «онбординг показан в этом браузере». Версия в имени —
// чтобы при будущем редизайне тура можно было показать его заново всем.
const SEEN_KEY = 'yk_onboarding_v1';

type Ctx = {
  /** Открыть приветственную модалку (например, из «Справки»). */
  openWelcome: () => void;
  /** Сразу запустить пошаговый тур, минуя модалку. */
  startTour: () => void;
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

export function OnboardingProvider({
  ctx,
  children,
}: {
  ctx: TourCtx;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // Живые зависимости в ref'ах — движок тура (создаётся один раз) читает их
  // на момент вызова, а не на момент создания. Синхронизируются эффектами,
  // чтобы не трогать ref'ы во время рендера (react-hooks/refs).
  const routerRef = useRef(router);
  const pathRef = useRef(pathname);
  const ctxRef = useRef(ctx);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  // Состояние движка.
  const driverRef = useRef<Driver | null>(null);
  const stepsRef = useRef<TourStep[]>([]);
  // Маршрут карточки дела — берётся из первой строки списка дел на шаге
  // `cases-open`. null → дел нет, шаги карточки пропускаются.
  const firstCaseHrefRef = useRef<string | null>(null);

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

    const resolveRoute = (step: TourStep): string | null =>
      step.route === FIRST_CASE_ROUTE ? firstCaseHrefRef.current : step.route;

    const buildPopover = (i: number, step: TourStep) => {
      const total = stepsRef.current.length;
      const isFirst = i === 0;
      const isLast = i === total - 1;
      return {
        title: step.title,
        description:
          `<div class="yk-tour-progress">Шаг ${i + 1} из ${total}</div>` +
          `<div class="yk-tour-body">${step.body}</div>`,
        side: step.side ?? 'bottom',
        align: step.align ?? 'start',
        showButtons: (isFirst
          ? ['next', 'close']
          : ['next', 'previous', 'close']) as Array<
          'next' | 'previous' | 'close'
        >,
        nextBtnText: isLast ? 'Завершить' : 'Далее →',
        prevBtnText: '← Назад',
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

      d.highlight({ element: step.element, popover: buildPopover(i, step) });
    };

    finishRef.current = finish;
    goToRef.current = goTo;

    return () => {
      if (driverRef.current) driverRef.current.destroy();
    };
  }, []);

  const startTour = useCallback(() => {
    setWelcomeOpen(false);
    markSeen();

    if (driverRef.current) driverRef.current.destroy();

    stepsRef.current = buildTourSteps(ctxRef.current);
    firstCaseHrefRef.current = null;

    driverRef.current = driver({
      animate: true,
      overlayColor: '#080A0F',
      overlayOpacity: 0.82,
      smoothScroll: true,
      stagePadding: 8,
      stageRadius: 14,
      allowClose: true,
      disableActiveInteraction: true,
      allowKeyboardControl: true,
      popoverClass: 'yk-tour',
      doneBtnText: 'Завершить',
    });

    // Небольшая задержка — дать модалке закрыться, затем первый шаг.
    window.setTimeout(() => {
      void goToRef.current(0, 1);
    }, 180);
  }, []);

  const openWelcome = useCallback(() => setWelcomeOpen(true), []);

  const skipWelcome = useCallback(() => {
    setWelcomeOpen(false);
    markSeen();
  }, []);

  // Авто-показ приветствия при первом визите в этом браузере.
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    const t = window.setTimeout(() => setWelcomeOpen(true), 650);
    return () => window.clearTimeout(t);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ openWelcome, startTour }),
    [openWelcome, startTour],
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
    </OnboardingContext.Provider>
  );
}
