import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";

// Редизайн «ЮрКейс» (бриф 2026-06-03): IBM Plex Sans — весь UI (строгий
// корпоративный гротеск, полная кириллица); JetBrains Mono — числа/суммы/даты
// с табличными цифрами. Заменяет Golos Text. Сериф не используем.
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Веса 400/600 — фактически используемые; 500/700 срезаны из бандла (v3 s10).
// Ревизия 2026-07-08 (макет владельца): mono вернулся во вторичные
// идентификаторы списков (номера дел, клиент-подстроки, суммы, время) —
// нужен subset cyrillic, иначе кириллица падает в фолбэк Courier New.
const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ЮрКейс — Legal CRM",
  description: "CRM-система для юридической компании",
};

// Мобильный вьюпорт: width=device-width + viewport-fit=cover, чтобы работали
// safe-area-inset (нижняя навигация под «домашним» индикатором iOS/Android).
// maximum-scale не ставим — не блокируем зум (доступность).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#C6D1DF" },
    { media: "(prefers-color-scheme: dark)", color: "#172033" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Язык интерфейса (двуязычный UI): из cookie/профиля, дефолт — украинский.
  const locale = await getLocale();

  // Единый строгий светлый вид (тема «Латунь»/«Изумруд» удалена при редизайне).
  return (
    <html
      lang={locale}
      className={`${ibmPlexSans.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
