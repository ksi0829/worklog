"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type Notice = {
  id: number;
  title: string;
  body: string;
  targetTeam: string;
  pinned: boolean;
  startsOn: string;
  endsOn: string;
  createdAt: string;
};

type NoticeRow = {
  id: number;
  title: string;
  body: string;
  target_team: string | null;
  pinned: boolean | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string | null;
};

const supabase = createSupabaseBrowser();
const today = new Date().toISOString().slice(0, 10);

const emptyForm = {
  title: "",
  body: "",
  targetTeam: "",
  pinned: false,
  startsOn: today,
  endsOn: "",
};

export default function NoticesPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const canManage = useMemo(() => ["admin", "lead"].includes(role), [role]);

  async function loadNotices() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("notices")
      .select("id,title,body,target_team,pinned,starts_on,ends_on,created_at")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(
        "공지 테이블을 확인해주세요. project-docs/supabase-shared-modules.sql 적용 후 다시 열면 됩니다."
      );
      setLoading(false);
      return;
    }

    setNotices(
      ((data || []) as NoticeRow[]).map((notice) => ({
        id: notice.id,
        title: notice.title,
        body: notice.body,
        targetTeam: notice.target_team || "",
        pinned: Boolean(notice.pinned),
        startsOn: notice.starts_on || "",
        endsOn: notice.ends_on || "",
        createdAt: (notice.created_at || "").slice(0, 10),
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      setRole(localStorage.getItem("role") || "");
      return loadNotices();
    });
  }, []);

  function updateForm<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function addNotice() {
    const title = form.title.trim();
    const body = form.body.trim();

    if (!canManage) {
      alert("공지 작성 권한이 없습니다.");
      return;
    }

    if (!title || !body) {
      alert("제목과 내용은 필수입니다.");
      return;
    }

    const { error } = await supabase.from("notices").insert({
      title,
      body,
      target_team: form.targetTeam.trim() || null,
      pinned: form.pinned,
      starts_on: form.startsOn || null,
      ends_on: form.endsOn || null,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setForm(emptyForm);
    await loadNotices();
  }

  async function deleteNotice(id: number) {
    if (!canManage) return;
    if (!confirm("공지를 삭제할까요?")) return;

    const { error } = await supabase.from("notices").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setNotices((current) => current.filter((notice) => notice.id !== id));
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.logo}>ZETA</div>
            <h1 style={styles.title}>공지관리</h1>
          </div>
          <button style={styles.backButton} onClick={() => router.push("/main")}>
            메인
          </button>
        </header>

        {!canManage && (
          <div style={styles.errorBox}>관리자 또는 팀장 계정만 공지를 작성할 수 있습니다.</div>
        )}
        {errorMessage && <div style={styles.errorBox}>{errorMessage}</div>}

        {canManage && (
          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>공지 작성</h2>

            <Field label="제목">
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="공지 제목"
                style={styles.input}
              />
            </Field>

            <Field label="내용">
              <textarea
                value={form.body}
                onChange={(event) => updateForm("body", event.target.value)}
                placeholder="공지 내용"
                style={{ ...styles.input, ...styles.textarea }}
              />
            </Field>

            <div style={styles.formGrid}>
              <Field label="대상 부서">
                <input
                  value={form.targetTeam}
                  onChange={(event) => updateForm("targetTeam", event.target.value)}
                  placeholder="비워두면 전체"
                  style={styles.input}
                />
              </Field>

              <Field label="시작일">
                <input
                  type="date"
                  value={form.startsOn}
                  onChange={(event) => updateForm("startsOn", event.target.value)}
                  style={styles.input}
                />
              </Field>

              <Field label="종료일">
                <input
                  type="date"
                  value={form.endsOn}
                  onChange={(event) => updateForm("endsOn", event.target.value)}
                  style={styles.input}
                />
              </Field>
            </div>

            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(event) => updateForm("pinned", event.target.checked)}
              />
              <span>상단 고정</span>
            </label>

            <button style={styles.primaryButton} onClick={addNotice}>
              공지 등록
            </button>
          </section>
        )}

        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>공지 목록</h2>

          {loading ? (
            <div style={styles.empty}>공지를 불러오는 중입니다.</div>
          ) : notices.length === 0 ? (
            <div style={styles.empty}>등록된 공지가 없습니다.</div>
          ) : (
            <div style={styles.noticeList}>
              {notices.map((notice) => (
                <article key={notice.id} style={styles.noticeCard}>
                  <div style={styles.noticeTop}>
                    <div>
                      <div style={styles.noticeTitle}>
                        {notice.pinned && <span style={styles.pin}>고정</span>}
                        {notice.title}
                      </div>
                      <div style={styles.noticeMeta}>
                        {notice.targetTeam || "전체"} / {notice.startsOn || "-"} ~{" "}
                        {notice.endsOn || "-"}
                      </div>
                    </div>
                    {canManage && (
                      <button
                        style={styles.deleteButton}
                        onClick={() => deleteNotice(notice.id)}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <div style={styles.noticeBody}>{notice.body}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    color: "#111827",
  },
  container: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "30px 22px 56px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "18px",
  },
  logo: {
    fontSize: "30px",
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1,
  },
  title: {
    margin: "8px 0 0",
    fontSize: "22px",
  },
  backButton: {
    height: "36px",
    padding: "0 14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "18px",
    marginBottom: "14px",
  },
  panelTitle: {
    margin: "0 0 14px",
    fontSize: "17px",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    marginBottom: "12px",
  },
  label: {
    color: "#374151",
    fontSize: "12px",
    fontWeight: 800,
  },
  input: {
    width: "100%",
    height: "42px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    padding: "0 12px",
    fontSize: "13px",
    outline: "none",
  },
  textarea: {
    minHeight: "92px",
    padding: "12px",
    resize: "vertical",
    lineHeight: 1.5,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "14px",
    color: "#334155",
    fontSize: "13px",
    fontWeight: 700,
  },
  primaryButton: {
    width: "100%",
    height: "44px",
    borderRadius: "10px",
    border: "none",
    background: "#111827",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  noticeList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  noticeCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "12px",
  },
  noticeTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
  },
  noticeTitle: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    fontSize: "14px",
    fontWeight: 800,
  },
  pin: {
    borderRadius: "999px",
    background: "#111827",
    color: "#ffffff",
    padding: "2px 7px",
    fontSize: "11px",
    fontWeight: 800,
  },
  noticeMeta: {
    marginTop: "5px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
  },
  noticeBody: {
    marginTop: "10px",
    color: "#334155",
    fontSize: "13px",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  deleteButton: {
    height: "30px",
    padding: "0 10px",
    borderRadius: "8px",
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#dc2626",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  empty: {
    border: "1px dashed #cbd5e1",
    borderRadius: "10px",
    padding: "18px",
    color: "#64748b",
    fontSize: "13px",
    textAlign: "center",
    background: "#f8fafc",
  },
  errorBox: {
    border: "1px solid #fecaca",
    borderRadius: "10px",
    background: "#fff1f2",
    color: "#b91c1c",
    padding: "12px",
    marginBottom: "14px",
    fontSize: "13px",
    fontWeight: 700,
  },
};
