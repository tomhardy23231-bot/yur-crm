import { requireUser } from '@/lib/auth/require-role';

// Минимальный layout для печатных отчётов — без сайдбара/топбара. Полноценная
// белая страница-документ (не «карточка на сером»). Авторизация обязательна.
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <div className="print-root min-h-dvh bg-white">{children}</div>;
}
