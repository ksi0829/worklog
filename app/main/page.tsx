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

type ScheduleRow = {
  id: number;
  date: string;
  time: string | null;
  type: string | null;
  company: string | null;
  title: string | null;
  writer: string | null;
};

function todayKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}-${String(now.getDate()).padStart(
    2,
    "0"
  )}`;
}

export default function MainPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("공지");
  const [noticeText, setNoticeText] =
    useState(defaultNotice);
  const [upcomingSchedules, setUpcomingSchedules] = useState<
    ScheduleRow[]
  >([]);

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

  async function loadUpcomingSchedules() {
    const { data, error } = await supabase
      .from("schedules")
      .select("id,date,time,type,company,title,writer")
      .gte("date", todayKey())
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(8);

    if (!error && data) {
      setUpcomingSchedules(data as ScheduleRow[]);
    }
  }

  useEffect(() => {
    const storedTeam = localStorage.getItem("team") || "";
    const storedRole = localStorage.getItem("role") || "";

    setRole(storedRole);
    void loadLatestNotice(storedTeam);
    void loadUpcomingSchedules();
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
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>다가오는 일정</h2>
          <button
            type="button"
            style={styles.panelButton}
            onClick={() => router.push("/schedule")}
          >
            일정관리
          </button>
        </div>

        {upcomingSchedules.length === 0 ? (
          <div style={styles.empty}>등록된 예정 일정이 없습니다.</div>
        ) : (
          <div style={styles.scheduleList}>
            {upcomingSchedules.map((item) => (
              <button
                key={item.id}
                type="button"
                style={styles.scheduleItem}
                onClick={() => router.push("/schedule")}
              >
                <div style={styles.scheduleDate}>
                  <strong>{item.date.slice(5).replace("-", ".")}</strong>
                  <span>{item.time?.slice(0, 5) || "-"}</span>
                </div>

                <div style={styles.scheduleBody}>
                  <div style={styles.scheduleTitle}>
                    {item.title || item.company || "일정"}
                  </div>
                  <div style={styles.scheduleMeta}>
                    {[item.type, item.company, item.writer]
                      .filter(Boolean)
                      .join(" / ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
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
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "14px",
  },
  panelTitle: {
    margin: 0,
    fontSize: "18px",
    color: "#111820",
  },
  panelButton: {
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
  empty: {
    border: "1px dashed #d6dce5",
    borderRadius: "10px",
    padding: "28px 16px",
    color: "#667085",
    fontSize: "13px",
    textAlign: "center",
  },
  scheduleList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "10px",
  },
  scheduleItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    minHeight: "68px",
    border: "1px solid #e3e7ed",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "12px",
    textAlign: "left",
    cursor: "pointer",
  },
  scheduleDate: {
    width: "56px",
    minWidth: "56px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    borderRadius: "8px",
    background: "#f3f5f7",
    color: "#111820",
    fontSize: "12px",
  },
  scheduleBody: {
    minWidth: 0,
    flex: 1,
  },
  scheduleTitle: {
    color: "#111820",
    fontSize: "14px",
    fontWeight: 850,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  scheduleMeta: {
    marginTop: "5px",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 650,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};
