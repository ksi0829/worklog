"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();
const APPROVAL_ATTACHMENT_BUCKET = "approval-attachments";
const DEFAULT_WARNING_LIMIT_MB = 1024;
const DEFAULT_CLEANUP_CANDIDATE_DAYS = 365;
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

type ApprovalStatus = "pending" | "approved" | "rejected";

type AttachmentRow = {
  id: number;
  document_id: number;
  storage_path: string;
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

type AdminDashboardSettingRow = {
  id: string;
  attachment_warning_limit_mb: number;
  cleanup_candidate_days: number;
};

type AttachmentDeletionLogRow = {
  id: number;
  document_title: string;
  original_name: string;
  size_bytes: number;
  deletion_reason: string;
  operation_status: "requested" | "completed" | "failed";
  deleted_by_name: string;
  requested_at: string;
  completed_at: string | null;
};

type ChatAttachmentSummaryRow = {
  attachment_count: number;
  total_bytes: number;
};

type IdeaAttachmentSummaryRow = {
  attachment_count: number;
  total_bytes: number;
};

type IdeaBoardSummaryRow = {
  post_count: number;
  comment_count: number;
  reaction_count: number;
  recent_post_count: number;
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
  const [settingsReady, setSettingsReady] = useState(false);
  const [warningLimitMb, setWarningLimitMb] = useState(DEFAULT_WARNING_LIMIT_MB);
  const [cleanupCandidateDays, setCleanupCandidateDays] = useState(DEFAULT_CLEANUP_CANDIDATE_DAYS);
  const [managementBusy, setManagementBusy] = useState(false);
  const [deletionAuditReady, setDeletionAuditReady] = useState(false);
  const [deletionLogs, setDeletionLogs] = useState<AttachmentDeletionLogRow[]>([]);
  const [chatAttachmentSummaryReady, setChatAttachmentSummaryReady] = useState(false);
  const [chatAttachmentCount, setChatAttachmentCount] = useState(0);
  const [chatAttachmentBytes, setChatAttachmentBytes] = useState(0);
  const [ideaAttachmentSummaryReady, setIdeaAttachmentSummaryReady] = useState(false);
  const [ideaAttachmentCount, setIdeaAttachmentCount] = useState(0);
  const [ideaAttachmentBytes, setIdeaAttachmentBytes] = useState(0);
  const [ideaBoardSummaryReady, setIdeaBoardSummaryReady] = useState(false);
  const [ideaPostCount, setIdeaPostCount] = useState(0);
  const [ideaCommentCount, setIdeaCommentCount] = useState(0);
  const [ideaReactionCount, setIdeaReactionCount] = useState(0);
  const [recentIdeaPostCount, setRecentIdeaPostCount] = useState(0);

  const loadDashboard = useCallback(async (preserveMessage = false) => {
    setLoading(true);
    if (!preserveMessage) setMessage("");

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

    const [
      attachmentResult,
      documentResult,
      profileResult,
      activityResult,
      settingsResult,
      deletionLogResult,
      chatAttachmentSummaryResult,
      ideaAttachmentSummaryResult,
      ideaBoardSummaryResult,
    ] = await Promise.all([
      supabase
        .from("approval_attachments")
        .select("id,document_id,storage_path,original_name,size_bytes,created_at")
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
      supabase
        .from("admin_dashboard_settings")
        .select("id,attachment_warning_limit_mb,cleanup_candidate_days")
        .eq("id", "default")
        .maybeSingle(),
      supabase
        .from("approval_attachment_deletion_logs")
        .select("id,document_title,original_name,size_bytes,deletion_reason,operation_status,deleted_by_name,requested_at,completed_at")
        .order("requested_at", { ascending: false })
        .limit(20),
      supabase.rpc("get_chat_attachment_admin_summary"),
      supabase.rpc("get_idea_attachment_admin_summary"),
      supabase.rpc("get_idea_board_admin_summary"),
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
    if (settingsResult.error || !settingsResult.data) {
      setSettingsReady(false);
      setWarningLimitMb(DEFAULT_WARNING_LIMIT_MB);
      setCleanupCandidateDays(DEFAULT_CLEANUP_CANDIDATE_DAYS);
    } else {
      const settings = settingsResult.data as AdminDashboardSettingRow;
      setSettingsReady(true);
      setWarningLimitMb(settings.attachment_warning_limit_mb);
      setCleanupCandidateDays(settings.cleanup_candidate_days);
    }
    if (deletionLogResult.error) {
      setDeletionAuditReady(false);
      setDeletionLogs([]);
    } else {
      setDeletionAuditReady(true);
      setDeletionLogs((deletionLogResult.data || []) as AttachmentDeletionLogRow[]);
    }
    if (chatAttachmentSummaryResult.error || !chatAttachmentSummaryResult.data?.[0]) {
      setChatAttachmentSummaryReady(false);
      setChatAttachmentCount(0);
      setChatAttachmentBytes(0);
    } else {
      const summary = chatAttachmentSummaryResult.data[0] as ChatAttachmentSummaryRow;
      setChatAttachmentSummaryReady(true);
      setChatAttachmentCount(Number(summary.attachment_count));
      setChatAttachmentBytes(Number(summary.total_bytes));
    }
    if (ideaAttachmentSummaryResult.error || !ideaAttachmentSummaryResult.data?.[0]) {
      setIdeaAttachmentSummaryReady(false);
      setIdeaAttachmentCount(0);
      setIdeaAttachmentBytes(0);
    } else {
      const summary = ideaAttachmentSummaryResult.data[0] as IdeaAttachmentSummaryRow;
      setIdeaAttachmentSummaryReady(true);
      setIdeaAttachmentCount(Number(summary.attachment_count));
      setIdeaAttachmentBytes(Number(summary.total_bytes));
    }
    if (ideaBoardSummaryResult.error || !ideaBoardSummaryResult.data?.[0]) {
      setIdeaBoardSummaryReady(false);
      setIdeaPostCount(0);
      setIdeaCommentCount(0);
      setIdeaReactionCount(0);
      setRecentIdeaPostCount(0);
    } else {
      const summary = ideaBoardSummaryResult.data[0] as IdeaBoardSummaryRow;
      setIdeaBoardSummaryReady(true);
      setIdeaPostCount(Number(summary.post_count));
      setIdeaCommentCount(Number(summary.comment_count));
      setIdeaReactionCount(Number(summary.reaction_count));
      setRecentIdeaPostCount(Number(summary.recent_post_count));
    }
    setDashboardAsOf(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  async function downloadAttachment(attachment: AttachmentRow) {
    setManagementBusy(true);
    setMessage("");

    const { data, error } = await supabase.storage
      .from(APPROVAL_ATTACHMENT_BUCKET)
      .download(attachment.storage_path);

    if (error || !data) {
      setMessage("첨부파일을 내려받지 못했습니다. 파일 권한을 확인해 주세요.");
      setManagementBusy(false);
      return;
    }

    const url = URL.createObjectURL(data);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = attachment.original_name;
    link.click();
    URL.revokeObjectURL(url);
    setManagementBusy(false);
  }

  async function deleteAttachment(attachment: AttachmentRow) {
    if (!deletionAuditReady) {
      setMessage("삭제 이력 SQL 적용 후 관리자 삭제를 사용할 수 있습니다.");
      return;
    }

    const linkedTitle = documents.find((document) => document.id === attachment.document_id)?.title || "결재문서";
    const deletionReason = prompt(
      `"${attachment.original_name}" 파일을 삭제하는 사유를 입력해 주세요.`,
      "테스트 또는 불필요 자료 정리"
    )?.trim();

    if (!deletionReason) return;
    if (deletionReason.length < 2 || deletionReason.length > 300) {
      setMessage("삭제 사유는 2자 이상 300자 이하로 입력해 주세요.");
      return;
    }

    if (!confirm(`${linkedTitle}의 첨부파일 "${attachment.original_name}"을 삭제할까요? 문서 본문은 남고 삭제 사유가 기록됩니다.`)) {
      return;
    }

    setManagementBusy(true);
    setMessage("");

    const { data: deletionLog, error: logError } = await supabase
      .from("approval_attachment_deletion_logs")
      .insert({
        document_id: attachment.document_id,
        document_title: linkedTitle,
        storage_path: attachment.storage_path,
        original_name: attachment.original_name,
        size_bytes: attachment.size_bytes,
        deletion_reason: deletionReason,
        operation_status: "requested",
      })
      .select("id")
      .single();

    if (logError || !deletionLog) {
      setMessage("삭제 이력을 저장하지 못해 파일 삭제를 진행하지 않았습니다.");
      setManagementBusy(false);
      return;
    }

    const deletionLogId = Number(deletionLog.id);
    const { error: storageError } = await supabase.storage
      .from(APPROVAL_ATTACHMENT_BUCKET)
      .remove([attachment.storage_path]);

    if (storageError) {
      await supabase
        .from("approval_attachment_deletion_logs")
        .update({ operation_status: "failed", failure_message: "Storage 파일 삭제 실패" })
        .eq("id", deletionLogId);
      setMessage("저장된 파일을 삭제하지 못했습니다. 다시 시도해 주세요.");
      setManagementBusy(false);
      await loadDashboard(true);
      return;
    }

    const { error: metadataError } = await supabase
      .from("approval_attachments")
      .delete()
      .eq("id", attachment.id);

    if (metadataError) {
      await supabase
        .from("approval_attachment_deletion_logs")
        .update({ operation_status: "failed", failure_message: "첨부 메타데이터 삭제 실패" })
        .eq("id", deletionLogId);
      setMessage("파일은 삭제됐지만 첨부 목록 정리에 실패했습니다. 관리자 확인이 필요합니다.");
      setManagementBusy(false);
      await loadDashboard(true);
      return;
    }

    await supabase
      .from("approval_attachment_deletion_logs")
      .update({ operation_status: "completed", completed_at: new Date().toISOString() })
      .eq("id", deletionLogId);
    setMessage(`"${attachment.original_name}" 첨부파일을 삭제했습니다.`);
    setManagementBusy(false);
    await loadDashboard(true);
  }

  async function saveSettings() {
    if (!settingsReady) return;
    if (warningLimitMb < 100 || warningLimitMb > 10240) {
      setMessage("용량 경고 기준은 100MB 이상 10240MB 이하로 입력해 주세요.");
      return;
    }
    if (cleanupCandidateDays < 30 || cleanupCandidateDays > 3650) {
      setMessage("정리 후보 기준은 30일 이상 3650일 이하로 입력해 주세요.");
      return;
    }

    setManagementBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("admin_dashboard_settings")
      .update({
        attachment_warning_limit_mb: warningLimitMb,
        cleanup_candidate_days: cleanupCandidateDays,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");

    if (error) {
      setMessage("관리 기준을 저장하지 못했습니다. 설정 SQL 적용 상태를 확인해 주세요.");
      setManagementBusy(false);
      return;
    }

    setMessage("관리 기준을 저장했습니다.");
    setManagementBusy(false);
    await loadDashboard(true);
  }

  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((sum, attachment) => sum + attachment.size_bytes, 0),
    [attachments]
  );
  const storagePercent = Math.min(
    100,
    Math.round((totalAttachmentBytes / (warningLimitMb * 1024 * 1024)) * 1000) / 10
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
  const cleanupThreshold = dashboardAsOf - cleanupCandidateDays * 24 * 60 * 60 * 1000;
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
        <div style={styles.headerInner}>
          <div>
            <span style={styles.kicker}>ADMIN DASHBOARD</span>
            <h2 style={styles.title}>그룹웨어 운영 현황</h2>
            <p style={styles.description}>
              결재, 채팅, 아이디어 첨부 사용량과 운영 기준을 관리합니다.
            </p>
          </div>
          <button type="button" style={styles.refreshButton} onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? "불러오는 중" : "새로고침"}
          </button>
        </div>
      </section>

      {message && <div style={styles.messageBox}>{message}</div>}

      <section style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>결재 첨부 사용량</span>
          <strong style={styles.summaryValue}>{formatBytes(totalAttachmentBytes)}</strong>
          <span style={styles.summaryHint}>{attachments.length}개 파일 / 경고 기준 {formatBytes(warningLimitMb * 1024 * 1024)}</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>채팅 첨부 사용량</span>
          <strong style={styles.summaryValue}>
            {chatAttachmentSummaryReady ? formatBytes(chatAttachmentBytes) : "-"}
          </strong>
          <span style={styles.summaryHint}>
            {chatAttachmentSummaryReady
              ? `${chatAttachmentCount}개 파일 / 대화 참여자만 다운로드 가능`
              : "채팅 첨부 SQL 적용 후 집계"}
          </span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>아이디어 첨부 사용량</span>
          <strong style={styles.summaryValue}>
            {ideaAttachmentSummaryReady ? formatBytes(ideaAttachmentBytes) : "-"}
          </strong>
          <span style={styles.summaryHint}>
            {ideaAttachmentSummaryReady
              ? `${ideaAttachmentCount}개 파일 / 아이디어 게시판 첨부`
              : "아이디어 게시판 SQL 적용 후 집계"}
          </span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>아이디어 게시판 현황</span>
          <strong style={styles.summaryValue}>
            {ideaBoardSummaryReady ? `${ideaPostCount}건` : "-"}
          </strong>
          <span style={styles.summaryHint}>
            {ideaBoardSummaryReady
              ? `댓글 ${ideaCommentCount}개 / 공감 ${ideaReactionCount}개 / 최근 30일 ${recentIdeaPostCount}건`
              : "댓글/공감 SQL 적용 후 집계"}
          </span>
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
        <div style={styles.storageInner}>
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
            <span>경고 기준 {formatBytes(warningLimitMb * 1024 * 1024)}</span>
          </div>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.cardInner}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>첨부 보관 및 삭제 운영 기준</h3>
              <p style={styles.cardHint}>중요 완료 문서의 파일은 보존을 기본으로 하고, 삭제 전 필요 여부를 확인합니다.</p>
            </div>
          </div>
          <div style={styles.policyGrid}>
            <div style={styles.policyItem}>
              <strong>삭제 권한</strong>
              <span>관리자는 불필요 자료를 사유 기록 후 삭제하며, 작성자는 결재 대기 중 오첨부만 삭제합니다.</span>
            </div>
            <div style={styles.policyItem}>
              <strong>완료 문서</strong>
              <span>승인 완료 문서 첨부는 원칙적으로 유지하고, 삭제가 필요하면 별도 보관 후 진행합니다.</span>
            </div>
            <div style={styles.policyItem}>
              <strong>정리 우선순위</strong>
              <span>테스트 파일, 중복 업로드, 취소 또는 반려 후 보존 불필요 자료부터 검토합니다.</span>
            </div>
            <div style={styles.policyItem}>
              <strong>정기 점검</strong>
              <span>월 1회 사용량, 오래된 첨부, 삭제 이력을 관리자 페이지에서 확인합니다.</span>
            </div>
          </div>
        </div>
      </section>

      <section style={styles.settingsCard}>
        <div style={styles.settingsInner}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>관리 기준 설정</h3>
              <p style={styles.cardHint}>용량 경고와 오래된 파일 후보를 판단하는 기준입니다. Supabase 요금제 한도 자체를 변경하지는 않습니다.</p>
            </div>
          </div>
          {!settingsReady ? (
            <div style={styles.setupNotice}>
              설정 저장 기능을 사용하려면 `project-docs/supabase-admin-dashboard-settings.sql`을 한 번 실행해 주세요.
            </div>
          ) : (
            <div style={styles.settingsRow}>
              <label style={styles.settingField}>
                <span>용량 경고 기준 (MB)</span>
                <input
                  type="number"
                  min={100}
                  max={10240}
                  value={warningLimitMb}
                  onChange={(event) => setWarningLimitMb(Number(event.target.value))}
                  style={styles.settingInput}
                />
              </label>
              <label style={styles.settingField}>
                <span>정리 후보 기준 (일)</span>
                <input
                  type="number"
                  min={30}
                  max={3650}
                  value={cleanupCandidateDays}
                  onChange={(event) => setCleanupCandidateDays(Number(event.target.value))}
                  style={styles.settingInput}
                />
              </label>
              <button type="button" style={styles.primaryButton} onClick={() => void saveSettings()} disabled={managementBusy}>
                설정 저장
              </button>
            </div>
          )}
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
              <p style={styles.cardHint}>등록 후 {cleanupCandidateDays}일이 지난 첨부</p>
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

      <section style={styles.card}>
        <div style={styles.cardInner}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>첨부파일 관리</h3>
              <p style={styles.cardHint}>삭제하면 해당 파일만 제거되며 결재문서 내용은 유지됩니다.</p>
            </div>
            <span style={styles.cardCount}>{attachments.length}건</span>
          </div>
          {!deletionAuditReady && (
            <div style={styles.setupNotice}>
              관리자 삭제 이력을 남기려면 `project-docs/supabase-approval-attachment-deletion-logs.sql`을 실행해 주세요. 적용 전에는 이 화면에서 파일을 삭제할 수 없습니다.
            </div>
          )}
          {attachments.length === 0 ? (
            <div style={styles.emptyBox}>관리할 첨부파일이 없습니다.</div>
          ) : (
            <div style={styles.managementList}>
              {attachments.map((attachment) => (
                <div key={attachment.id} style={styles.managementItem}>
                  <div style={styles.listText}>
                    <strong>{attachment.original_name}</strong>
                    <span>
                      {documentsById.get(attachment.document_id)?.title || "연결 문서"} / {formatDate(attachment.created_at)}
                    </span>
                  </div>
                  <em style={styles.fileSize}>{formatBytes(attachment.size_bytes)}</em>
                  <div style={styles.itemActions}>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      disabled={managementBusy}
                      onClick={() => void downloadAttachment(attachment)}
                    >
                      다운로드
                    </button>
                    <button
                      type="button"
                      style={styles.dangerButton}
                      disabled={managementBusy || !deletionAuditReady}
                      onClick={() => void deleteAttachment(attachment)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.cardInner}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>최근 첨부 삭제 이력</h3>
              <p style={styles.cardHint}>관리자 페이지에서 수행한 첨부 삭제 요청과 처리 결과를 표시합니다.</p>
            </div>
            <span style={styles.cardCount}>{deletionLogs.length}건</span>
          </div>
          {!deletionAuditReady ? (
            <div style={styles.emptyBox}>삭제 이력 SQL 적용 후 기록이 표시됩니다.</div>
          ) : deletionLogs.length === 0 ? (
            <div style={styles.emptyBox}>기록된 관리자 첨부 삭제 이력이 없습니다.</div>
          ) : (
            <div style={styles.auditList}>
              {deletionLogs.map((log) => (
                <div key={log.id} style={styles.auditItem}>
                  <div style={styles.listText}>
                    <strong>{log.original_name}</strong>
                    <span>{log.document_title} / {log.deletion_reason}</span>
                    <span>{log.deleted_by_name || "관리자"} / {formatDateTime(log.completed_at || log.requested_at)}</span>
                  </div>
                  <em
                    style={{
                      ...styles.auditStatus,
                      ...(log.operation_status === "completed"
                        ? styles.auditCompleted
                        : log.operation_status === "failed"
                          ? styles.auditFailed
                          : styles.auditRequested),
                    }}
                  >
                    {log.operation_status === "completed" ? "삭제 완료" : log.operation_status === "failed" ? "실패" : "처리 중"}
                  </em>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

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
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    background: "#ffffff",
    overflow: "hidden",
  },
  headerInner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "16px",
    padding: "20px 22px",
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
    lineHeight: 1.5,
    wordBreak: "keep-all",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
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
    minWidth: 0,
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
    lineHeight: 1.45,
    overflowWrap: "anywhere",
  },
  storageCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    overflow: "hidden",
  },
  storageInner: {
    padding: "17px",
  },
  settingsCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    overflow: "hidden",
  },
  settingsInner: {
    padding: "18px 20px",
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    padding: "16px",
    minWidth: 0,
  },
  cardInner: {
    padding: "18px 20px",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
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
    lineHeight: 1.45,
    wordBreak: "keep-all",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "12px",
  },
  setupNotice: {
    border: "1px solid #fed7aa",
    borderRadius: "9px",
    background: "#fff7ed",
    color: "#9a3412",
    padding: "12px",
    marginBottom: "12px",
    fontSize: "13px",
    fontWeight: 700,
  },
  policyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "10px",
  },
  policyItem: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    border: "1px solid #edf0f3",
    borderRadius: "9px",
    background: "#fbfcfd",
    color: "#475467",
    padding: "12px",
    fontSize: "12px",
    fontWeight: 650,
    lineHeight: 1.55,
    overflowWrap: "anywhere",
  },
  settingsRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: "10px",
    minWidth: 0,
  },
  settingField: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    color: "#475467",
    fontSize: "12px",
    fontWeight: 800,
  },
  settingInput: {
    width: "170px",
    height: "38px",
    border: "1px solid #d0d5dd",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 10px",
    fontSize: "13px",
    fontWeight: 750,
    boxSizing: "border-box",
  },
  primaryButton: {
    height: "38px",
    border: "1px solid #0f8a56",
    borderRadius: "8px",
    background: "#0f8a56",
    color: "#ffffff",
    padding: "0 14px",
    fontSize: "13px",
    fontWeight: 850,
    cursor: "pointer",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  managementList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "430px",
    overflowY: "auto",
  },
  auditList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "330px",
    overflowY: "auto",
  },
  auditItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    border: "1px solid #edf0f3",
    borderRadius: "9px",
    background: "#fbfcfd",
    padding: "11px",
  },
  auditStatus: {
    flexShrink: 0,
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "11px",
    fontStyle: "normal",
    fontWeight: 850,
  },
  auditCompleted: {
    background: "#ecfdf3",
    color: "#047857",
  },
  auditFailed: {
    background: "#fff1f2",
    color: "#dc2626",
  },
  auditRequested: {
    background: "#fff7ed",
    color: "#c2410c",
  },
  managementItem: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(78px, auto) auto",
    alignItems: "center",
    gap: "12px",
    border: "1px solid #edf0f3",
    borderRadius: "9px",
    background: "#fbfcfd",
    padding: "10px",
  },
  itemActions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "6px",
  },
  secondaryButton: {
    height: "32px",
    border: "1px solid #d0d5dd",
    borderRadius: "7px",
    background: "#ffffff",
    color: "#344054",
    padding: "0 10px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  dangerButton: {
    height: "32px",
    border: "1px solid #fecaca",
    borderRadius: "7px",
    background: "#fff1f2",
    color: "#dc2626",
    padding: "0 10px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
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
    lineHeight: 1.45,
    overflowWrap: "anywhere",
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
    lineHeight: 1.5,
    wordBreak: "keep-all",
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
