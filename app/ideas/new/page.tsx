"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();
const IDEA_ATTACHMENT_BUCKET = "idea-attachments";
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const ATTACHMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,.dwg,.dxf,.zip";
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp",
  "xlsx", "xls", "csv", "docx", "doc", "pptx", "ppt",
  "dwg", "dxf", "zip",
]);

type ProfileRow = {
  name: string | null;
  team: string | null;
};

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLocaleLowerCase() || "";
}

function getAttachmentError(files: File[]) {
  if (files.length > MAX_ATTACHMENT_COUNT) {
    return `파일은 한 번에 최대 ${MAX_ATTACHMENT_COUNT}개까지 첨부할 수 있습니다.`;
  }

  for (const file of files) {
    if (!ALLOWED_EXTENSIONS.has(getExtension(file.name))) {
      return `${file.name}: 이미지, PDF, Office, 엑셀, DWG/DXF, ZIP 파일만 첨부할 수 있습니다.`;
    }
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
      return `${file.name}: 파일 크기는 30MB 이하만 첨부할 수 있습니다.`;
    }
  }

  return "";
}

export default function IdeaNewPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [currentTeam, setCurrentTeam] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(
    () => Boolean(currentUserId && title.trim() && body.trim() && !saving),
    [body, currentUserId, saving, title]
  );

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id || "";
      setCurrentUserId(userId);

      if (userId) {
        const { data } = await supabase
          .from("profiles")
          .select("name,team")
          .eq("id", userId)
          .maybeSingle();
        const profile = data as ProfileRow | null;
        setCurrentName(profile?.name || localStorage.getItem("name") || "");
        setCurrentTeam(profile?.team || localStorage.getItem("team") || "");
      }
    });
  }, []);

  function handleFiles(nextFiles: FileList | null) {
    const selected = Array.from(nextFiles || []);
    const error = getAttachmentError(selected);
    if (error) {
      setMessage(error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFiles(selected);
    setMessage("");
  }

  async function uploadAttachments(postId: number, selectedFiles: File[]) {
    const rows = [];

    for (const file of selectedFiles) {
      const extension = getExtension(file.name) || "bin";
      const storagePath = `${currentUserId}/${postId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(IDEA_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`${file.name} 업로드 실패`);
      }

      rows.push({
        post_id: postId,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: currentUserId,
      });
    }

    if (rows.length === 0) return;

    const { error } = await supabase.from("idea_attachments").insert(rows);
    if (error) {
      await supabase.storage
        .from(IDEA_ATTACHMENT_BUCKET)
        .remove(rows.map((row) => row.storage_path));
      throw new Error("첨부파일 정보를 저장하지 못했습니다.");
    }
  }

  async function createPost() {
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!currentUserId) {
      setMessage("로그인 정보를 확인할 수 없습니다.");
      return;
    }
    if (!cleanTitle || !cleanBody) {
      setMessage("제목과 내용을 입력해 주세요.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { data, error } = await supabase
      .from("idea_posts")
      .insert({
        title: cleanTitle,
        body: cleanBody,
        author_id: currentUserId,
        author_name: currentName || "작성자",
        author_team: currentTeam || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setMessage("아이디어를 등록하지 못했습니다. SQL 적용 상태를 확인해 주세요.");
      setSaving(false);
      return;
    }

    try {
      const postId = (data as { id: number }).id;
      await uploadAttachments(postId, files);
      router.push(`/ideas/${postId}`);
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : "첨부파일 업로드에 실패했습니다.");
      setSaving(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.topBar}>
        <button type="button" style={styles.backButton} onClick={() => router.push("/ideas")}>
          목록으로
        </button>
      </div>

      <section style={styles.card}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>아이디어 작성</h2>
            <p style={styles.description}>공유할 아이디어의 제목과 내용을 입력해 주세요.</p>
          </div>
          <div style={styles.writerBadge}>{currentName || "작성자"} / {currentTeam || "부서 미입력"}</div>
        </div>

        {message && <div style={styles.message}>{message}</div>}

        <div style={styles.formBody}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>제목</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="제목을 입력해 주세요."
              style={styles.input}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>내용</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="내용을 입력해 주세요."
              style={{ ...styles.input, ...styles.textarea }}
            />
          </div>

          <div style={styles.fileRow}>
            <label style={styles.fileButton}>
              파일 첨부
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                onChange={(event) => handleFiles(event.target.files)}
                style={styles.hiddenInput}
              />
            </label>
            <span style={styles.fileHint}>
              {files.length > 0 ? `${files.length}개 선택됨` : "이미지, PDF, 엑셀, CAD, ZIP 등 최대 5개"}
            </span>
          </div>

          {files.length > 0 && (
            <div style={styles.selectedFiles}>
              {files.map((file) => (
                <span key={`${file.name}-${file.size}`}>{file.name}</span>
              ))}
            </div>
          )}
        </div>

        <div style={styles.actions}>
          <button type="button" style={styles.secondaryButton} onClick={() => router.push("/ideas")} disabled={saving}>
            취소
          </button>
          <button type="button" style={styles.primaryButton} onClick={() => void createPost()} disabled={!canSubmit}>
            {saving ? "등록 중" : "등록"}
          </button>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    padding: "28px",
    color: "#111827",
  },
  topBar: {
    marginBottom: "14px",
  },
  backButton: {
    minHeight: "38px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 14px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  card: {
    border: "1px solid #d6dde8",
    borderRadius: "14px",
    background: "#ffffff",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    borderBottom: "1px solid #e5e7eb",
    padding: "24px 28px 20px",
  },
  title: {
    margin: "0 0 7px",
    fontSize: "25px",
    fontWeight: 900,
  },
  description: {
    margin: 0,
    color: "#475569",
    fontSize: "13px",
    fontWeight: 700,
  },
  writerBadge: {
    borderRadius: "999px",
    background: "#f1f5f9",
    color: "#334155",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  message: {
    border: "1px solid #d1fae5",
    borderRadius: "10px",
    background: "#ecfdf3",
    color: "#047857",
    padding: "11px 13px",
    margin: "18px 28px 0",
    fontSize: "13px",
    fontWeight: 800,
  },
  formBody: {
    padding: "22px 28px 18px",
  },
  fieldGroup: {
    display: "grid",
    gap: "8px",
    marginBottom: "14px",
  },
  label: {
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 900,
  },
  input: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 14px",
    minHeight: "44px",
    fontSize: "14px",
    fontWeight: 700,
    outline: "none",
  },
  textarea: {
    minHeight: "260px",
    padding: "14px",
    lineHeight: 1.65,
    resize: "vertical",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "4px",
  },
  fileButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "38px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 13px",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },
  hiddenInput: {
    display: "none",
  },
  fileHint: {
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
  },
  selectedFiles: {
    display: "flex",
    flexWrap: "wrap",
    gap: "7px",
    marginTop: "10px",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    borderTop: "1px solid #e5e7eb",
    padding: "18px 28px",
  },
  primaryButton: {
    minHeight: "40px",
    border: 0,
    borderRadius: "10px",
    background: "#0f8a56",
    color: "#ffffff",
    padding: "0 17px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: "40px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 15px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
};
