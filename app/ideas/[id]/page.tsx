"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
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
  view_count: number | null;
  created_at: string;
  updated_at: string;
};

type IdeaAttachmentRow = {
  id: number;
  post_id: number;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
};

type IdeaCommentRow = {
  id: number;
  post_id: number;
  parent_id: number | null;
  body: string;
  author_id: string;
  author_name: string;
  author_team: string | null;
  created_at: string;
  updated_at: string;
};

type IdeaReactionRow = {
  id: number;
  post_id: number;
  user_id: string;
  user_name: string;
  created_at: string;
};

type ProfileRow = {
  name: string | null;
  team: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLocaleLowerCase() || "";
}

function getAttachmentError(files: File[], existingCount: number) {
  if (existingCount + files.length > MAX_ATTACHMENT_COUNT) {
    return `첨부파일은 게시글당 최대 ${MAX_ATTACHMENT_COUNT}개까지 등록할 수 있습니다.`;
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

export default function IdeaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewIncrementedRef = useRef(false);
  const postId = Number(params.id);
  const [post, setPost] = useState<IdeaPostRow | null>(null);
  const [attachments, setAttachments] = useState<IdeaAttachmentRow[]>([]);
  const [comments, setComments] = useState<IdeaCommentRow[]>([]);
  const [reactions, setReactions] = useState<IdeaReactionRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [currentTeam, setCurrentTeam] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [interactionReady, setInteractionReady] = useState(true);

  const isOwner = Boolean(post && currentUserId && post.author_id === currentUserId);
  const hasReacted = reactions.some((reaction) => reaction.user_id === currentUserId);
  const topLevelComments = comments.filter((comment) => !comment.parent_id);

  const loadPost = useCallback(async () => {
    if (!Number.isFinite(postId)) {
      setMessage("게시글 번호가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const [postResult, attachmentResult, commentResult, reactionResult] = await Promise.all([
      supabase
        .from("idea_posts")
        .select("id,title,body,author_id,author_name,author_team,view_count,created_at,updated_at")
        .eq("id", postId)
        .maybeSingle(),
      supabase
        .from("idea_attachments")
        .select("id,post_id,storage_path,original_name,mime_type,size_bytes,uploaded_by,created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true }),
      supabase
        .from("idea_comments")
        .select("id,post_id,parent_id,body,author_id,author_name,author_team,created_at,updated_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true }),
      supabase
        .from("idea_reactions")
        .select("id,post_id,user_id,user_name,created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true }),
    ]);

    let postData = postResult.data as IdeaPostRow | null;
    let postError = postResult.error;

    if (postResult.error) {
      const fallbackPostResult = await supabase
        .from("idea_posts")
        .select("id,title,body,author_id,author_name,author_team,created_at,updated_at")
        .eq("id", postId)
        .maybeSingle();

      postData = fallbackPostResult.data as IdeaPostRow | null;
      postError = fallbackPostResult.error;
    }

    if (postError) {
      setMessage("아이디어 게시판 SQL 적용 후 사용할 수 있습니다. project-docs/supabase-idea-board.sql을 실행해 주세요.");
      setLoading(false);
      return;
    }

    if (!postData) {
      setPost(null);
      setMessage("게시글을 찾을 수 없습니다.");
      setLoading(false);
      return;
    }

    const row = postData;
    setPost(row);
    setTitle(row.title);
    setBody(row.body);
    setAttachments((attachmentResult.data || []) as IdeaAttachmentRow[]);
    setComments(commentResult.error ? [] : (commentResult.data || []) as IdeaCommentRow[]);
    setReactions(reactionResult.error ? [] : (reactionResult.data || []) as IdeaReactionRow[]);
    setInteractionReady(!commentResult.error && !reactionResult.error);
    setLoading(false);

    if (!viewIncrementedRef.current) {
      viewIncrementedRef.current = true;
      void supabase
        .rpc("increment_idea_post_view", { target_post_id: postId })
        .then(({ error }) => {
          if (!error) {
            setPost((current) => (
              current ? { ...current, view_count: (current.view_count || 0) + 1 } : current
            ));
          }
        });
    }
  }, [postId]);

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
      await loadPost();
    });
  }, [loadPost]);

  function handleFiles(nextFiles: FileList | null) {
    const selected = Array.from(nextFiles || []);
    const error = getAttachmentError(selected, attachments.length);
    if (error) {
      setMessage(error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFiles(selected);
    setMessage("");
  }

  async function uploadAttachments(selectedFiles: File[]) {
    if (!post || selectedFiles.length === 0) return;

    const rows = [];
    for (const file of selectedFiles) {
      const extension = getExtension(file.name) || "bin";
      const storagePath = `${currentUserId}/${post.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(IDEA_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) throw new Error(`${file.name} 업로드 실패`);

      rows.push({
        post_id: post.id,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: currentUserId,
      });
    }

    const { error } = await supabase.from("idea_attachments").insert(rows);
    if (error) {
      await supabase.storage.from(IDEA_ATTACHMENT_BUCKET).remove(rows.map((row) => row.storage_path));
      throw new Error("첨부파일 정보를 저장하지 못했습니다.");
    }
  }

  async function savePost() {
    if (!post || !isOwner) return;
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) {
      setMessage("제목과 내용을 입력해 주세요.");
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await supabase
      .from("idea_posts")
      .update({ title: cleanTitle, body: cleanBody, updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("author_id", currentUserId);

    if (error) {
      setMessage("게시글을 수정하지 못했습니다.");
      setBusy(false);
      return;
    }

    try {
      await uploadAttachments(files);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setEditMode(false);
      setMessage("게시글을 저장했습니다.");
      await loadPost();
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : "첨부파일 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadAttachment(attachment: IdeaAttachmentRow) {
    setBusy(true);
    const { data, error } = await supabase.storage
      .from(IDEA_ATTACHMENT_BUCKET)
      .download(attachment.storage_path);

    if (error || !data) {
      setMessage("첨부파일을 내려받지 못했습니다.");
      setBusy(false);
      return;
    }

    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.original_name;
    link.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  async function deleteAttachment(attachment: IdeaAttachmentRow) {
    if (!isOwner || !confirm(`${attachment.original_name} 파일을 삭제할까요?`)) return;
    setBusy(true);
    const { error: storageError } = await supabase.storage
      .from(IDEA_ATTACHMENT_BUCKET)
      .remove([attachment.storage_path]);

    if (storageError) {
      setMessage("첨부파일을 삭제하지 못했습니다.");
      setBusy(false);
      return;
    }

    const { error } = await supabase
      .from("idea_attachments")
      .delete()
      .eq("id", attachment.id)
      .eq("post_id", postId);

    if (error) {
      setMessage("첨부 목록 정리에 실패했습니다.");
    } else {
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      setMessage("첨부파일을 삭제했습니다.");
    }
    setBusy(false);
  }

  async function deletePost() {
    if (!post || !isOwner || !confirm("게시글을 삭제할까요? 첨부파일도 함께 삭제됩니다.")) return;
    setBusy(true);
    setMessage("");

    if (attachments.length > 0) {
      await supabase.storage
        .from(IDEA_ATTACHMENT_BUCKET)
        .remove(attachments.map((attachment) => attachment.storage_path));
    }

    const { error } = await supabase
      .from("idea_posts")
      .delete()
      .eq("id", post.id)
      .eq("author_id", currentUserId);

    if (error) {
      setMessage("게시글을 삭제하지 못했습니다.");
      setBusy(false);
      return;
    }

    router.push("/ideas");
  }

  async function toggleReaction() {
    if (!post || !currentUserId || busy || !interactionReady) return;
    setBusy(true);
    setMessage("");

    if (hasReacted) {
      const { error } = await supabase
        .from("idea_reactions")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", currentUserId);

      if (error) {
        setMessage("공감을 취소하지 못했습니다.");
      } else {
        setReactions((current) => current.filter((reaction) => reaction.user_id !== currentUserId));
      }
      setBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from("idea_reactions")
      .insert({
        post_id: post.id,
        user_id: currentUserId,
        user_name: currentName || "사용자",
      })
      .select("id,post_id,user_id,user_name,created_at")
      .single();

    if (error || !data) {
      setMessage("공감을 등록하지 못했습니다.");
    } else {
      setReactions((current) => [...current, data as IdeaReactionRow]);
    }
    setBusy(false);
  }

  async function addComment() {
    if (!post || !currentUserId || !interactionReady) return;
    const cleanBody = commentBody.trim();
    if (!cleanBody) {
      setMessage("댓글 내용을 입력해 주세요.");
      return;
    }

    setBusy(true);
    setMessage("");
    const { data, error } = await supabase
      .from("idea_comments")
      .insert({
        post_id: post.id,
        parent_id: replyTargetId,
        body: cleanBody,
        author_id: currentUserId,
        author_name: currentName || "사용자",
        author_team: currentTeam || null,
      })
      .select("id,post_id,parent_id,body,author_id,author_name,author_team,created_at,updated_at")
      .single();

    if (error || !data) {
      setMessage("댓글을 등록하지 못했습니다.");
    } else {
      setComments((current) => [...current, data as IdeaCommentRow]);
      setCommentBody("");
      setReplyTargetId(null);
    }
    setBusy(false);
  }

  async function deleteComment(comment: IdeaCommentRow) {
    if (comment.author_id !== currentUserId || !confirm("댓글을 삭제할까요? 답글이 있으면 함께 삭제됩니다.")) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("idea_comments")
      .delete()
      .eq("id", comment.id)
      .eq("author_id", currentUserId);

    if (error) {
      setMessage("댓글을 삭제하지 못했습니다.");
    } else {
      setComments((current) => current.filter((item) => item.id !== comment.id && item.parent_id !== comment.id));
    }
    setBusy(false);
  }

  return (
    <main style={styles.page}>
      <button type="button" style={styles.backButton} onClick={() => router.push("/ideas")}>
        목록으로
      </button>

      {message && <div style={styles.message}>{message}</div>}

      {loading ? (
        <section style={styles.card}>게시글을 불러오는 중입니다.</section>
      ) : !post ? (
        <section style={styles.card}>게시글이 없습니다.</section>
      ) : (
        <section style={styles.card}>
          <div style={styles.titlePanel}>
            <div style={styles.header}>
              <div style={styles.titleArea}>
                <span style={styles.boardLabel}>아이디어 공유</span>
                {editMode ? (
                  <input value={title} onChange={(event) => setTitle(event.target.value)} style={styles.titleInput} />
                ) : (
                  <h2 style={styles.title}>{post.title}</h2>
                )}
                <div style={styles.metaGrid}>
                  <span>글쓴이 <strong>{post.author_name}</strong></span>
                  <span>부서 <strong>{post.author_team || "부서 미입력"}</strong></span>
                  <span>작성일 <strong>{formatDateTime(post.created_at)}</strong></span>
                  <span>조회 <strong>{(post.view_count || 0).toLocaleString("ko-KR")}</strong></span>
                  <span>공감 <strong>{reactions.length.toLocaleString("ko-KR")}</strong></span>
                  <span>댓글 <strong>{comments.length.toLocaleString("ko-KR")}</strong></span>
                </div>
              </div>
              {isOwner && (
                <div style={styles.actions}>
                  {editMode ? (
                    <>
                      <button type="button" style={styles.primaryButton} onClick={() => void savePost()} disabled={busy}>
                        저장
                      </button>
                      <button type="button" style={styles.secondaryButton} onClick={() => setEditMode(false)} disabled={busy}>
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" style={styles.secondaryButton} onClick={() => setEditMode(true)}>
                        수정
                      </button>
                      <button type="button" style={styles.dangerButton} onClick={() => void deletePost()} disabled={busy}>
                        삭제
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={styles.reactionBar}>
              <button
                type="button"
                style={{ ...styles.reactionButton, ...(hasReacted ? styles.reactionButtonActive : {}) }}
                onClick={() => void toggleReaction()}
                disabled={busy || !interactionReady}
              >
                {hasReacted ? "공감 취소" : "공감"} {reactions.length}
              </button>
              {!interactionReady && <span style={styles.interactionNotice}>댓글/공감 SQL 적용 후 사용할 수 있습니다.</span>}
            </div>
          </div>

          <div style={styles.contentPanel}>
            <div style={styles.panelTitle}>내용</div>
            {editMode ? (
              <textarea value={body} onChange={(event) => setBody(event.target.value)} style={styles.textarea} />
            ) : (
              <div style={styles.body}>{post.body}</div>
            )}
          </div>

          {editMode && (
            <div style={styles.fileRow}>
              <label style={styles.fileButton}>
                첨부 추가
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                  onChange={(event) => handleFiles(event.target.files)}
                  style={styles.hiddenInput}
                />
              </label>
              <span style={styles.fileHint}>{files.length > 0 ? `${files.length}개 선택됨` : "게시글당 최대 5개"}</span>
            </div>
          )}

          <div style={styles.attachmentBox}>
            <div style={styles.attachmentHeader}>
              <strong>첨부파일</strong>
              <span>{attachments.length}개</span>
            </div>
            {attachments.length === 0 ? (
              <div style={styles.empty}>등록된 첨부파일이 없습니다.</div>
            ) : (
              <div style={styles.attachmentList}>
                {attachments.map((attachment) => (
                  <div key={attachment.id} style={styles.attachmentItem}>
                    <div>
                      <strong>{attachment.original_name}</strong>
                      <span>{formatBytes(attachment.size_bytes)} / {formatDateTime(attachment.created_at)}</span>
                    </div>
                    <div style={styles.attachmentActions}>
                      <button type="button" style={styles.secondaryButton} onClick={() => void downloadAttachment(attachment)} disabled={busy}>
                        다운로드
                      </button>
                      {isOwner && (
                        <button type="button" style={styles.dangerButton} onClick={() => void deleteAttachment(attachment)} disabled={busy}>
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <section style={styles.commentBox}>
            <div style={styles.attachmentHeader}>
              <strong>댓글</strong>
              <span>{comments.length}개</span>
            </div>
            {!interactionReady ? (
              <div style={styles.empty}>댓글 기능은 `project-docs/supabase-idea-board.sql` 실행 후 사용할 수 있습니다.</div>
            ) : (
              <>
                <div style={styles.commentEditor}>
                  {replyTargetId && (
                    <div style={styles.replyTarget}>
                      답글 작성 중
                      <button type="button" style={styles.inlineButton} onClick={() => setReplyTargetId(null)}>
                        취소
                      </button>
                    </div>
                  )}
                  <textarea
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="댓글을 입력해 주세요."
                    style={styles.commentTextarea}
                  />
                  <button type="button" style={styles.primaryButton} onClick={() => void addComment()} disabled={busy || !commentBody.trim()}>
                    댓글 등록
                  </button>
                </div>
                {comments.length === 0 ? (
                  <div style={styles.empty}>등록된 댓글이 없습니다.</div>
                ) : (
                  <div style={styles.commentList}>
                    {topLevelComments.map((comment) => {
                      const replies = comments.filter((reply) => reply.parent_id === comment.id);
                      return (
                        <div key={comment.id} style={styles.commentThread}>
                          <CommentItem
                            comment={comment}
                            currentUserId={currentUserId}
                            onReply={() => setReplyTargetId(comment.id)}
                            onDelete={() => void deleteComment(comment)}
                          />
                          {replies.length > 0 && (
                            <div style={styles.replyList}>
                              {replies.map((reply) => (
                                <CommentItem
                                  key={reply.id}
                                  comment={reply}
                                  currentUserId={currentUserId}
                                  onReply={() => setReplyTargetId(comment.id)}
                                  onDelete={() => void deleteComment(reply)}
                                  isReply
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </section>
      )}
    </main>
  );
}

function CommentItem({
  comment,
  currentUserId,
  onReply,
  onDelete,
  isReply = false,
}: {
  comment: IdeaCommentRow;
  currentUserId: string;
  onReply: () => void;
  onDelete: () => void;
  isReply?: boolean;
}) {
  return (
    <div style={{ ...styles.commentItem, ...(isReply ? styles.replyItem : {}) }}>
      <div style={styles.commentMeta}>
        <strong>{comment.author_name}</strong>
        <span>{comment.author_team || "부서 미입력"} / {formatDateTime(comment.created_at)}</span>
      </div>
      <div style={styles.commentBody}>{comment.body}</div>
      <div style={styles.commentActions}>
        {!isReply && (
          <button type="button" style={styles.inlineButton} onClick={onReply}>
            답글
          </button>
        )}
        {comment.author_id === currentUserId && (
          <button type="button" style={styles.inlineDangerButton} onClick={onDelete}>
            삭제
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    padding: "28px",
    color: "#111827",
  },
  backButton: {
    minHeight: "38px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 14px",
    marginBottom: "14px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
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
  card: {
    display: "grid",
    gap: "16px",
  },
  titlePanel: {
    border: "1px solid #d6dde8",
    borderRadius: "14px",
    background: "#ffffff",
    padding: "22px 24px",
  },
  reactionBar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "16px",
    paddingTop: "16px",
    borderTop: "1px solid #e5e7eb",
  },
  reactionButton: {
    minHeight: "38px",
    border: "1px solid #fed7aa",
    borderRadius: "999px",
    background: "#fff7ed",
    color: "#c2410c",
    padding: "0 15px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  reactionButtonActive: {
    background: "#c2410c",
    color: "#ffffff",
    borderColor: "#c2410c",
  },
  interactionNotice: {
    color: "#9a3412",
    fontSize: "12px",
    fontWeight: 800,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
  },
  titleArea: {
    minWidth: 0,
  },
  boardLabel: {
    display: "inline-flex",
    marginBottom: "10px",
    borderRadius: "999px",
    background: "#ecfdf3",
    color: "#047857",
    padding: "5px 9px",
    fontSize: "11px",
    fontWeight: 900,
  },
  title: {
    margin: "0 0 14px",
    fontSize: "27px",
    fontWeight: 900,
    lineHeight: 1.25,
  },
  titleInput: {
    width: "100%",
    minHeight: "44px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    padding: "0 12px",
    fontSize: "18px",
    fontWeight: 900,
  },
  metaGrid: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 800,
  },
  contentPanel: {
    border: "1px solid #d6dde8",
    borderRadius: "14px",
    background: "#ffffff",
    padding: "22px 24px",
  },
  panelTitle: {
    marginBottom: "14px",
    color: "#0f172a",
    fontSize: "15px",
    fontWeight: 900,
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  body: {
    minHeight: "210px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#fbfdff",
    padding: "20px",
    color: "#111827",
    fontSize: "14px",
    fontWeight: 650,
    lineHeight: 1.75,
    whiteSpace: "pre-wrap",
  },
  textarea: {
    width: "100%",
    minHeight: "220px",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "14px",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.7,
    resize: "vertical",
  },
  primaryButton: {
    minHeight: "36px",
    border: 0,
    borderRadius: "10px",
    background: "#0f8a56",
    color: "#ffffff",
    padding: "0 13px",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: "36px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 13px",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },
  dangerButton: {
    minHeight: "36px",
    border: "1px solid #fecaca",
    borderRadius: "10px",
    background: "#fff1f2",
    color: "#dc2626",
    padding: "0 13px",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "14px",
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
  attachmentBox: {
    border: "1px solid #d6dde8",
    borderRadius: "14px",
    background: "#ffffff",
    padding: "18px 20px",
  },
  commentBox: {
    border: "1px solid #d6dde8",
    borderRadius: "14px",
    background: "#ffffff",
    padding: "18px 20px",
  },
  attachmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
    fontSize: "14px",
    fontWeight: 900,
  },
  attachmentList: {
    display: "grid",
    gap: "8px",
  },
  attachmentItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    border: "1px solid #e5e7eb",
    borderRadius: "11px",
    padding: "11px",
  },
  attachmentActions: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  empty: {
    border: "1px dashed #cbd5e1",
    borderRadius: "11px",
    padding: "18px",
    color: "#64748b",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 800,
  },
  commentEditor: {
    display: "grid",
    gap: "9px",
    marginBottom: "14px",
  },
  commentTextarea: {
    width: "100%",
    minHeight: "86px",
    border: "1px solid #d1d5db",
    borderRadius: "11px",
    background: "#ffffff",
    color: "#111827",
    padding: "12px 13px",
    fontSize: "13px",
    fontWeight: 700,
    lineHeight: 1.55,
    resize: "vertical",
    outline: "none",
  },
  replyTarget: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 850,
  },
  commentList: {
    display: "grid",
    gap: "10px",
  },
  commentThread: {
    display: "grid",
    gap: "8px",
  },
  commentItem: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#fbfdff",
    padding: "13px 14px",
  },
  replyList: {
    display: "grid",
    gap: "8px",
    marginLeft: "28px",
  },
  replyItem: {
    background: "#f8fafc",
  },
  commentMeta: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 750,
    marginBottom: "8px",
  },
  commentBody: {
    color: "#111827",
    fontSize: "13px",
    fontWeight: 650,
    lineHeight: 1.65,
    whiteSpace: "pre-wrap",
  },
  commentActions: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  inlineButton: {
    border: 0,
    background: "transparent",
    color: "#2563eb",
    padding: 0,
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },
  inlineDangerButton: {
    border: 0,
    background: "transparent",
    color: "#dc2626",
    padding: 0,
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },
};
