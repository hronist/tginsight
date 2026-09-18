import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tginsight — анализ сообщений Telegram",
  description:
    "Поиск, фильтрация и AI-анализ экспортов Telegram в одном рабочем пространстве.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4f1ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
