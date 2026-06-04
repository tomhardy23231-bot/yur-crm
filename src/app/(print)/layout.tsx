import { requireUser } from '@/lib/auth/require-role';
import { getLocale, getMessages } from '@/lib/i18n/server';
import { LocaleProvider } from '@/lib/i18n/provider';

// Минимальный layout для печатных отчётов — без сайдбара/топбара. Полноценная
// белая страница-документ (не «карточка на сером»). Авторизация обязательна.
// LocaleProvider — чтобы клиентские компоненты отчётов (тулбар печати) работали
// с i18n так же, как в основном приложении.
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const locale = await getLocale();
  const messages = getMessages(locale);
  return (
    <LocaleProvider locale={locale} messages={messages}>
      <div className="print-root min-h-dvh bg-white">{children}</div>
    </LocaleProvider>
  );
}
