import type { Metadata } from "next";
import "./globals.css";
import SessionGuard from "./_components/SessionGuard";

export const metadata: Metadata = {
  title: "업무일지",
  description: "업무일지 웹앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <SessionGuard />
        {children}
      </body>
    </html>
  );
}