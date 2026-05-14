"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();
const defaultNotice = "금주 출하 일정 및 고객사 방문 일정 확인 바랍니다.";

type NoticeRow = {
  title: string;
  body: string;
  target_team: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

export default function MainPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [role, setRole] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("공지");
  const [noticeText, setNoticeText] = useState(defaultNotice);

  async function loadLatestNotice(currentTeam: string) {
    const { data, error } = await supabase
      .from("notices")
      .select("title,body,target_team,starts_on,ends_on")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);

    if (error || !data) return;

    const today = new Date().toISOString().slice(0, 10);
    const notice = ((data || []) as NoticeRow[]).find((item) => {
      const teamMatched = !item.target_team || item.target_team === currentTeam;
      const started = !item.starts_on || item.starts_on <= today;
      const notEnded = !item.ends_on || item.ends_on >= today;
      return teamMatched && started && notEnded;
    });

    if (!notice) return;

    setNoticeTitle(notice.title || "공지");
    setNoticeText(notice.body || defaultNotice);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      const storedName = localStorage.getItem("name") || "";
      const storedTeam = localStorage.getItem("team") || "";
      const storedRole = localStorage.getItem("role") || "";

      setName(storedName);
      setTeam(storedTeam);
      setRole(storedRole);
      return loadLatestNotice(storedTeam);
    });
  }, []);

  const menus = [
    {
      title: "결재문서",
      path: "/approval",
    },
    {
      title: "업무일지",
      path: "/view",
    },
    {
      title: "A/S 관리",
      path: "/as",
    },
    {
      title: "영업관리",
      path: "/sales",
    },
    {
      title: "일정관리",
      path: "/schedule",
    },
    {
      title: "고객사",
      path: "/customer",
    },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();

    localStorage.removeItem("role");
    localStorage.removeItem("team");
    localStorage.removeItem("name");

    router.push("/login");
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <div style={styles.logo}>
              ZETA
            </div>

            <div style={styles.subTitle}>
              업무 통합 시스템
            </div>
          </div>

          <div style={styles.headerActions}>
            <button
              style={styles.headerButton}
              onClick={() =>
                router.push(
                  "/organization"
                )
              }
            >
              조직도
            </button>

            <button
              style={styles.headerButton}
              onClick={() =>
                router.push(
                  "/change-password"
                )
              }
            >
              계정관리
            </button>

            <button
              style={styles.headerButton}
              onClick={handleLogout}
            >
              로그아웃
            </button>
          </div>
        </div>

        <div style={styles.userInfo}>
          {name} / {team} / {role}
        </div>

        <div style={styles.noticeBox}>
          <div style={styles.noticeBadge}>
            {noticeTitle}
          </div>

          <div style={styles.noticeText}>
            {noticeText}
          </div>

          {["admin", "lead"].includes(role) && (
            <button
              style={styles.noticeManageButton}
              onClick={() => router.push("/notices")}
            >
              공지관리
            </button>
          )}
        </div>

        <div style={styles.menuList}>
          {menus.map((menu) => (
            <div
              key={menu.title}
              style={styles.menuItem}
              onClick={() =>
                router.push(menu.path)
              }
            >
              <div style={styles.menuTitle}>
                {menu.title}
              </div>

              <div style={styles.arrow}>
                ›
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    fontFamily: "Pretendard, sans-serif",
    color: "#111",
  },

  container: {
    maxWidth: "600px",
    margin: "0 auto",
    padding: "32px 22px",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "10px",
  },

  logo: {
    margin: 0,
    fontSize: "34px",
    fontWeight: 800,
    letterSpacing: "-1px",
    color: "#0f172a",
    lineHeight: 1,
  },

  subTitle: {
    marginTop: "6px",
    fontSize: "13px",
    color: "#777",
    fontWeight: 500,
  },

  headerActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "8px",
  },

  headerButton: {
    width: "76px",
    height: "36px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },

  userInfo: {
    marginBottom: "24px",
    fontSize: "12px",
    color: "#64748b",
    fontWeight: 600,
  },

  noticeBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#fff",
    padding: "12px 14px",
    borderRadius: "12px",
    marginBottom: "28px",
    border: "1px solid #e5e7eb",
  },

  noticeBadge: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#fff",
    background: "#111827",
    padding: "3px 8px",
    borderRadius: "999px",
  },

  noticeText: {
    flex: 1,
    fontSize: "12px",
    color: "#555",
    lineHeight: 1.45,
  },

  noticeManageButton: {
    height: "28px",
    padding: "0 10px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  menuList: {
    display: "flex",
    flexDirection: "column",
  },

  menuItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 2px",
    borderBottom: "1px solid #dddddd",
    cursor: "pointer",
  },

  menuTitle: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#111827",
  },

  arrow: {
    color: "#999",
    fontSize: "16px",
    fontWeight: 700,
  },

};
