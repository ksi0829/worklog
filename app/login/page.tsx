"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();
const COMPANY_EMAIL_DOMAIN =
  "@zetacorporation.com";

function toLoginEmail(id: string) {
  const trimmed = id.trim();

  if (trimmed.includes("@")) {
    return trimmed;
  }

  return `${trimmed}${COMPANY_EMAIL_DOMAIN}`;
}

function toDisplayId(id: string) {
  const trimmed = id.trim();

  if (trimmed.endsWith(COMPANY_EMAIL_DOMAIN)) {
    return trimmed.slice(
      0,
      -COMPANY_EMAIL_DOMAIN.length
    );
  }

  return trimmed;
}

async function recordLoginActivity(profile: {
  id: string;
  name?: string | null;
  team?: string | null;
  role?: string | null;
}) {
  await supabase
    .from("user_activity_logs")
    .insert({
      user_id: profile.id,
      user_name: profile.name || "",
      team: profile.team || "",
      role: profile.role || "",
      event_type: "login",
      path: "/login",
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : "",
    })
    .then(() => undefined);
}

export default function LoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] =
    useState(() => {
      if (typeof window === "undefined") return "";
      const saved = localStorage.getItem("savedEmail");

      return saved ? toDisplayId(saved) : "";
    });
  const [password, setPassword] = useState("");

  const [rememberId, setRememberId] =
    useState(() => {
      if (typeof window === "undefined") return true;

      return Boolean(localStorage.getItem("savedEmail"));
    });

  const [loading, setLoading] =
    useState(false);

  async function handleLogin(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: toLoginEmail(loginId),
          password,
        });

      if (error || !data.user) {
        alert(error?.message ? `로그인 실패: ${error.message}` : "로그인 실패");
        setLoading(false);
        return;
      }

      const { data: profile } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

      if (!profile) {
        alert("프로필 정보가 없습니다.");
        setLoading(false);
        return;
      }

      localStorage.setItem(
        "role",
        profile.role || ""
      );

      localStorage.setItem(
        "team",
        profile.team || ""
      );

      localStorage.setItem(
        "name",
        profile.name || ""
      );

      if (rememberId) {
        localStorage.setItem(
          "savedEmail",
          toDisplayId(loginId)
        );
      } else {
        localStorage.removeItem(
          "savedEmail"
        );
      }

      await recordLoginActivity(profile);

      router.push("/main");
    } catch (err) {
      console.error(err);
      alert("로그인 중 오류 발생");
    }

    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "Pretendard",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "18px",
          padding: "28px",
          position: "relative",
          overflow: "hidden",
          boxShadow:
            "0 4px 12px rgba(0,0,0,0.04)",
        }}
      >
        <img
          src="/brand/zeta-logo.png"
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "82%",
            maxWidth: "340px",
            transform:
              "translate(-50%, -50%)",
            opacity: 0.11,
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 0,
          }}
        />

        <form
          onSubmit={handleLogin}
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              color: "#0f172a",
              fontSize: "24px",
              fontWeight: 900,
              lineHeight: 1.25,
              marginBottom: "4px",
            }}
          >
            업무 통합 시스템 로그인
          </div>

          <div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                marginBottom: "8px",
                color: "#111827",
              }}
            >
              아이디
            </div>

            <input
              type="text"
              value={loginId}
              onChange={(e) =>
                setLoginId(e.target.value)
              }
              placeholder="아이디 입력"
              autoCapitalize="none"
              autoCorrect="off"
              required
              style={{
                width: "100%",
                height: "44px",
                borderRadius: "10px",
                border:
                  "1px solid #cbd5e1",
                padding: "0 12px",
                fontSize: "14px",
                background: "#fff",
                outline: "none",
              }}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                marginBottom: "8px",
                color: "#111827",
              }}
            >
              비밀번호
            </div>

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
              placeholder="비밀번호 입력"
              required
              style={{
                width: "100%",
                height: "44px",
                borderRadius: "10px",
                border:
                  "1px solid #cbd5e1",
                padding: "0 12px",
                fontSize: "14px",
                background: "#fff",
                outline: "none",
              }}
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              fontSize: "13px",
              color: "#374151",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={rememberId}
              onChange={(e) =>
                setRememberId(
                  e.target.checked
                )
              }
              style={{
                width: "15px",
                height: "15px",
              }}
            />
            아이디 저장
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "4px",
              width: "100%",
              height: "48px",
              borderRadius: "12px",
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {loading
              ? "로그인 중..."
              : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
