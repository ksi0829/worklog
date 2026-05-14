"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [rememberId, setRememberId] =
    useState(true);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    const saved =
      localStorage.getItem("savedEmail");

    if (saved) {
      setEmail(saved);
      setRememberId(true);
    }
  }, []);

  async function handleLogin(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error || !data.user) {
        alert("로그인 실패");
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
          email
        );
      } else {
        localStorage.removeItem(
          "savedEmail"
        );
      }

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
          boxShadow:
            "0 4px 12px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            fontSize: "28px",
            fontWeight: 800,
            color: "#0f172a",
            marginBottom: "6px",
            lineHeight: 1,
            letterSpacing: "-0.5px",
          }}
        >
          업무일지 로그인
        </div>

        <div
          style={{
            color: "#6b7280",
            fontSize: "13px",
            marginBottom: "24px",
          }}
        >
          ZETA 업무 통합 시스템
        </div>

        <form
          onSubmit={handleLogin}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
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
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="이메일 입력"
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