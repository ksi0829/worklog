"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const SAVED_ID_KEY = "worklog_saved_login_id";

export default function LoginPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(SAVED_ID_KEY);
    if (saved) {
      setLoginId(saved);
      setRememberId(true);
    }
  }, []);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        location.href = "/";
      }
    };
    check();
  }, [supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginId,
        password,
      });

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      if (rememberId) {
        localStorage.setItem(SAVED_ID_KEY, loginId);
      } else {
        localStorage.removeItem(SAVED_ID_KEY);
      }

      location.href = "/";
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <div style={title}>로그인</div>
        <div style={sub}>업무일지 시스템</div>

        <form onSubmit={onSubmit} style={{ marginTop: 20 }}>
          <div style={field}>
            <label style={label}>아이디</label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              style={input}
              autoComplete="username"
            />
          </div>

          <div style={field}>
            <label style={label}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={input}
              autoComplete="current-password"
            />
          </div>

          <label style={checkRow}>
            <input
              type="checkbox"
              checked={rememberId}
              onChange={(e) => setRememberId(e.target.checked)}
            />
            <span>아이디 저장</span>
          </label>

          {msg && <div style={errBox}>{msg}</div>}

          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  padding: 16,
};

const card: React.CSSProperties = {
  width: 360,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 24,
};

const title: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
};

const sub: React.CSSProperties = {
  marginTop: 6,
  color: "#6b7280",
  fontSize: 13,
};

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 14,
};

const label: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
};

const input: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  padding: "0 12px",
  fontSize: 14,
  outline: "none",
};

const checkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#374151",
  marginBottom: 16,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const errBox: React.CSSProperties = {
  marginBottom: 12,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 10,
  padding: 10,
  fontSize: 12,
};