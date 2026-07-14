import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";

// Редизайн 2026-07-13 (каркас владельца, вариант B «Stripe/Notion-modern»):
// Geist — весь UI (вариативный, кириллица есть); Geist Mono — числа, суммы,
// номера дел, время. Заменяют IBM Plex Sans / JetBrains Mono.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic"],
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
    { media: "(prefers-color-scheme: light)", color: "#ECEEF1" },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
