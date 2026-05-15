"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Profile = {
  id: string;
  name: string | null;
  team: string | null;
  role: string | null;
};

type ItemRowDB = {
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

type TimeParts = {
  hh: string;
  mm: string;
};

type Row = {
  rid: string;
  start: TimeParts;
  end: TimeParts;
  location: string;
  company: string;
  equipment: string;
  task: string;
  note: string;
};

type Viewport = "mobile" | "tablet" | "desktop";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0")
);

const MIN_OPTIONS = ["00", "10", "20", "30", "40", "50"];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toKSTDateString(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return toKSTDateString(dt);
}

function hhmmFromDB(t: string | null): TimeParts {
  if (!t) return { hh: "", mm: "" };
  return {
    hh: t.slice(0, 2),
    mm: t.slice(3, 5),
  };
}

function toDBTime(t: TimeParts) {
  if (!t.hh || !t.mm) return null;
  return `${t.hh}:${t.mm}:00`;
}

function makeBlankRow(): Row {
  return {
    rid: uid(),
    start: { hh: "", mm: "" },
    end: { hh: "", mm: "" },
    location: "",
    company: "",
    equipment: "",
    task: "",
    note: "",
  };
}

function isRowEmpty(r: Row) {
  return !(
    r.start.hh ||
    r.start.mm ||
    r.end.hh ||
    r.end.mm ||
    r.location ||
    r.company ||
    r.equipment ||
    r.task ||
    r.note
  );
}

function mapDBToRow(x: ItemRowDB): Row {
  return {
    rid: uid(),
    start: hhmmFromDB(x.start_time),
    end: hhmmFromDB(x.end_time),
    location: x.location ?? "",
    company: x.company ?? "",
    equipment: x.equipment ?? "",
    task: x.task ?? "",
    note: x.note ?? "",
  };
}

function isExecutive(team?: string | null) {
  const t = team ?? "";
  return t.includes("대표이사") || t.includes("고문");
}

function getViewport(): Viewport {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth <= 768) return "mobile";
  if (window.innerWidth <= 1080) return "tablet";
  return "desktop";
}

function TimeSelect({
  value,
  onChange,
}: {
  value: TimeParts;
  onChange: (v: TimeParts) => void;
}) {
  return (
    <div style={timeBox}>
      <select
        value={value.hh}
        onChange={(e) => onChange({ ...value, hh: e.target.value })}
        style={timeSelect}
      >
        <option value=""></option>
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>

      <span style={colon}>:</span>

      <select
        value={value.mm}
        onChange={(e) => onChange({ ...value, mm: e.target.value })}
        style={timeSelect}
      >
        <option value=""></option>
        {MIN_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section(props: {
  title: string;
  rows: Row[];
  onAdd: () => void;
  onDel: (rid: string) => void;
  onUpdate: (rid: string, patch: Partial<Row>) => void;
}) {
  const { title, rows, onAdd, onDel, onUpdate } = props;

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={sectionTitle}>{title}</div>
        <button style={btnGhostSmall} onClick={onAdd} type="button">
          + 행 추가 (최대 10)
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={tableHeader}>
          <div>시간(시작)</div>
          <div>시간(끝)</div>
          <div>장소</div>
          <div>업체</div>
          <div>장비</div>
          <div style={{ textAlign: "left" }}>주요업무</div>
          <div>비고</div>
          <div></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.rid} style={tableRow}>
              <TimeSelect
                value={r.start}
                onChange={(v) => onUpdate(r.rid, { start: v })}
              />
              <TimeSelect
                value={r.end}
                onChange={(v) => onUpdate(r.rid, { end: v })}
              />

              <input
                value={r.location}
                onChange={(e) => onUpdate(r.rid, { location: e.target.value })}
                style={{ ...input, width: 90 }}
                autoComplete="off"
              />

              <input
                value={r.company}
                onChange={(e) => onUpdate(r.rid, { company: e.target.value })}
                style={{ ...input, width: 150 }}
                autoComplete="off"
              />

              <input
                value={r.equipment}
                onChange={(e) => onUpdate(r.rid, { equipment: e.target.value })}
                style={{ ...input, width: 120 }}
                autoComplete="off"
              />

              <input
                value={r.task}
                onChange={(e) => onUpdate(r.rid, { task: e.target.value })}
                style={{ ...input, width: "100%" }}
                autoComplete="off"
              />

              <input
                value={r.note}
                onChange={(e) => onUpdate(r.rid, { note: e.target.value })}
                style={{ ...input, width: 170 }}
                autoComplete="off"
              />

              <button
                style={btnDangerSmall}
                onClick={() => onDel(r.rid)}
                type="button"
              >
                -
              </button>
            </div>
          ))}
        </div>

        <div style={helpText}>
          빈 행은 저장에서 제외 / 시간은 수동 선택 / 분은 10분 단위
        </div>
      </div>
    </div>
  );
}

export default function InputPageClient() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [date, setDate] = useState(toKSTDateString());
  const [profile, setProfile] = useState<Profile | null>(null);

  const [msg, setMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);

  const [prevRows, setPrevRows] = useState<Row[]>([
    makeBlankRow(),
    makeBlankRow(),
    makeBlankRow(),
  ]);

  const [todayRows, setTodayRows] = useState<Row[]>([
    makeBlankRow(),
    makeBlankRow(),
    makeBlankRow(),
  ]);

  useEffect(() => {
    const apply = () => setViewport(getViewport());

    apply();

    window.addEventListener("resize", apply);

    return () =>
      window.removeEventListener("resize", apply);
  }, []);

  const ensureProfile = useCallback(async () => {
    const { data: ures, error: uerr } =
      await supabase.auth.getUser();

    if (uerr || !ures.user) {
      location.href = "/login";
      return null;
    }

    const userId = ures.user.id;

    const { data: p, error: perr } =
      await supabase
        .from("profiles")
        .select("id,name,team,role")
        .eq("id", userId)
        .maybeSingle();

    if (perr) {
      setMsg({
        type: "err",
        text: `profiles load failed\n${perr.message}`,
      });

      return null;
    }

    const prof: Profile = p
      ? (p as Profile)
      : {
          id: userId,
          name: null,
          team: null,
          role: null,
        };

    setProfile(prof);

    if (isExecutive(prof.team)) {
      location.href = "/view";
      return null;
    }

    return prof;
  }, [supabase]);

  const getOrCreateWorklogId = useCallback(
    async (userId: string, workDate: string) => {
      const { data: w } = await supabase
        .from("worklogs")
        .select("id")
        .eq("user_id", userId)
        .eq("work_date", workDate)
        .maybeSingle();

      if (w?.id) return w.id as string;

      const { data: ins, error: ierr } =
        await supabase
          .from("worklogs")
          .insert({
            user_id: userId,
            work_date: workDate,
          })
          .select("id")
          .single();

      if (ierr)
        throw new Error(ierr.message);

      return ins.id as string;
    },
    [supabase]
  );

  const padTo3 = (arr: Row[]) => {
    const out = [...arr];

    while (out.length < 3)
      out.push(makeBlankRow());

    return out.slice(0, 10);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    const prof = await ensureProfile();

    if (!prof) {
      setLoading(false);
      return;
    }

    try {
      const { data: w } = await supabase
        .from("worklogs")
        .select("id")
        .eq("user_id", prof.id)
        .eq("work_date", date)
        .maybeSingle();

      let items: ItemRowDB[] = [];

      if (w?.id) {
        const { data: it } =
          await supabase
            .from("worklog_items")
            .select("*")
            .eq("worklog_id", w.id)
            .order("start_time", {
              ascending: true,
            });

        items = (it ?? []) as ItemRowDB[];
      }

      const prevDB = items.filter(
        (x) => x.type === "prev"
      );

      const todayDB = items.filter(
        (x) => x.type === "today"
      );

      let prevRowsNext =
        prevDB.length > 0
          ? prevDB.map(mapDBToRow)
          : [];

      if (prevRowsNext.length === 0) {
        const previousDate = addDays(date, -1);

        const { data: previousWorklog } =
          await supabase
            .from("worklogs")
            .select("id")
            .eq("user_id", prof.id)
            .eq("work_date", previousDate)
            .maybeSingle();

        if (previousWorklog?.id) {
          const { data: previousItems } =
            await supabase
              .from("worklog_items")
              .select("*")
              .eq(
                "worklog_id",
                previousWorklog.id
              )
              .eq("type", "today")
              .order("start_time", {
                ascending: true,
              });

          prevRowsNext =
            previousItems &&
            previousItems.length > 0
              ? (previousItems as ItemRowDB[]).map(mapDBToRow)
              : [];
        }
      }

      const todayRowsNext =
        todayDB.length > 0
          ? todayDB.map(mapDBToRow)
          : [];

      setPrevRows(padTo3(prevRowsNext));
      setTodayRows(padTo3(todayRowsNext));
    } catch (e: unknown) {
      setMsg({
        type: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [ensureProfile, supabase, date]);

  useEffect(() => {
    load();
  }, [load]);

  const updateRow = useCallback(
    (
      section: "prev" | "today",
      rid: string,
      patch: Partial<Row>
    ) => {
      const setter =
        section === "prev"
          ? setPrevRows
          : setTodayRows;

      setter((prev) => {
        const idx = prev.findIndex(
          (r) => r.rid === rid
        );

        if (idx < 0) return prev;

        const out = prev.map((r) => ({
          ...r,
        }));

        out[idx] = {
          ...out[idx],
          ...patch,
        };

        return out;
      });
    },
    []
  );

  const addRow = (
    section: "prev" | "today"
  ) => {
    const setter =
      section === "prev"
        ? setPrevRows
        : setTodayRows;

    setter((prev) => {
      if (prev.length >= 10)
        return prev;

      return [...prev, makeBlankRow()];
    });
  };

  const delRow = (
    section: "prev" | "today",
    rid: string
  ) => {
    const setter =
      section === "prev"
        ? setPrevRows
        : setTodayRows;

    setter((prev) => {
      const out = prev.filter(
        (r) => r.rid !== rid
      );

      while (out.length < 3)
        out.push(makeBlankRow());

      return out;
    });
  };

  const normalizeRowsForSave = (
    rows: Row[],
    type: "prev" | "today"
  ) => {
    const usable = rows.filter(
      (r) => !isRowEmpty(r)
    );

    return usable.map((r) => ({
      type,
      start_time: toDBTime(r.start),
      end_time: toDBTime(r.end),
      location: r.location || null,
      company: r.company || null,
      equipment:
        r.equipment || null,
      task: r.task || null,
      note: r.note || null,
    }));
  };

  const save = useCallback(async () => {
    if (!profile?.id) return;

    setLoading(true);
    setMsg(null);

    try {
      const worklogId =
        await getOrCreateWorklogId(
          profile.id,
          date
        );

      const toInsert = [
        ...normalizeRowsForSave(
          prevRows,
          "prev"
        ),
        ...normalizeRowsForSave(
          todayRows,
          "today"
        ),
      ].map((x) => ({
        ...x,
        worklog_id: worklogId,
      }));

      await supabase
        .from("worklog_items")
        .delete()
        .eq(
          "worklog_id",
          worklogId
        );

      if (toInsert.length > 0) {
        await supabase
          .from("worklog_items")
          .insert(toInsert);
      }

      setMsg({
        type: "ok",
        text: "저장 완료",
      });
    } catch (e: unknown) {
      setMsg({
        type: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [
    profile?.id,
    getOrCreateWorklogId,
    date,
    prevRows,
    todayRows,
    supabase,
  ]);

  const headerRight = useMemo(() => {
    const name = profile?.name ?? "";
    const team = profile?.team ?? "";
    const role = profile?.role ?? "";

    return [name, team, role]
      .filter(Boolean)
      .join(" · ");
  }, [profile]);

  return (
    <div
      style={{
        maxWidth:
          viewport === "tablet"
            ? 1080
            : 1200,
        margin: "0 auto",
        padding:
          viewport === "desktop"
            ? "26px 18px 64px"
            : "20px 14px 56px",
        fontFamily:
          "Pretendard, sans-serif",
      }}
    >
      <div style={panel}>
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            gap: 12,
            alignItems:
              viewport === "mobile"
                ? "stretch"
                : "center",
            flexWrap: "wrap",
            flexDirection:
              viewport === "mobile"
                ? "column"
                : "row",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div style={label}>
              날짜
            </div>

            <input
              type="date"
              value={date}
              onChange={(e) =>
                setDate(
                  e.target.value
                )
              }
              style={input}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={profileText}>
              {headerRight}
            </div>

            <button
              style={btnGhostSmall}
              onClick={load}
              disabled={loading}
              type="button"
            >
              새로고침
            </button>

            <button
              style={btnPrimary}
              onClick={save}
              disabled={loading}
              type="button"
            >
              저장
            </button>
          </div>
        </div>

        {msg && (
          <div
            style={
              msg.type === "err"
                ? errBox
                : okBox
            }
          >
            <pre
              style={{
                margin: 0,
                whiteSpace:
                  "pre-wrap",
              }}
            >
              {msg.text}
            </pre>
          </div>
        )}
      </div>

      <Section
        title="전일 업무"
        rows={prevRows}
        onAdd={() =>
          addRow("prev")
        }
        onDel={(rid) =>
          delRow("prev", rid)
        }
        onUpdate={(rid, patch) =>
          updateRow(
            "prev",
            rid,
            patch
          )
        }
      />

      <Section
        title="금일 업무"
        rows={todayRows}
        onAdd={() =>
          addRow("today")
        }
        onDel={(rid) =>
          delRow("today", rid)
        }
        onUpdate={(rid, patch) =>
          updateRow(
            "today",
            rid,
            patch
          )
        }
      />
    </div>
  );
}

const pageTitle: React.CSSProperties =
  {
    fontSize: 31,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
    color: "#111827",
  };


const sectionTitle: React.CSSProperties =
  {
    fontSize: 18,
    fontWeight: 800,
    color: "#111827",
  };

const profileText: React.CSSProperties =
  {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: 600,
  };

const panel: React.CSSProperties =
  {
    marginTop: 18,
    background: "#fff",
    border:
      "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
  };

const card: React.CSSProperties =
  {
    background: "#fff",
    border:
      "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
  };

const label: React.CSSProperties =
  {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: 700,
  };

const input: React.CSSProperties =
  {
    height: 40,
    borderRadius: 10,
    border:
      "1px solid #d1d5db",
    padding: "0 11px",
    fontSize: 14,
  };

const btnPrimary: React.CSSProperties =
  {
    height: 40,
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    fontWeight: 800,
    padding: "0 14px",
    cursor: "pointer",
  };

const btnGhost: React.CSSProperties =
  {
    height: 38,
    padding: "0 12px",
    borderRadius: 12,
    border:
      "1px solid #d1d5db",
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

const btnGhostSmall: React.CSSProperties =
  {
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border:
      "1px solid #d1d5db",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

const btnDangerSmall: React.CSSProperties =
  {
    height: 34,
    width: 38,
    borderRadius: 10,
    border:
      "1px solid #d1d5db",
    background: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  };

const okBox: React.CSSProperties =
  {
    marginTop: 12,
    background: "#ecfdf5",
    border:
      "1px solid #a7f3d0",
    color: "#065f46",
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
  };

const errBox: React.CSSProperties =
  {
    marginTop: 12,
    background: "#fef2f2",
    border:
      "1px solid #fecaca",
    color: "#b91c1c",
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
  };

const tableHeader: React.CSSProperties =
  {
    display: "grid",
    gridTemplateColumns:
      "140px 140px 90px 150px 120px 1fr 170px 38px",
    gap: 10,
    padding: "10px 8px",
    background: "#f9fafb",
    borderRadius: 12,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: 700,
  };

const tableRow: React.CSSProperties =
  {
    display: "grid",
    gridTemplateColumns:
      "140px 140px 90px 150px 120px 1fr 170px 38px",
    gap: 10,
    alignItems: "center",
  };

const timeBox: React.CSSProperties =
  {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: 140,
  };

const timeSelect: React.CSSProperties =
  {
    height: 40,
    borderRadius: 10,
    border:
      "1px solid #d1d5db",
    padding: "0 8px",
    fontSize: 14,
    background: "#fff",
  };

const colon: React.CSSProperties =
  {
    fontWeight: 800,
    fontSize: 16,
    color: "#374151",
  };

const helpText: React.CSSProperties =
  {
    marginTop: 10,
    color: "#6b7280",
    fontSize: 12,
  };


