import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Редизайн «ЮрКейс» (бриф 2026-06-03): IBM Plex Sans — весь UI (строгий
// корпоративный гротеск, полная кириллица); JetBrains Mono — числа/суммы/даты
// с табличными цифрами. Заменяет Golos Text. Сериф не используем.
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ЮрКейс — Legal CRM",
  description: "CRM-система для юридической компании",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Единый строгий светлый вид (тема «Латунь»/«Изумруд» удалена при редизайне).
  return (
    <html
      lang="ru"
      className={`${ibmPlexSans.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
