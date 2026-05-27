"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();
const ATTACHMENT_MANAGEMENT_LIMIT_BYTES = 1024 * 1024 * 1024;
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_CANDIDATE_DAYS = 365;

type ApprovalStatus = "pending" | "approved" | "rejected";

type AttachmentRow = {
  id: number;
  document_id: number;
  original_name: string;
  size_bytes: number;
  created_at: string;
};

type ApprovalDocumentRow = {
  id: number;
  title: string;
  status: ApprovalStatus;
  requester_name: string;
  submitted_at: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  team: string | null;
  role: string | null;
};

type ActivityLogRow = {
  id: number;
  user_id: string;
  user_name: string | null;
  event_type: "login" | "logout" | "activity" | "auto_logout";
  created_at: string;
};

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: ApprovalStatus) {
  if (status === "approved") return "완료";
  if (status === "rejected") return "반려";
  return "대기";
}

export default function AdminPage() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [documents, setDocuments] = useState<ApprovalDocumentRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([]);
  const [dashboardAsOf, setDashboardAsOf] = useState(0);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsAuthorized(false);
      setMessage("로그인 정보를 확인할 수 없습니다.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      setIsAuthorized(false);
      setMessage("관리자 계정만 그룹웨어 관리 화면을 확인할 수 있습니다.");
      setLoading(false);
      return;
    }

    setIsAuthorized(true);

    const [attachmentResult, documentResult, profileResult, activityResult] = await Promise.all([
      supabase
        .from("approval_attachments")
        .select("id,document_id,original_name,size_bytes,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("approval_documents")
        .select("id,title,status,requester_name,submitted_at")
        .order("submitted_at", { ascending: false }),
      supabase.from("profiles").select("id,name,team,role").order("name", { ascending: true }),
      supabase
        .from("user_activity_logs")
        .select("id,user_id,user_name,event_type,created_at")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const errors = [
      attachmentResult.error && "첨부 사용량",
      documentResult.error && "결재 현황",
      profileResult.error && "사용자 현황",
      activityResult.error && "접속 현황",
    ].filter(Boolean);

    if (errors.length > 0) {
      setMessage(`${errors.join(", ")} 정보를 불러오지 못했습니다. 권한 또는 SQL 적용 상태를 확인해 주세요.`);
    }

    setAttachments((attachmentResult.data || []) as AttachmentRow[]);
    setDocuments((documentResult.data || []) as ApprovalDocumentRow[]);
    setProfiles((profileResult.data || []) as ProfileRow[]);
    setActivityLogs((activityResult.data || []) as ActivityLogRow[]);
    setDashboardAsOf(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((sum, attachment) => sum + attachment.size_bytes, 0),
    [attachments]
  );
  const storagePercent = Math.min(
    100,
    Math.round((totalAttachmentBytes / ATTACHMENT_MANAGEMENT_LIMIT_BYTES) * 1000) / 10
  );
  const pendingDocuments = documents.filter((document) => document.status === "pending");
  const approvedDocuments = documents.filter((document) => document.status === "approved");
  const latestActivityByUser = useMemo(() => {
    const map = new Map<string, ActivityLogRow>();
    activityLogs.forEach((log) => {
      if (!map.has(log.user_id)) map.set(log.user_id, log);
    });
    return Array.from(map.values());
  }, [activityLogs]);
  const activeUserCount = latestActivityByUser.filter(
    (log) =>
      dashboardAsOf > 0 &&
      dashboardAsOf - new Date(log.created_at).getTime() < ACTIVE_WINDOW_MS &&
      log.event_type !== "logout" &&
      log.event_type !== "auto_logout"
  ).length;
  const largestAttachments = [...attachments]
    .sort((left, right) => right.size_bytes - left.size_bytes)
    .slice(0, 5);
  const cleanupThreshold = dashboardAsOf - CLEANUP_CANDIDATE_DAYS * 24 * 60 * 60 * 1000;
  const cleanupCandidates = attachments
    .filter(
      (attachment) =>
        dashboardAsOf > 0 && new Date(attachment.created_at).getTime() < cleanupThreshold
    )
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .slice(0, 5);
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const oldestPendingDocuments = [...pendingDocuments]
    .sort((left, right) => left.submitted_at.localeCompare(right.submitted_at))
    .slice(0, 5);

  if (isAuthorized === false) {
    return (
      <main style={styles.page}>
        <section style={styles.deniedBox}>
          <h2 style={styles.deniedTitle}>접근할 수 없습니다.</h2>
          <p style={styles.deniedText}>{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <span style={styles.kicker}>ADMIN DASHBOARD</span>
          <h2 style={styles.title}>그룹웨어 운영 현황</h2>
          <p style={styles.description}>
            조회 전용 화면입니다. 삭제 또는 설정 변경 기능은 포함하지 않았습니다.
          </p>
        </div>
        <button type="button" style={styles.refreshButton} onClick={() => void loadDashboard()} disabled={loading}>
          {loading ? "불러오는 중" : "새로고침"}
        </button>
      </section>

      {message && <div style={styles.messageBox}>{message}</div>}

      <section style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>결재 첨부 사용량</span>
          <strong style={styles.summaryValue}>{formatBytes(totalAttachmentBytes)}</strong>
          <span style={styles.summaryHint}>{attachments.length}개 파일 / 관리 기준 1 GB</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>결재 대기</span>
          <strong style={styles.summaryValue}>{pendingDocuments.length}건</strong>
          <span style={styles.summaryHint}>완료 {approvedDocuments.length}건</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>등록 사용자</span>
          <strong style={styles.summaryValue}>{profiles.length}명</strong>
          <span style={styles.summaryHint}>프로필 등록 기준</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>현재 접속 추정</span>
          <strong style={styles.summaryValue}>{activeUserCount}명</strong>
          <span style={styles.summaryHint}>최근 15분 활동 기준</span>
        </div>
      </section>

      <section style={styles.storageCard}>
        <div style={styles.cardHeader}>
          <div>
            <h3 style={styles.cardTitle}>파일 저장 관리</h3>
            <p style={styles.cardHint}>결재문서에 업로드된 첨부파일만 집계합니다.</p>
          </div>
          <strong style={styles.storagePercent}>{storagePercent}%</strong>
        </div>
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressBar,
              width: `${storagePercent}%`,
              background: storagePercent >= 85 ? "#dc2626" : storagePercent >= 70 ? "#d97706" : "#0f8a56",
            }}
          />
        </div>
        <div style={styles.progressMeta}>
          <span>사용 {formatBytes(totalAttachmentBytes)}</span>
          <span>관리 기준 {formatBytes(ATTACHMENT_MANAGEMENT_LIMIT_BYTES)}</span>
        </div>
      </section>

      <div style={styles.twoColumn}>
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>용량이 큰 첨부파일</h3>
            <span style={styles.cardCount}>{largestAttachments.length}건</span>
          </div>
          {largestAttachments.length === 0 ? (
            <div style={styles.emptyBox}>등록된 첨부파일이 없습니다.</div>
          ) : (
            <div style={styles.list}>
              {largestAttachments.map((attachment) => (
                <div key={attachment.id} style={styles.listItem}>
                  <div style={styles.listText}>
                    <strong>{attachment.original_name}</strong>
                    <span>{documentsById.get(attachment.document_id)?.title || "연결 문서"}</span>
                  </div>
                  <em style={styles.fileSize}>{formatBytes(attachment.size_bytes)}</em>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>정리 검토 후보</h3>
              <p style={styles.cardHint}>등록 후 1년이 지난 첨부</p>
            </div>
            <span style={styles.cardCount}>{cleanupCandidates.length}건</span>
          </div>
          {cleanupCandidates.length === 0 ? (
            <div style={styles.emptyBox}>현재 검토할 오래된 첨부파일이 없습니다.</div>
          ) : (
            <div style={styles.list}>
              {cleanupCandidates.map((attachment) => (
                <div key={attachment.id} style={styles.listItem}>
                  <div style={styles.listText}>
                    <strong>{attachment.original_name}</strong>
                    <span>{formatDate(attachment.created_at)}</span>
                  </div>
                  <em style={styles.fileSize}>{formatBytes(attachment.size_bytes)}</em>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div style={styles.twoColumn}>
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>오래 대기 중인 결재</h3>
            <span style={styles.cardCount}>{pendingDocuments.length}건</span>
          </div>
          {oldestPendingDocuments.length === 0 ? (
            <div style={styles.emptyBox}>대기 중인 결재가 없습니다.</div>
          ) : (
            <div style={styles.list}>
              {oldestPendingDocuments.map((document) => (
                <div key={document.id} style={styles.listItem}>
                  <div style={styles.listText}>
                    <strong>{document.title}</strong>
                    <span>{document.requester_name} / {formatDate(document.submitted_at)}</span>
                  </div>
                  <em style={styles.statusPending}>{statusLabel(document.status)}</em>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>최근 접속 활동</h3>
            <span style={styles.cardCount}>{latestActivityByUser.length}명</span>
          </div>
          {latestActivityByUser.length === 0 ? (
            <div style={styles.emptyBox}>확인 가능한 활동 로그가 없습니다.</div>
          ) : (
            <div style={styles.list}>
              {latestActivityByUser.slice(0, 5).map((log) => (
                <div key={log.user_id} style={styles.listItem}>
                  <div style={styles.listText}>
                    <strong>{log.user_name || "-"}</strong>
                    <span>최근 활동 {formatDateTime(log.created_at)}</span>
                  </div>
                  <em style={styles.activityBadge}>
                    {log.event_type === "logout" || log.event_type === "auto_logout" ? "종료" : "활동"}
                  </em>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "20px",
    color: "#111827",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    background: "#ffffff",
    padding: "20px",
  },
  kicker: {
    display: "block",
    marginBottom: "6px",
    color: "#0f8a56",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.08em",
  },
  title: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 900,
  },
  description: {
    margin: "8px 0 0",
    color: "#667085",
    fontSize: "13px",
    fontWeight: 600,
  },
  refreshButton: {
    height: "38px",
    border: "1px solid #0f8a56",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#0f8a56",
    padding: "0 14px",
    fontSize: "13px",
    fontWeight: 850,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  messageBox: {
    border: "1px solid #bfdbfe",
    borderRadius: "10px",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "12px 14px",
    fontSize: "13px",
    fontWeight: 750,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },
  summaryCard: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    padding: "16px",
  },
  summaryLabel: {
    color: "#667085",
    fontSize: "12px",
    fontWeight: 800,
  },
  summaryValue: {
    color: "#111820",
    fontSize: "25px",
    fontWeight: 900,
  },
  summaryHint: {
    color: "#667085",
    fontSize: "12px",
    fontWeight: 600,
  },
  storageCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    padding: "17px",
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    padding: "16px",
    minWidth: 0,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "13px",
  },
  cardTitle: {
    margin: 0,
    color: "#111820",
    fontSize: "15px",
    fontWeight: 850,
  },
  cardHint: {
    margin: "5px 0 0",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 600,
  },
  cardCount: {
    color: "#667085",
    fontSize: "12px",
    fontWeight: 800,
  },
  storagePercent: {
    color: "#0f8a56",
    fontSize: "20px",
    fontWeight: 900,
  },
  progressTrack: {
    height: "12px",
    borderRadius: "999px",
    background: "#eef2f5",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    minWidth: "0",
    borderRadius: "999px",
    transition: "width 0.2s ease",
  },
  progressMeta: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "9px",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 700,
  },
  twoColumn: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "12px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    border: "1px solid #edf0f3",
    borderRadius: "9px",
    background: "#fbfcfd",
    padding: "10px",
  },
  listText: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
    color: "#111827",
    fontSize: "13px",
    overflow: "hidden",
  },
  fileSize: {
    flexShrink: 0,
    color: "#0f8a56",
    fontSize: "12px",
    fontStyle: "normal",
    fontWeight: 850,
  },
  statusPending: {
    flexShrink: 0,
    borderRadius: "999px",
    background: "#fff7ed",
    color: "#c2410c",
    padding: "5px 9px",
    fontSize: "11px",
    fontStyle: "normal",
    fontWeight: 850,
  },
  activityBadge: {
    flexShrink: 0,
    borderRadius: "999px",
    background: "#ecfdf3",
    color: "#047857",
    padding: "5px 9px",
    fontSize: "11px",
    fontStyle: "normal",
    fontWeight: 850,
  },
  emptyBox: {
    border: "1px dashed #cbd5e1",
    borderRadius: "9px",
    color: "#667085",
    padding: "16px",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 650,
  },
  deniedBox: {
    maxWidth: "520px",
    margin: "36px auto",
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    background: "#ffffff",
    padding: "28px",
    textAlign: "center",
  },
  deniedTitle: {
    margin: "0 0 9px",
    fontSize: "20px",
    fontWeight: 900,
  },
  deniedText: {
    margin: 0,
    color: "#667085",
    fontSize: "14px",
    fontWeight: 650,
  },
};
