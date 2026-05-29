import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${golosText.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
