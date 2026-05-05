import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyHub — Personal Dashboard",
  description:
    "10명의 AI Agent 팀이 사업 운영과 개인 정보를 능동적으로 보좌하는 1인용 정보 허브",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
