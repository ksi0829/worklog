import type { Metadata } from "next";

import { AppFrame } from "@/app/_components/AppFrame";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ZETA 업무통합시스템",

    template:
      "ZETA 업무통합시스템 | %s",
  },

  description:
    "ZETA 업무 통합 관리 시스템",

  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
