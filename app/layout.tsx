import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "我们的小日子 · 一起慢慢长大",
  description: "属于两个人的温柔小屋，一起记录回忆、实现心愿、照顾电子宠物。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
