import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider, NO_FLASH_SCRIPT } from "@/components/theme-provider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "MyHub — Personal Dashboard",
  description:
    "10명의 AI Agent 팀이 사업 운영과 개인 정보를 능동적으로 보좌하는 1인용 정보 허브",
  applicationName: "MyHub",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Hydration 전에 .dark 클래스 결정 (깜빡임 방지). 라이트가 기본값. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          {/* aria-live="polite" 자동 — focus 안 뺏음. theme="system" 으로 light/dark 자동 */}
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            theme="system"
            toastOptions={{
              classNames: {
                toast: "font-sans",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
