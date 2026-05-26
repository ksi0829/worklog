"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import activityStyles from "./page.module.css";

const supabase = createSupabaseBrowser();

type ActivityEvent = "login" | "logout" | "activity" | "auto_logout";

type ActivityLogRow = {
  id: number;
  user_id: string;
  user_name: string | null;
  team: string | null;
  role: string | null;
  event_type: ActivityEvent;
  path: string | null;
  user_agent: string | null;
  created_at: string;
};

type UserSummary = {
  userId: string;
  name: string;
  team: string;
  role: string;
  latestEvent: ActivityEvent;
  latestAt: string;
  latestLogin?: string;
  latestLogout?: string;
  latestActivity?: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function eventLabel(eventType: ActivityEvent) {
  switch (eventType) {
    case "login":
      return "로그인";
    case "logout":
      return "로그아웃";
    case "auto_logout":
      return "자동 로그아웃";
    default:
      return "활동";
  }
}

function eventStyle(eventType: ActivityEvent) {
  if (eventType === "login") return styles.badgeGreen;
  if (eventType === "logout" || eventType === "auto_logout") return styles.badgeGray;
  return styles.badgeBlue;
}

function isActive(summary: UserSummary) {
  const latestAt = new Date(summary.latestAt).getTime();
  const withinWindow = Date.now() - latestAt < 15 * 60 * 1000;

  return (
    withinWindow &&
    summary.latestEvent !== "logout" &&
    summary.latestEvent !== "auto_logout"
  );
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("로그인 정보를 확인할 수 없습니다.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    setIsAdmin(profile?.role === "admin");

    const { data, error } = await supabase
      .from("user_activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      setMessage(
        "접속 로그 테이블을 불러오지 못했습니다. project-docs/supabase-user-activity-logs.sql을 실행해 주세요."
      );
      setLogs([]);
      setLoading(false);
      return;
    }

    setLogs((data || []) as ActivityLogRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  const summaries = useMemo(() => {
    const map = new Map<string, UserSummary>();

    logs.forEach((log) => {
      const current = map.get(log.user_id);
      const next: UserSummary = current || {
        userId: log.user_id,
        name: log.user_name || "-",
        team: log.team || "-",
        role: log.role || "-",
        latestEvent: log.event_type,
        latestAt: log.created_at,
      };

      if (!current || new Date(log.created_at) > new Date(current.latestAt)) {
        next.latestEvent = log.event_type;
        next.latestAt = log.created_at;
        next.name = log.user_name || next.name;
        next.team = log.team || next.team;
        next.role = log.role || next.role;
      }

      if (log.event_type === "login" && !next.latestLogin) {
        next.latestLogin = log.created_at;
      }
      if (
        (log.event_type === "logout" || log.event_type === "auto_logout") &&
        !next.latestLogout
      ) {
        next.latestLogout = log.created_at;
      }
      if (log.event_type === "activity" && !next.latestActivity) {
        next.latestActivity = log.created_at;
      }

      map.set(log.user_id, next);
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
    );
  }, [logs]);

  const activeSummaries = useMemo(
    () => summaries.filter(isActive),
    [summaries]
  );

  const groupedLogs = useMemo(() => {
    const groups = new Map<string, ActivityLogRow[]>();

    logs.forEach((log) => {
      const label = formatDateLabel(log.created_at);
      const dailyLogs = groups.get(label) || [];
      dailyLogs.push(log);
      groups.set(label, dailyLogs);
    });

    return Array.from(groups.entries());
  }, [logs]);

  return (
    <main
      className={`${activityStyles.page} ${isAdmin ? "" : activityStyles.publicPage}`}
    >
      {message && <div style={styles.messageBox}>{message}</div>}

      <section className={`${activityStyles.card} ${activityStyles.presenceCard}`}>
        <div className={`${activityStyles.cardHeader} ${activityStyles.presenceHeader}`}>
          <div className={activityStyles.headingBlock}>
            <h3>현재 접속 인원</h3>
            <p>최근 15분 내 활동 기준</p>
          </div>
          <div className={activityStyles.presenceControls}>
            <span>{loading ? "불러오는 중" : `${activeSummaries.length}명`}</span>
            <button
              type="button"
              className={activityStyles.refreshButton}
              onClick={() => void loadLogs()}
            >
              새로고침
            </button>
          </div>
        </div>
        {activeSummaries.length === 0 ? (
          <div style={styles.emptyBox}>현재 접속 중으로 확인되는 인원이 없습니다.</div>
        ) : (
          <div className={activityStyles.presenceList}>
            {activeSummaries.map((summary) => (
              <div key={summary.userId} className={activityStyles.presenceRow}>
                <span className={activityStyles.onlineLamp} />
                <div className={activityStyles.presenceIdentity}>
                  <strong>{summary.name}</strong>
                  <span>{summary.team}</span>
                </div>
                <span className={activityStyles.presenceTime}>
                  최근 활동 {formatDateTime(summary.latestActivity || summary.latestAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <>
          <section className={activityStyles.summaryGrid}>
            <div className={activityStyles.statCard}>
              <span>최근 활동 사용자</span>
              <strong>{summaries.length}명</strong>
            </div>
            <div className={activityStyles.statCard}>
              <span>접속 추정</span>
              <strong>{activeSummaries.length}명</strong>
            </div>
            <div className={activityStyles.statCard}>
              <span>저장 로그</span>
              <strong>{logs.length}건</strong>
            </div>
          </section>

          <section className={activityStyles.card}>
            <div className={activityStyles.cardHeader}>
              <h3>사용자별 최근 상태</h3>
              <span>{loading ? "불러오는 중" : `${summaries.length}명`}</span>
            </div>
            <p className={activityStyles.sectionHint}>
              사용자별 가장 최근 상태만 표시됩니다.
            </p>
            <div className={activityStyles.desktopTable}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>상태</th>
                    <th style={styles.th}>사용자</th>
                    <th style={styles.th}>부서</th>
                    <th style={styles.th}>권한</th>
                    <th style={styles.th}>최근 로그인</th>
                    <th style={styles.th}>최근 활동</th>
                    <th style={styles.th}>로그아웃</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary) => (
                    <tr key={summary.userId}>
                      <td style={styles.td}>
                        <span style={isActive(summary) ? styles.statusOnline : styles.statusOffline}>
                          {isActive(summary) ? "접속 추정" : eventLabel(summary.latestEvent)}
                        </span>
                      </td>
                      <td style={styles.tdStrong}>{summary.name}</td>
                      <td style={styles.td}>{summary.team}</td>
                      <td style={styles.td}>{summary.role}</td>
                      <td style={styles.td}>{formatDateTime(summary.latestLogin)}</td>
                      <td style={styles.td}>{formatDateTime(summary.latestActivity || summary.latestAt)}</td>
                      <td style={styles.td}>{formatDateTime(summary.latestLogout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={activityStyles.mobileSummaryList}>
              {summaries.map((summary) => (
                <div key={summary.userId} className={activityStyles.summaryRow}>
                  <div className={activityStyles.summaryIdentity}>
                    <strong>{summary.name}</strong>
                    <span>{summary.team} / {summary.role}</span>
                  </div>
                  <span style={isActive(summary) ? styles.statusOnline : styles.statusOffline}>
                    {isActive(summary) ? "접속 추정" : eventLabel(summary.latestEvent)}
                  </span>
                  <div className={activityStyles.summaryTimes}>
                    <span>로그인 {formatDateTime(summary.latestLogin)}</span>
                    <span>활동 {formatDateTime(summary.latestActivity || summary.latestAt)}</span>
                    <span>종료 {formatDateTime(summary.latestLogout)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={activityStyles.card}>
            <div className={activityStyles.cardHeader}>
              <h3>최근 활동 로그</h3>
              <span>{logs.length}건</span>
            </div>
            <div className={activityStyles.dayList}>
              {groupedLogs.map(([label, dailyLogs], index) => (
                <details
                  key={label}
                  className={activityStyles.dayGroup}
                  open={index === 0}
                >
                  <summary className={activityStyles.dayHeader}>
                    <strong>{label}</strong>
                    <span>{dailyLogs.length}건</span>
                  </summary>
                  <div className={activityStyles.logList}>
                    {dailyLogs.map((log) => (
                      <div key={log.id} className={activityStyles.logItem}>
                        <span style={{ ...styles.badge, ...eventStyle(log.event_type) }}>
                          {eventLabel(log.event_type)}
                        </span>
                        <strong>{log.user_name || "-"}</strong>
                        <span>{log.team || "-"}</span>
                        <span className={activityStyles.path}>{log.path || "-"}</span>
                        <time>{formatDateTime(log.created_at)}</time>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              {!loading && groupedLogs.length === 0 && (
                <div style={styles.emptyBox}>저장된 활동 로그가 없습니다.</div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  messageBox: {
    border: "1px solid #bfdbfe",
    borderRadius: "10px",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "12px 14px",
    fontWeight: 750,
  },
  emptyBox: {
    border: "1px dashed #cbd5e1",
    borderRadius: "10px",
    background: "#fbfcfd",
    color: "#64748b",
    padding: "18px",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 750,
  },
  table: {
    width: "100%",
    minWidth: "850px",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    padding: "10px",
    borderBottom: "1px solid #e5eaf0",
    color: "#667085",
    background: "#f8fafc",
  },
  td: {
    padding: "11px 10px",
    borderBottom: "1px solid #edf0f4",
    color: "#344054",
    fontWeight: 650,
  },
  tdStrong: {
    padding: "11px 10px",
    borderBottom: "1px solid #edf0f4",
    color: "#111820",
    fontWeight: 850,
  },
  statusOnline: {
    display: "inline-flex",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#047857",
    padding: "5px 9px",
    fontSize: "12px",
    fontWeight: 850,
  },
  statusOffline: {
    display: "inline-flex",
    borderRadius: "999px",
    background: "#f1f5f9",
    color: "#64748b",
    padding: "5px 9px",
    fontSize: "12px",
    fontWeight: 850,
  },
  badge: {
    display: "inline-flex",
    width: "fit-content",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "12px",
    fontWeight: 850,
  },
  badgeGreen: {
    background: "#dcfce7",
    color: "#047857",
  },
  badgeGray: {
    background: "#f1f5f9",
    color: "#64748b",
  },
  badgeBlue: {
    background: "#dbeafe",
    color: "#1d4ed8",
  },
};
