"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

type ScheduleItem = {
  id: number;

  date: string;

  time: string;

  type: string;

  company: string;

  title: string;

  writer?: string;

  team?: string;

  trip_id?: string;
};

const supabase =
  createSupabaseBrowser();

const TYPE_STYLE: any = {
  출장: {
    background: "#dbeafe",
    color: "#2563eb",
  },

  외근: {
    background: "#dcfce7",
    color: "#16a34a",
  },

  회의: {
    background: "#fef3c7",
    color: "#d97706",
  },

  연차: {
    background: "#fee2e2",
    color: "#dc2626",
  },

  기타: {
    background: "#e5e7eb",
    color: "#6b7280",
  },
};

export default function SchedulePage() {
  const router = useRouter();

  const today = new Date();

  const [loading, setLoading] =
    useState(true);

  const [schedules, setSchedules] =
    useState<ScheduleItem[]>([]);

  const [currentDate, setCurrentDate] =
    useState(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )
    );

  const [selectedDate, setSelectedDate] =
    useState("");

  const [modalOpen, setModalOpen] =
    useState(false);

  const [time, setTime] = useState("");

  const [company, setCompany] =
    useState("");

  const [title, setTitle] =
    useState("");

  const [type, setType] =
    useState("외근");

  const [startDate, setStartDate] =
    useState("");

  const [endDate, setEndDate] =
    useState("");

  const currentUser =
    typeof window !== "undefined"
      ? localStorage.getItem(
          "name"
        ) || ""
      : "";

  const currentTeam =
    typeof window !== "undefined"
      ? localStorage.getItem(
          "team"
        ) || ""
      : "";

  const year = currentDate.getFullYear();

  const month = currentDate.getMonth();

  const monthLabel = `${year}년 ${
    month + 1
  }월`;

  const firstDay = new Date(
    year,
    month,
    1
  ).getDay();

  const lastDate = new Date(
    year,
    month + 1,
    0
  ).getDate();

  useEffect(() => {
    fetchSchedules();
  }, []);

  async function fetchSchedules() {
    setLoading(true);

    const { data, error } =
      await supabase
        .from("schedules")
        .select("*")
        .order("date", {
          ascending: true,
        });

    if (!error && data) {
      setSchedules(data);
    }

    setLoading(false);
  }

  const days = useMemo(() => {
    const result = [];

    for (let i = 0; i < firstDay; i++) {
      result.push(null);
    }

    for (
      let day = 1;
      day <= lastDate;
      day++
    ) {
      result.push(day);
    }

    return result;
  }, [firstDay, lastDate]);

  function formatDate(day: number) {
    return `${year}-${String(
      month + 1
    ).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
  }

  function moveMonth(diff: number) {
    setCurrentDate(
      new Date(year, month + diff, 1)
    );
  }

  function openDate(day: number) {
    const fullDate =
      formatDate(day);

    setSelectedDate(fullDate);

    setStartDate(fullDate);

    setEndDate(fullDate);

    setModalOpen(true);
  }

  function getDateRange(
    start: string,
    end: string
  ) {
    const result = [];

    const current =
      new Date(start);

    const last =
      new Date(end);

    while (current <= last) {
      result.push(
        current
          .toISOString()
          .split("T")[0]
      );

      current.setDate(
        current.getDate() + 1
      );
    }

    return result;
  }

  async function addSchedule() {
    if (!title.trim()) {
      alert("일정 내용을 입력하세요.");
      return;
    }

    const writer =
      localStorage.getItem("name") ||
      "";

    const team =
      localStorage.getItem("team") ||
      "";

    let insertDates = [selectedDate];

    let tripId: string | null =
      null;

    if (type === "출장") {
      insertDates =
        getDateRange(
          startDate,
          endDate
        );

      tripId = `trip_${Date.now()}`;
    }

    const rows = insertDates.map(
      (date) => ({
        date,
        time,
        type,
        company,
        title,
        writer,
        team,
        trip_id: tripId,
      })
    );

    const { error } =
      await supabase
        .from("schedules")
        .insert(rows);

    if (error) {
      alert(
        "일정 저장 실패"
      );

      return;
    }

    setTime("");
    setCompany("");
    setTitle("");
    setType("외근");

    await fetchSchedules();
  }

  async function deleteSchedule(
    item: ScheduleItem
  ) {
    if (
      item.writer !== currentUser
    ) {
      alert(
        "본인 일정만 삭제할 수 있습니다."
      );

      return;
    }

    if (
      item.type === "출장" &&
      item.trip_id
    ) {
      const allDelete =
        confirm(
          "확인 버튼: 출장 전체 삭제\n취소 버튼: 해당 일정만 삭제"
        );

      if (allDelete) {
        const { error } =
          await supabase
            .from("schedules")
            .delete()
            .eq(
              "trip_id",
              item.trip_id
            );

        if (error) {
          alert(
            "삭제 실패"
          );

          return;
        }

        await fetchSchedules();

        return;
      }
    }

    const ok = confirm(
      "해당 일정만 삭제하시겠습니까?"
    );

    if (!ok) return;

    const { error } =
      await supabase
        .from("schedules")
        .delete()
        .eq("id", item.id);

    if (error) {
      alert(
        "삭제 실패"
      );

      return;
    }

    await fetchSchedules();
  }

  const selectedSchedules =
    schedules
      .filter(
        (v) => v.date === selectedDate
      )
      .sort((a, b) =>
        a.time.localeCompare(b.time)
      );

  return (
    <>
      <div style={styles.page}>
        <div style={styles.header}>
          <div style={styles.left}>
            <div>
              <div style={styles.title}>
                일정관리
              </div>

            </div>
          </div>

          <div style={styles.center}>
            <button
              style={styles.monthButton}
              onClick={() =>
                moveMonth(-1)
              }
            >
              ‹
            </button>

            <div
              style={styles.monthText}
            >
              {monthLabel}
            </div>

            <button
              style={styles.monthButton}
              onClick={() =>
                moveMonth(1)
              }
            >
              ›
            </button>
          </div>

          <div style={styles.right}>
            <div style={styles.userInfo}>
              {currentTeam} /{" "}
              {currentUser}
            </div>

            <button
              style={styles.topButton}
              onClick={() =>
                router.push("/main")
              }
            >
              메인
            </button>

            <button
              style={styles.logoutButton}
              onClick={async () => {
                await supabase.auth.signOut();

                localStorage.removeItem(
                  "role"
                );

                localStorage.removeItem(
                  "team"
                );

                localStorage.removeItem(
                  "name"
                );

                router.push("/login");
              }}
            >
              로그아웃
            </button>
          </div>
        </div>

        <div style={styles.weekRow}>
          <div style={styles.sunday}>
            일
          </div>

          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>

          <div style={styles.saturday}>
            토
          </div>
        </div>

        <div style={styles.calendarGrid}>
          {days.map((day, index) => {
            if (!day) {
              return (
                <div
                  key={index}
                  style={
                    styles.emptyDay
                  }
                />
              );
            }

            const fullDate =
              formatDate(day);

            const isToday =
              fullDate ===
              `${today.getFullYear()}-${String(
                today.getMonth() +
                  1
              ).padStart(
                2,
                "0"
              )}-${String(
                today.getDate()
              ).padStart(
                2,
                "0"
              )}`;

            const events =
              schedules.filter(
                (v) =>
                  v.date ===
                  fullDate
              );

            return (
              <div
                key={day}
                style={styles.day}
                onClick={() =>
                  openDate(day)
                }
              >
                <div
                  style={styles.date(
                    isToday
                  )}
                >
                  {day}
                </div>

                <div
                  style={
                    styles.eventWrap
                  }
                >
                  {events
                    .slice(0, 3)
                    .map((event) => (
                      <div
                        key={event.id}
                        style={styles.event(
                          event.type
                        )}
                      >
                        {event.writer ||
                          "이름없음"}
                      </div>
                    ))}

                  {events.length >
                    3 && (
                    <div
                      style={
                        styles.moreEvent
                      }
                    >
                      +
                      {events.length -
                        3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && (
        <div
          style={styles.overlay}
          onClick={() =>
            setModalOpen(false)
          }
        >
          <div
            style={styles.modal}
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div style={styles.modalHeader}>
              <div>
                <div
                  style={
                    styles.modalTitle
                  }
                >
                  {selectedDate}
                </div>

                <div
                  style={
                    styles.modalSub
                  }
                >
                  일정 관리
                </div>
              </div>

              <button
                style={
                  styles.closeButton
                }
                onClick={() =>
                  setModalOpen(false)
                }
              >
                닫기
              </button>
            </div>

            <div style={styles.section}>
              <div
                style={
                  styles.sectionTitle
                }
              >
                등록된 일정
              </div>

              {selectedSchedules.length ===
              0 ? (
                <div
                  style={
                    styles.empty
                  }
                >
                  등록된 일정 없음
                </div>
              ) : (
                <div
                  style={
                    styles.scheduleList
                  }
                >
                  {selectedSchedules.map(
                    (item) => (
                      <div
                        key={item.id}
                        style={
                          styles.scheduleRow
                        }
                      >
                        <div
                          style={
                            styles.time
                          }
                        >
                          {
                            item.time ||
                            "-"
                          }
                        </div>

                        <div
                          style={
                            styles.content
                          }
                        >
                          <div
                            style={
                              styles.company
                            }
                          >
                            {item.writer ||
                              "-"}
                          </div>

                          <div
                            style={
                              styles.taskMeta
                            }
                          >
                            {item.company ||
                              "-"}
                          </div>

                          <div
                            style={
                              styles.task
                            }
                          >
                            {
                              item.title
                            }
                          </div>
                        </div>

                        <div
                          style={
                            styles.rowRight
                          }
                        >
                          <div
                            style={styles.type(
                              item.type
                            )}
                          >
                            {
                              item.type
                            }
                          </div>

                          {item.writer ===
                            currentUser && (
                            <button
                              style={
                                styles.deleteButton
                              }
                              onClick={() =>
                                deleteSchedule(
                                  item
                                )
                              }
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div style={styles.section}>
              <div
                style={
                  styles.sectionTitle
                }
              >
                일정 추가
              </div>

              <div
                style={
                  styles.inputGrid
                }
              >
                <input
                  value={time}
                  onChange={(e) =>
                    setTime(
                      e.target.value
                    )
                  }
                  placeholder="시간"
                  style={
                    styles.input
                  }
                />

                <select
                  value={type}
                  onChange={(e) =>
                    setType(
                      e.target.value
                    )
                  }
                  style={
                    styles.input
                  }
                >
                  <option>
                    출장
                  </option>

                  <option>
                    외근
                  </option>

                  <option>
                    회의
                  </option>

                  <option>
                    연차
                  </option>

                  <option>
                    기타
                  </option>
                </select>

                {type === "출장" && (
                  <>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) =>
                        setStartDate(
                          e.target.value
                        )
                      }
                      style={
                        styles.input
                      }
                    />

                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) =>
                        setEndDate(
                          e.target.value
                        )
                      }
                      style={
                        styles.input
                      }
                    />
                  </>
                )}

                <input
                  value={company}
                  onChange={(e) =>
                    setCompany(
                      e.target.value
                    )
                  }
                  placeholder="업체명"
                  style={
                    styles.input
                  }
                />

                <input
                  value={title}
                  onChange={(e) =>
                    setTitle(
                      e.target.value
                    )
                  }
                  placeholder="일정 내용"
                  style={
                    styles.input
                  }
                />
              </div>

              <button
                style={
                  styles.saveButton
                }
                onClick={addSchedule}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: any = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    padding: "12px",
    fontFamily:
      "Pretendard, sans-serif",
  },

  header: {
    display: "grid",
    gridTemplateColumns:
      "1fr auto 1fr",
    alignItems: "center",
    marginBottom: "12px",
  },

  left: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  center: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    justifyContent: "center",
  },

  right: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "8px",
  },

  userInfo: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#64748b",
    marginRight: "4px",
  },

  topButton: {
    height: "38px",
    padding: "0 14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },

  logoutButton: {
    height: "38px",
    padding: "0 14px",
    borderRadius: "10px",
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },

  loading: {
    fontSize: "12px",
    color: "#64748b",
  },

  title: {
    fontSize: "28px",
    fontWeight: 800,
    color: "#111827",
    lineHeight: 1,
  },

  subTitle: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#6b7280",
  },

  monthButton: {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    border:
      "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontSize: "18px",
  },

  monthText: {
    fontSize: "20px",
    fontWeight: 800,
    color: "#111827",
    minWidth: "140px",
    textAlign: "center",
  },

  weekRow: {
    display: "grid",
    gridTemplateColumns:
      "repeat(7,1fr)",
    marginBottom: "6px",
    textAlign: "center",
    fontSize: "12px",
    fontWeight: 700,
    color: "#64748b",
  },

  sunday: {
    color: "#dc2626",
  },

  saturday: {
    color: "#2563eb",
  },

  calendarGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(7,1fr)",
    gap: "6px",
    height: "calc(100vh - 120px)",
  },

  emptyDay: {
    background: "transparent",
  },

  day: {
    background: "#fff",
    border:
      "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "8px",
    cursor: "pointer",
    overflow: "hidden",
  },

  date: (today: boolean) => ({
    width: "24px",
    height: "24px",
    borderRadius: "999px",
    background: today
      ? "#111827"
      : "transparent",
    color: today
      ? "#fff"
      : "#111827",
    fontSize: "12px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "8px",
  }),

  eventWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
  },

  event: (type: string) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    maxWidth: "100%",
    fontSize: "10px",
    fontWeight: 700,
    borderRadius: "999px",
    padding: "4px 8px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",

    background:
      TYPE_STYLE[type]
        ?.background ||
      "#e5e7eb",

    color:
      TYPE_STYLE[type]
        ?.color ||
      "#6b7280",
  }),

  moreEvent: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: 700,
    color: "#64748b",
    background: "#f1f5f9",
    borderRadius: "999px",
    padding: "4px 8px",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background:
      "rgba(15,23,42,0.45)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    padding: "20px",
  },

  modal: {
    width: "100%",
    maxWidth: "760px",
    background: "#fff",
    borderRadius: "16px",
    border:
      "1px solid #dbe2ea",
    padding: "18px",
    maxHeight: "90vh",
    overflowY: "auto",
  },

  modalHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    marginBottom: "18px",
  },

  modalTitle: {
    fontSize: "18px",
    fontWeight: 800,
  },

  modalSub: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#64748b",
  },

  closeButton: {
    height: "34px",
    padding: "0 12px",
    borderRadius: "10px",
    border:
      "1px solid #d1d5db",
    background: "#fff",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },

  section: {
    marginBottom: "20px",
  },

  sectionTitle: {
    fontSize: "14px",
    fontWeight: 800,
    marginBottom: "10px",
    color: "#111827",
  },

  empty: {
    border:
      "1px dashed #cbd5e1",
    borderRadius: "10px",
    padding: "18px",
    textAlign: "center",
    fontSize: "12px",
    color: "#64748b",
  },

  scheduleList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  scheduleRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    border:
      "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "10px 12px",
  },

  time: {
    width: "54px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#111827",
  },

  content: {
    flex: 1,
  },

  company: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#111827",
    marginBottom: "2px",
  },

  taskMeta: {
    fontSize: "11px",
    color: "#94a3b8",
    marginBottom: "2px",
  },

  task: {
    fontSize: "12px",
    color: "#64748b",
  },

  rowRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "6px",
  },

  type: (type: string) => ({
    fontSize: "11px",
    fontWeight: 700,
    padding: "5px 8px",
    borderRadius: "999px",

    background:
      TYPE_STYLE[type]
        ?.background ||
      "#e5e7eb",

    color:
      TYPE_STYLE[type]
        ?.color ||
      "#6b7280",
  }),

  deleteButton: {
    border: "none",
    background: "transparent",
    color: "#dc2626",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  },

  inputGrid: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: "10px",
    marginBottom: "12px",
  },

  input: {
    height: "42px",
    borderRadius: "10px",
    border:
      "1px solid #cbd5e1",
    padding: "0 12px",
    fontSize: "13px",
    background: "#fff",
    outline: "none",
  },

  saveButton: {
    width: "100%",
    height: "44px",
    borderRadius: "10px",
    border: "none",
    background: "#111827",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  },
};
