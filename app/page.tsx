"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import InputPageClient from "./InputPageClient";

function detectRealMobile() {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent || "";
  const mobileUA =
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|webOS/i.test(ua);

  const smallScreen = window.matchMedia("(max-width: 820px)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hasTouch =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  return mobileUA || (smallScreen && coarsePointer && hasTouch);
}

export default function Page() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => {
      const mobile = detectRealMobile();
      setIsMobile(mobile);
      setChecked(true);

      if (mobile) {
        router.replace("/view");
      }
    };

    update();

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [router]);

  if (!checked) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
            textAlign: "center",
            fontFamily:
              "Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          }}
        >
          화면 확인 중...
        </div>
      </main>
    );
  }

  if (isMobile) {
    return null;
  }

  return <InputPageClient />;
}