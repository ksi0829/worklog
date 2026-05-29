"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();

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
  idea_attachments?: { id: number }[];
  idea_comments?: { id: number }[];
  idea_reactions?: { id: number }[];
};

type IdeaPost = {
  id: number;
  title: string;
  body: string;
  authorName: string;
  authorTeam: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
  commentCount: number;
  reactionCount: number;
};

function formatBoardDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default function IdeasPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<IdeaPost[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setMessage("");

    let { data, error } = await supabase
      .from("idea_posts")
      .select("id,title,body,author_id,author_name,author_team,view_count,created_at,updated_at,idea_attachments(id),idea_comments(id),idea_reactions(id)")
      .order("created_at", { ascending: false });

    if (error) {
      const fallback = await supabase
        .from("idea_posts")
        .select("id,title,body,author_id,author_name,author_team,view_count,created_at,updated_at,idea_attachments(id)")
        .order("created_at", { ascending: false });

      data = fallback.data as typeof data;
      error = fallback.error;
      if (!error) {
        setMessage("조회수 표시 SQL 적용 전입니다. project-docs/supabase-idea-board.sql을 실행해 주세요.");
      }
    }

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
        viewCount: post.view_count || 0,
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        attachmentCount: post.idea_attachments?.length || 0,
        commentCount: post.idea_comments?.length || 0,
        reactionCount: post.idea_reactions?.length || 0,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadPosts);
  }, [loadPosts]);

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return posts;

    return posts.filter((post) => {
      const haystack = [
        post.title,
        post.body,
        post.authorName,
        post.authorTeam,
      ].join(" ").toLocaleLowerCase();
      return haystack.includes(query);
    });
  }, [posts, searchQuery]);

  function submitSearch() {
    setSearchQuery(searchDraft.trim());
  }

  function resetSearch() {
    setSearchDraft("");
    setSearchQuery("");
  }

  return (
    <main style={styles.page}>
      <section style={styles.boardCard}>
        <div style={styles.boardHeader}>
          <div>
            <h2 style={styles.title}>아이디어 공유 게시판</h2>
            <p style={styles.description}>업무 개선, 제품 아이디어, 현장 제안을 자유롭게 공유합니다.</p>
          </div>
          <span style={styles.count}>{searchQuery ? `${filteredPosts.length}/${posts.length}건` : `${posts.length}건`}</span>
        </div>

        {message && <div style={styles.message}>{message}</div>}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, ...styles.boardColumn }}>게시판</th>
                <th style={{ ...styles.th, ...styles.titleColumn }}>제목</th>
                <th style={{ ...styles.th, ...styles.authorColumn }}>글쓴이</th>
                <th style={{ ...styles.th, ...styles.dateColumn }}>날짜</th>
                <th style={{ ...styles.th, ...styles.viewColumn }}>조회</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={styles.emptyCell}>아이디어를 불러오는 중입니다.</td>
                </tr>
              ) : filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={styles.emptyCell}>
                    {searchQuery ? "검색된 아이디어가 없습니다." : "등록된 아이디어가 없습니다."}
                  </td>
                </tr>
              ) : (
                filteredPosts.map((post) => (
                  <tr key={post.id} style={styles.tr}>
                    <td style={styles.td}>IDEA</td>
                    <td style={{ ...styles.td, ...styles.titleCell }}>
                      <button
                        type="button"
                        style={styles.titleButton}
                        onClick={() => router.push(`/ideas/${post.id}`)}
                      >
                        {post.title}
                      </button>
                      <span style={styles.badgeGroup}>
                        {post.attachmentCount > 0 && <span style={styles.fileBadge}>파일 {post.attachmentCount}</span>}
                        {post.commentCount > 0 && <span style={styles.commentBadge}>댓글 {post.commentCount}</span>}
                        {post.reactionCount > 0 && <span style={styles.reactionBadge}>공감 {post.reactionCount}</span>}
                      </span>
                    </td>
                    <td style={{ ...styles.td, ...styles.authorCell }}>
                      <span style={styles.authorName}>{post.authorName}</span>
                      {post.authorTeam && <span style={styles.authorTeam}>{post.authorTeam}</span>}
                    </td>
                    <td style={{ ...styles.td, ...styles.dateCell }}>{formatBoardDate(post.createdAt)}</td>
                    <td style={{ ...styles.td, ...styles.viewCell }}>{post.viewCount.toLocaleString("ko-KR")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={styles.bottomBar}>
          <button type="button" style={styles.primaryButton} onClick={() => router.push("/ideas/new")}>
            작성
          </button>
          <div style={styles.searchBox}>
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
              placeholder="제목, 내용, 글쓴이 검색"
              style={styles.searchInput}
            />
            <button type="button" style={styles.secondaryButton} onClick={submitSearch}>검색</button>
            {searchQuery && (
              <button type="button" style={styles.secondaryButton} onClick={resetSearch}>초기화</button>
            )}
          </div>
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
  boardCard: {
    border: "1px solid #d6dde8",
    borderRadius: "12px",
    background: "#ffffff",
    overflow: "hidden",
  },
  boardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "12px",
    padding: "18px 20px 14px",
    borderBottom: "1px solid #e5e7eb",
  },
  title: {
    margin: "0 0 6px",
    fontSize: "24px",
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
    borderRadius: "10px",
    background: "#ecfdf3",
    color: "#047857",
    padding: "11px 13px",
    margin: "14px 20px",
    fontSize: "13px",
    fontWeight: 800,
  },
  count: {
    color: "#475569",
    fontSize: "12px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    fontSize: "13px",
  },
  th: {
    height: "38px",
    borderBottom: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#1d4ed8",
    fontSize: "13px",
    fontWeight: 900,
    textAlign: "center",
    padding: "0 10px",
  },
  boardColumn: {
    width: "110px",
  },
  titleColumn: {
    width: "auto",
  },
  authorColumn: {
    width: "150px",
  },
  dateColumn: {
    width: "145px",
  },
  viewColumn: {
    width: "72px",
  },
  tr: {
    borderBottom: "1px solid #e5e7eb",
  },
  td: {
    height: "44px",
    padding: "0 12px",
    color: "#334155",
    fontSize: "13px",
    fontWeight: 700,
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  titleCell: {
    textAlign: "left",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  authorCell: {
    textAlign: "right",
  },
  dateCell: {
    textAlign: "right",
  },
  titleButton: {
    border: 0,
    background: "transparent",
    color: "#0f172a",
    padding: 0,
    maxWidth: "calc(100% - 78px)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "13px",
    fontWeight: 850,
    textAlign: "left",
    verticalAlign: "middle",
    cursor: "pointer",
  },
  fileBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "8px",
    borderRadius: "6px",
    background: "#eff6ff",
    color: "#2563eb",
    padding: "2px 6px",
    fontSize: "11px",
    fontWeight: 900,
    verticalAlign: "middle",
  },
  badgeGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    marginLeft: "8px",
    verticalAlign: "middle",
  },
  commentBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px",
    background: "#f1f5f9",
    color: "#475569",
    padding: "2px 6px",
    fontSize: "11px",
    fontWeight: 900,
  },
  reactionBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px",
    background: "#fff7ed",
    color: "#c2410c",
    padding: "2px 6px",
    fontSize: "11px",
    fontWeight: 900,
  },
  authorName: {
    display: "block",
    color: "#0f172a",
  },
  authorTeam: {
    display: "block",
    marginTop: "2px",
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 700,
  },
  viewCell: {
    color: "#475569",
    fontVariantNumeric: "tabular-nums",
  },
  emptyCell: {
    height: "110px",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 800,
    textAlign: "center",
  },
  bottomBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "14px 20px",
    background: "#ffffff",
    flexWrap: "wrap",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  searchInput: {
    width: "260px",
    minHeight: "38px",
    border: "1px solid #cbd5e1",
    borderRadius: "9px",
    padding: "0 12px",
    color: "#111827",
    fontSize: "13px",
    fontWeight: 700,
    outline: "none",
  },
  primaryButton: {
    minHeight: "38px",
    border: 0,
    borderRadius: "9px",
    background: "#0f8a56",
    color: "#ffffff",
    padding: "0 15px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: "38px",
    border: "1px solid #cbd5e1",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 12px",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },
};
