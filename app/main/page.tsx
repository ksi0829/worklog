"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();
const defaultNotice =
  "금주 출하 일정 및 고객사 방문 일정 확인 바랍니다.";

type NoticeRow = {
  title: string;
  body: string;
  target_team: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

export default function MainPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("공지");
  const [noticeText, setNoticeText] =
    useState(defaultNotice);

  async function loadLatestNotice(currentTeam: string) {
    const { data, error } = await supabase
      .from("notices")
      .select("title,body,target_team,starts_on,ends_on")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);

    if (error || !data) return;

    const today = new Date().toISOString().slice(0, 10);
    const notice = ((data || []) as NoticeRow[]).find(
      (item) => {
        const teamMatched =
          !item.target_team ||
          item.target_team === currentTeam;
        const started =
          !item.starts_on || item.starts_on <= today;
        const notEnded =
          !item.ends_on || item.ends_on >= today;

        return teamMatched && started && notEnded;
      }
    );

    if (!notice) return;

    setNoticeTitle(notice.title || "공지");
    setNoticeText(notice.body || defaultNotice);
  }

  useEffect(() => {
    const storedTeam = localStorage.getItem("team") || "";
    const storedRole = localStorage.getItem("role") || "";

    setRole(storedRole);
    void loadLatestNotice(storedTeam);
  }, []);

  return (
    <section style={styles.dashboard}>
      <div style={styles.noticeBox}>
        <div style={styles.noticeBadge}>{noticeTitle}</div>
        <div style={styles.noticeText}>{noticeText}</div>

        {["admin", "lead"].includes(role) && (
          <button
            type="button"
            style={styles.noticeManageButton}
            onClick={() => router.push("/notices")}
          >
            공지관리
          </button>
        )}
      </div>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>업무 메뉴</h2>
      </section>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  dashboard: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  noticeBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "#ffffff",
    padding: "14px 16px",
    borderRadius: "10px",
    border: "1px solid #e3e7ed",
  },
  noticeBadge: {
    fontSize: "12px",
    fontWeight: 850,
    color: "#fff",
    background: "#111820",
    padding: "4px 9px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
  },
  noticeText: {
    flex: 1,
    fontSize: "13px",
    color: "#475467",
    lineHeight: 1.5,
  },
  noticeManageButton: {
    height: "32px",
    padding: "0 12px",
    borderRadius: "8px",
    border: "1px solid #cfd6df",
    background: "#fff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  panel: {
    minHeight: "280px",
    background: "#ffffff",
    border: "1px solid #e3e7ed",
    borderRadius: "10px",
    padding: "22px",
  },
  panelTitle: {
    margin: 0,
    fontSize: "18px",
    color: "#111820",
  },
};
