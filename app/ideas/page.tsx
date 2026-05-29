"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

type IdeaPostRow = {
  id: number;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  author_team: string | null;
  created_at: string;
  updated_at: string;
  idea_attachments?: { id: number }[];
};

type ProfileRow = {
  name: string | null;
  team: string | null;
};

type IdeaPost = {
  id: number;
  title: string;
  body: string;
  authorName: string;
  authorTeam: string;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
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

function formatPreview(body: string) {
  return body.replace(/\s+/g, " ").trim();
}

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

export default function IdeasPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [posts, setPosts] = useState<IdeaPost[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [currentTeam, setCurrentTeam] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(
    () => Boolean(currentUserId && title.trim() && body.trim() && !saving),
    [body, currentUserId, saving, title]
  );

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("idea_posts")
      .select("id,title,body,author_id,author_name,author_team,created_at,updated_at,idea_attachments(id)")
      .order("created_at", { ascending: false });

    if (error) {
      setPosts([]);
      setMessage("아이디어 게시판 SQL 적용 후 사용할 수 있습니다. project-docs/supabase-idea-board.sql을 실행해 주세요.");
      setLoading(false);
      return;
    }

    setPosts(
      ((data || []) as IdeaPostRow[]).map((post) => ({
        id: post.id,
        title: post.title,
        body: post.body,
        authorName: post.author_name,
        authorTeam: post.author_team || "",
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        attachmentCount: post.idea_attachments?.length || 0,
      }))
    );
    setLoading(false);
  }, []);

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

      await loadPosts();
    });
  }, [loadPosts]);

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
      await uploadAttachments((data as { id: number }).id, files);
      setTitle("");
      setBody("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("아이디어가 등록되었습니다.");
      await loadPosts();
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : "첨부파일 업로드에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <span style={styles.kicker}>IDEA BOARD</span>
          <h2 style={styles.title}>아이디어 공유</h2>
          <p style={styles.description}>
            업무 개선, 제품 아이디어, 현장 제안 등을 자유롭게 공유하는 게시판입니다.
          </p>
        </div>
      </section>

      {message && <div style={styles.message}>{message}</div>}

      <section style={styles.formCard}>
        <h3 style={styles.sectionTitle}>아이디어 작성</h3>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="제목"
          style={styles.input}
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="내용을 입력해 주세요."
          style={{ ...styles.input, ...styles.textarea }}
        />
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
        <button type="button" style={styles.primaryButton} onClick={() => void createPost()} disabled={!canSubmit}>
          {saving ? "등록 중" : "아이디어 등록"}
        </button>
      </section>

      <section style={styles.listCard}>
        <div style={styles.listHeader}>
          <h3 style={styles.sectionTitle}>공유된 아이디어</h3>
          <span style={styles.count}>{posts.length}건</span>
        </div>
        {loading ? (
          <div style={styles.empty}>아이디어를 불러오는 중입니다.</div>
        ) : posts.length === 0 ? (
          <div style={styles.empty}>등록된 아이디어가 없습니다.</div>
        ) : (
          <div style={styles.postList}>
            {posts.map((post) => (
              <button
                key={post.id}
                type="button"
                style={styles.postCard}
                onClick={() => router.push(`/ideas/${post.id}`)}
              >
                <div style={styles.postTop}>
                  <strong>{post.title}</strong>
                  {post.attachmentCount > 0 && <span style={styles.attachmentBadge}>첨부 {post.attachmentCount}</span>}
                </div>
                <p style={styles.preview}>{formatPreview(post.body)}</p>
                <div style={styles.meta}>
                  <span>{post.authorName} / {post.authorTeam || "부서 미입력"}</span>
                  <span>{formatDateTime(post.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
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
  hero: {
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    background: "#ffffff",
    padding: "22px",
    marginBottom: "16px",
  },
  kicker: {
    color: "#0f8a56",
    fontSize: "12px",
    fontWeight: 900,
  },
  title: {
    margin: "8px 0 7px",
    fontSize: "25px",
    fontWeight: 900,
  },
  description: {
    margin: 0,
    color: "#475569",
    fontSize: "13px",
    fontWeight: 700,
  },
  message: {
    border: "1px solid #d1fae5",
    borderRadius: "12px",
    background: "#ecfdf3",
    color: "#047857",
    padding: "12px 14px",
    marginBottom: "14px",
    fontSize: "13px",
    fontWeight: 800,
  },
  formCard: {
    display: "grid",
    gap: "10px",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    background: "#ffffff",
    padding: "18px",
    marginBottom: "16px",
  },
  listCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    background: "#ffffff",
    padding: "18px",
  },
  listHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "12px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "17px",
    fontWeight: 900,
  },
  count: {
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 900,
  },
  input: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: "11px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 13px",
    minHeight: "42px",
    fontSize: "13px",
    fontWeight: 700,
    outline: "none",
  },
  textarea: {
    minHeight: "130px",
    padding: "13px",
    lineHeight: 1.55,
    resize: "vertical",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  fileButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "38px",
    border: "1px solid #d1d5db",
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
    gap: "6px",
  },
  primaryButton: {
    justifySelf: "start",
    minHeight: "40px",
    border: 0,
    borderRadius: "10px",
    background: "#0f8a56",
    color: "#ffffff",
    padding: "0 16px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  postList: {
    display: "grid",
    gap: "10px",
  },
  postCard: {
    display: "grid",
    gap: "8px",
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    padding: "14px",
    textAlign: "left",
    cursor: "pointer",
  },
  postTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    fontSize: "15px",
  },
  attachmentBadge: {
    flexShrink: 0,
    borderRadius: "999px",
    background: "#ecfdf3",
    color: "#047857",
    padding: "5px 8px",
    fontSize: "11px",
    fontWeight: 900,
  },
  preview: {
    margin: 0,
    color: "#475569",
    fontSize: "13px",
    lineHeight: 1.5,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
    flexWrap: "wrap",
  },
  empty: {
    border: "1px dashed #cbd5e1",
    borderRadius: "12px",
    padding: "28px 16px",
    color: "#64748b",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 800,
  },
};
