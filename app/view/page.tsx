"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Profile = {
  id: string;
  name: string | null;
  team: string | null;
  role: string | null;
};

type ItemRow = {
  id: string;
  worklog_id: string;
  type: "prev" | "today" | string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  company: string | null;
  equipment: string | null;
  task: string | null;
  note: string | null;
  created_at: string;
};

type Viewport = "mobile" | "tablet" | "desktop";

function toKSTDateString(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function hhmm(t: string | null) {
  if (!t) return "";
  return t.slice(0, 5);
}

function roleRank(role?: string | null) {
  const r = (role ?? "").toLowerCase();
  if (r === "lead") return 0;
  if (r === "admin") return 1;
  if (r === "user") return 2;
  return 9;
}

function isExecutive(team?: string | null) {
  const t = team ?? "";
  return t.includes("대표이사") || t.includes("고문");
}

function isAdminOrLeadOrExecutive(profile?: Profile | null) {
  if (!profile) return false;
  const role = (profile.role ?? "").toLowerCase();
  return role === "admin" || role === "lead" || isExecutive(profile.team);
}

function getViewport(): Viewport {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth <= 768) return "mobile";
  if (window.innerWidth <= 1080) return "tablet";
  return "desktop";
}

function detectRealMobile() {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent || "";
  const mobileUA =
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|webOS/i.test(ua);

  const smallScreen = window.matchMedia("(max-width: 820px)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hasTouch =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  return mobileUA || (smallScreen && coarsePointer && hasTouch);
}

export default function ViewPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [isMobile, setIsMobile] = useState(false);
  const [date, setDate] = useState(toKSTDateString());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [writtenUserIds, setWrittenUserIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [activeTeam, setActiveTeam] = useState<string>("ALL");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const [openUser, setOpenUser] = useState<Profile | null>(null);
  const [modalPrev, setModalPrev] = useState<ItemRow[]>([]);
  const [modalToday, setModalToday] = useState<ItemRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    const apply = () => {
      setViewport(getViewport());
      setIsMobile(detectRealMobile());
    };

    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  const showInputButton = useMemo(() => {
    if (!me) return false;
    if (isMobile) return false;
    return !isExecutive(me.team);
  }, [me, isMobile]);

  const personGridCols = useMemo(() => {
    if (viewport === "mobile") return "1fr";
    if (viewport === "tablet") return "repeat(2, minmax(0, 1fr))";
    return "repeat(3, minmax(0, 1fr))";
  }, [viewport]);

  const modalCols = useMemo(() => {
    return viewport === "mobile" ? "1fr" : "1fr 1fr";
  }, [viewport]);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    const { data: ures, error: uerr } = await supabase.auth.getUser();
    if (uerr || !ures.user) {
      location.href = "/login";
      return;
    }

    const { data: myProfile, error: myErr } = await supabase
      .from("profiles")
      .select("id,name,team,role")
      .eq("id", ures.user.id)
      .maybeSingle();

    if (myErr || !myProfile) {
      setMsg("내 프로필을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const meProfile = myProfile as Profile;
    setMe(meProfile);

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,team,role");

    if (error) {
      console.error("profiles load error:", error);
      setProfiles([]);
      setWrittenUserIds(new Set());
      setMsg(`[profiles load failed]\n${error.message}`);
      setLoading(false);
      return;
    }

    let next = (data ?? []) as Profile[];

    if (!isAdminOrLeadOrExecutive(meProfile)) {
      next = next.filter((p) => (p.team ?? "") === (meProfile.team ?? ""));
    }

    next = next.filter((p) => !isExecutive(p.team));

    next.sort((a, b) => {
      const ta = a.team ?? "";
      const tb = b.team ?? "";
      if (ta !== tb) return ta.localeCompare(tb, "ko");

      const ra = roleRank(a.role);
      const rb = roleRank(b.role);
      if (ra !== rb) return ra - rb;

      return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko");
    });

    setProfiles(next);

    const visibleUserIds = next.map((p) => p.id).filter(Boolean);

    if (visibleUserIds.length === 0) {
      setWrittenUserIds(new Set());
      setLoading(false);
      return;
    }

    const { data: worklogs, error: worklogErr } = await supabase
      .from("worklogs")
      .select("user_id")
      .eq("work_date", date)
      .in("user_id", visibleUserIds);

    if (worklogErr) {
      console.error("worklogs status load error:", worklogErr);
      setWrittenUserIds(new Set());
      setMsg(`[worklogs status load failed]\n${worklogErr.message}`);
      setLoading(false);
      return;
    }

    const writtenSet = new Set<string>(
      ((worklogs ?? []) as Array<{ user_id: string | null }>)
        .map((x) => x.user_id)
        .filter((v): v is string => Boolean(v))
    );

    setWrittenUserIds(writtenSet);
    setLoading(false);
  }, [supabase, date]);

  const applyDefaultExpandedByTeam = useCallback((team: string) => {
    if (team === "ALL") {
      setExpandedTeams(new Set());
    } else {
      setExpandedTeams(new Set([team]));
    }
  }, []);

  useEffect(() => {
    loadProfiles();
    applyDefaultExpandedByTeam("ALL");
  }, [loadProfiles, applyDefaultExpandedByTeam]);

  useEffect(() => {
    applyDefaultExpandedByTeam(activeTeam);
  }, [activeTeam, applyDefaultExpandedByTeam]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const p of profiles) {
      const t = (p.team ?? "").trim();
      if (t) set.add(t);
    }
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b, "ko"))];
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();

    return profiles.filter((p) => {
      const teamOk = activeTeam === "ALL" ? true : (p.team ?? "") === activeTeam;
      if (!teamOk) return false;
      if (!q) return true;

      const name = (p.name ?? "").toLowerCase();
      const team = (p.team ?? "").toLowerCase();
      const role = (p.role ?? "").toLowerCase();
      return name.includes(q) || team.includes(q) || role.includes(q);
    });
  }, [profiles, activeTeam, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Profile[]>();

    for (const p of filteredProfiles) {
      const team = (p.team ?? "미지정").trim() || "미지정";
      if (!map.has(team)) map.set(team, []);
      map.get(team)!.push(p);
    }

    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "ko")
    );
  }, [filteredProfiles]);

  const toggleTeam = (team: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  const openModal = useCallback(
    async (p: Profile) => {
      setOpenUser(p);
      setModalPrev([]);
      setModalToday([]);
      setModalLoading(true);

      try {
        const { data: w, error: werr } = await supabase
          .from("worklogs")
          .select("id")
          .eq("user_id", p.id)
          .eq("work_date", date)
          .maybeSingle();

        if (werr) {
          console.error("worklogs select error:", werr);
          setModalLoading(false);
          return;
        }

        if (!w?.id) {
          setModalLoading(false);
          return;
        }

        const { data: items, error: ierr } = await supabase
          .from("worklog_items")
          .select("*")
          .eq("worklog_id", w.id)
          .order("start_time", { ascending: true })
          .order("created_at", { ascending: true });

        if (ierr) {
          console.error("items load error:", ierr);
          setModalLoading(false);
          return;
        }

        const all = (items ?? []) as ItemRow[];
        setModalPrev(all.filter((x) => x.type === "prev"));
        setModalToday(all.filter((x) => x.type === "today"));
      } finally {
        setModalLoading(false);
      }
    },
    [supabase, date]
  );

  const closeModal = () => setOpenUser(null);

  const currentSummary = useMemo(() => {
    const teamCount = new Set(
      profiles.map((p) => (p.team ?? "").trim()).filter(Boolean)
    ).size;

    const writtenCount = profiles.filter((p) => writtenUserIds.has(p.id)).length;
    const missingCount = Math.max(profiles.length - writtenCount, 0);

    return `현재 로드: 팀 ${teamCount} / 인원 ${profiles.length} / 작성 ${writtenCount} / 미작성 ${missingCount}`;
  }, [profiles, writtenUserIds]);

  return (
    <div
      style={{
        maxWidth: 1060,
        margin: "0 auto",
        padding: viewport === "desktop" ? "26px 18px 64px" : "20px 14px 56px",
        fontFamily:
          "Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: viewport === "mobile" ? "stretch" : "flex-start",
          flexDirection: viewport === "mobile" ? "column" : "row",
          gap: 12,
        }}
      >
        <div>
          <div style={pageTitle}>업무일지 조회</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {showInputButton && (
            <a href="/" style={btnGhost}>
              입력
            </a>
          )}
          <a href="/change-password" style={btnGhost}>
            비밀번호 변경
          </a>
          <button
            style={btnGhost}
            onClick={async () => {
              await supabase.auth.signOut();
              location.href = "/login";
            }}
            type="button"
          >
            로그아웃
          </button>
        </div>
      </div>

      <div style={panel}>
        {viewport === "mobile" ? (
          <>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
                <div style={label}>날짜</div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{ ...input, flex: 1, minWidth: 0 }}
                  autoComplete="off"
                />
              </div>

              <button
                style={btnPrimaryCompact}
                onClick={loadProfiles}
                disabled={loading}
                type="button"
              >
                새로고침
              </button>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <div style={label}>검색</div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...input, width: "100%" }}
                autoComplete="off"
              />
            </div>
          </>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "190px 1fr 120px",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={label}>날짜</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={input}
                autoComplete="off"
              />
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={label}>검색</div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...input, width: "100%" }}
                autoComplete="off"
              />
            </div>

            <button
              style={btnPrimary}
              onClick={loadProfiles}
              disabled={loading}
              type="button"
            >
              새로고침
            </button>
          </div>
        )}

        <div style={summaryText}>{currentSummary}</div>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {teams.map((t) => {
            const active = activeTeam === t;
            return (
              <button
                key={t}
                onClick={() => setActiveTeam(t)}
                style={{
                  ...tabBtn,
                  ...(active ? tabBtnActive : {}),
                }}
                type="button"
              >
                {t === "ALL" ? "전체" : t}
              </button>
            );
          })}
        </div>

        {msg && (
          <div style={errBox}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg}</pre>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {grouped.length === 0 && (
          <div style={emptyPageText}>표시할 사람이 없습니다.</div>
        )}

        {grouped.map(([team, members]) => {
          const isOpen = expandedTeams.has(team);
          const writtenCount = members.filter((m) => writtenUserIds.has(m.id)).length;
          const missingCount = Math.max(members.length - writtenCount, 0);

          return (
            <div key={team} style={teamCard}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={teamTitle}>{team}</div>
                  <div style={countText}>{members.length}명</div>
                  <div style={teamSummaryText}>
                    작성 {writtenCount} · 미작성 {missingCount}
                  </div>
                </div>

                <button
                  style={btnGhostSmall}
                  onClick={() => toggleTeam(team)}
                  type="button"
                >
                  {isOpen ? "접기" : "펼치기"}
                </button>
              </div>

              {isOpen && (
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: personGridCols,
                      gap: 10,
                    }}
                  >
                    {members.map((p) => {
                      const isWritten = writtenUserIds.has(p.id);

                      return (
                        <button
                          key={p.id}
                          style={personCard}
                          onClick={() => openModal(p)}
                          title="클릭해서 상세 보기"
                          type="button"
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={personName}>{p.name ?? "(이름없음)"}</div>
                            <div style={personRole}>
                              {(p.role ?? "user").toLowerCase()}
                            </div>
                          </div>

                          <div style={isWritten ? writtenBadge : missingBadge}>
                            {isWritten ? "작성" : "미작성"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openUser && (
        <div style={modalOverlay} onMouseDown={closeModal}>
          <div style={modal} onMouseDown={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: viewport === "mobile" ? "flex-start" : "center",
                flexDirection: viewport === "mobile" ? "column" : "row",
                gap: 10,
              }}
            >
              <div>
                <div style={modalUserTitle}>
                  {openUser.name ?? "(이름없음)"} · {(openUser.team ?? "").trim()}
                </div>
                <div style={modalSubTitle}>{date} (전일/금일)</div>
              </div>
              <button style={btnGhostSmall} onClick={closeModal} type="button">
                닫기
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              {modalLoading ? (
                <div style={emptyPageText}>불러오는 중…</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: modalCols, gap: 12 }}>
                  <div style={modalBox}>
                    <div style={modalTitle}>전일 업무</div>
                    {modalPrev.length === 0 ? (
                      <div style={emptyText}>기록 없음</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {modalPrev.map((it) => (
                          <div key={it.id} style={itemRow}>
                            <div style={timeText}>
                              {hhmm(it.start_time)}~{hhmm(it.end_time)}
                            </div>
                            <div style={taskText}>{it.task ?? ""}</div>
                            <div style={subText}>
                              {[it.location, it.company, it.equipment]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            {it.note ? <div style={subText}>{it.note}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={modalBox}>
                    <div style={modalTitle}>금일 업무</div>
                    {modalToday.length === 0 ? (
                      <div style={emptyText}>기록 없음</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {modalToday.map((it) => (
                          <div key={it.id} style={itemRow}>
                            <div style={timeText}>
                              {hhmm(it.start_time)}~{hhmm(it.end_time)}
                            </div>
                            <div style={taskText}>{it.task ?? ""}</div>
                            <div style={subText}>
                              {[it.location, it.company, it.equipment]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            {it.note ? <div style={subText}>{it.note}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const pageTitle: React.CSSProperties = {
  fontSize: 31,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  color: "#111827",
};

const teamTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "#111827",
};

const teamSummaryText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 700,
};

const personName: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: "#111827",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const personRole: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 600,
};

const countText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 600,
};

const summaryText: React.CSSProperties = {
  marginTop: 10,
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 600,
};

const emptyPageText: React.CSSProperties = {
  color: "#6b7280",
  padding: 12,
  fontSize: 14,
  fontWeight: 500,
};

const modalUserTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "#111827",
};

const modalSubTitle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 600,
  marginTop: 3,
};

const taskText: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  color: "#111827",
};

const panel: React.CSSProperties = {
  marginTop: 18,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const teamCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  minWidth: 34,
  fontWeight: 700,
};

const input: React.CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  padding: "0 11px",
  fontSize: 14,
  fontWeight: 500,
  color: "#111827",
  outline: "none",
  background: "#fff",
};

const btnPrimary: React.CSSProperties = {
  height: 40,
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};

const btnPrimaryCompact: React.CSSProperties = {
  height: 40,
  minWidth: 96,
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  padding: "0 14px",
  whiteSpace: "nowrap",
};

const btnGhost: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  color: "#111827",
};

const btnGhostSmall: React.CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const tabBtn: React.CSSProperties = {
  height: 36,
  padding: "0 15px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  color: "#111827",
};

const tabBtnActive: React.CSSProperties = {
  background: "#111827",
  color: "#fff",
  border: "1px solid #111827",
};

const personCard: React.CSSProperties = {
  textAlign: "left",
  padding: 13,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const writtenBadge: React.CSSProperties = {
  flexShrink: 0,
  minWidth: 56,
  height: 30,
  borderRadius: 999,
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 800,
  color: "#166534",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
};

const missingBadge: React.CSSProperties = {
  flexShrink: 0,
  minWidth: 56,
  height: 30,
  borderRadius: 999,
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 800,
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fecaca",
};

const errBox: React.CSSProperties = {
  marginTop: 12,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 12,
  padding: 12,
  fontSize: 12,
  fontWeight: 600,
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const modal: React.CSSProperties = {
  width: "min(980px, 100%)",
  maxHeight: "85vh",
  overflow: "auto",
  background: "#fff",
  borderRadius: 18,
  border: "1px solid #e5e7eb",
  padding: 16,
  boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
};

const modalBox: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  background: "#fff",
};

const modalTitle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 17,
  marginBottom: 10,
  color: "#111827",
};

const emptyText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 0",
};

const itemRow: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
};

const timeText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: 4,
};

const subText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#6b7280",
  marginTop: 4,
};