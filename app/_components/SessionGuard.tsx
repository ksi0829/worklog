"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const TAB_SESSION_KEY = "worklog_tab_session_started";

export default function SessionGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const started = sessionStorage.getItem(TAB_SESSION_KEY);

    // 새 탭/새 브라우저 세션 진입 = 항상 로그아웃 상태로 시작
    if (!started) {
      sessionStorage.setItem(TAB_SESSION_KEY, "1");
      void supabase.auth.signOut();

      if (pathname !== "/login") {
        router.replace("/login");
      }
    }
  }, [pathname, router]);

  return null;
}