import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Golos_Text, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Дизайн-направление «ЮрКейс» (см. DESIGN.md): Golos Text для заголовков и
// интерфейса, JetBrains Mono для цифр/сумм. Кириллица обязательна.
const golosText = Golos_Text({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800", "900"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Тема из cookie (читается на сервере → без мигания). По умолчанию — teal.
  // teal → data-theme="teal"; brass → атрибут отсутствует (база :root = латунь).
  const theme = (await cookies()).get("theme")?.value === "brass" ? "brass" : "teal";

  return (
    <html
      lang="ru"
      data-theme={theme === "teal" ? "teal" : undefined}
      className={`${golosText.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
