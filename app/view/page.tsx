"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import { useRouter } from "next/navigation";

import {
  ORG_MEMBER_MAP,
  TEAM_ORDER,
  canViewAllWorklogs,
} from "@/app/_lib/currentOrg";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase =
  createSupabaseBrowser();

type Profile = {
  id: string;
  name: string;
  role: string;
  team: string;
};

type Worklog = {
  id: string;
  user_id: string;
  work_date: string;
};

type WorklogItem = {
  id: string;
  worklog_id: string;
  type: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  company: string | null;
  equipment: string | null;
  main_work: string | null;
  note: string | null;
};

function sortProfilesByOrg(
  a: Profile,
  b: Profile
) {
  const aInfo = ORG_MEMBER_MAP.get(a.name);
  const bInfo = ORG_MEMBER_MAP.get(b.name);

  if (aInfo?.leader && !bInfo?.leader)
    return -1;
  if (!aInfo?.leader && bInfo?.leader)
    return 1;

  return a.name.localeCompare(
    b.name,
    "ko-KR"
  );
}

export default function ViewPage() {
  const router = useRouter();

  const today = new Date();

  const localDate =
    `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;

  const [selectedDate, setSelectedDate] =
    useState(localDate);

  const [profiles, setProfiles] =
    useState<Profile[]>([]);

  const [worklogs, setWorklogs] =
    useState<Worklog[]>([]);

  const [selectedTeam, setSelectedTeam] =
    useState("기술 1팀");

  const [modalOpen, setModalOpen] =
    useState(false);

  const [selectedUser, setSelectedUser] =
    useState<Profile | null>(null);

  const [selectedItems, setSelectedItems] =
    useState<WorklogItem[]>([]);

  const [selectedWorklogId, setSelectedWorklogId] =
    useState("");

  const [currentUser, setCurrentUser] =
    useState("");

  const [currentTeam, setCurrentTeam] =
    useState("");

  const [currentRole, setCurrentRole] =
    useState("");

  const [isMobileViewport, setIsMobileViewport] =
    useState(false);

  const [mobileInputNotice, setMobileInputNotice] =
    useState(false);

  const fetchProfiles = useCallback(async () => {
    const { data } =
      await supabase
        .from("profiles")
        .select("*");

    if (!data) return;

    const currentProfiles =
      (data as Profile[])
        .filter((profile) =>
          ORG_MEMBER_MAP.has(
            profile.name
          )
        )
        .map((profile) => {
          const orgInfo =
            ORG_MEMBER_MAP.get(
              profile.name
            );

          return {
            ...profile,
            team:
              orgInfo?.team ||
              profile.team,
          };
        })
        .sort(sortProfilesByOrg);

    setProfiles(currentProfiles);
  }, []);

  const fetchWorklogs = useCallback(async () => {
    const { data } =
      await supabase
        .from("worklogs")
        .select("*")
        .eq(
          "work_date",
          selectedDate
        );

    if (!data) return;

    setWorklogs(data);
  }, [selectedDate]);

  useEffect(() => {
    const storedName =
      localStorage.getItem("name") ||
      "";
    const storedTeam =
      localStorage.getItem("team") ||
      "";
    const storedRole =
      localStorage.getItem("role") ||
      "";
    const orgTeam =
      ORG_MEMBER_MAP.get(storedName)
        ?.team ||
      storedTeam;

    void Promise.resolve().then(() => {
      setCurrentUser(
        storedName
      );
      setCurrentTeam(
        orgTeam
      );
      if (orgTeam) {
        setSelectedTeam(orgTeam);
      }
      setCurrentRole(storedRole);
      void fetchProfiles();
    });
  }, [fetchProfiles]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(max-width: 767px)"
    );

    const syncViewport = () => {
      setIsMobileViewport(
        mediaQuery.matches
      );
    };

    syncViewport();
    mediaQuery.addEventListener(
      "change",
      syncViewport
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        syncViewport
      );
    };
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchWorklogs());
  }, [fetchWorklogs]);

  function handleInputClick() {
    if (isMobileViewport) {
      setMobileInputNotice(true);
      return;
    }

    router.push("/");
  }

  function isWritten(
    userId: string
  ) {
    return worklogs.some(
      (v) => v.user_id === userId
    );
  }

  async function openModal(
    profile: Profile
  ) {
    setSelectedUser(profile);

    const worklog =
      worklogs.find(
        (v) =>
          v.user_id === profile.id
      );

    if (!worklog) {
      setSelectedItems([]);

      setSelectedWorklogId("");

      setModalOpen(true);

      return;
    }

    setSelectedWorklogId(
      worklog.id
    );

    const { data } =
      await supabase
        .from("worklog_items")
        .select("*")
        .eq(
          "worklog_id",
          worklog.id
        )
        .order("start_time", {
          ascending: true,
        });

    setSelectedItems(data || []);

    setModalOpen(true);
  }

  async function deleteWorklog() {
    if (!selectedWorklogId)
      return;

    const ok = confirm(
      "업무일지를 삭제하시겠습니까?"
    );

    if (!ok) return;

    await supabase
      .from("worklog_items")
      .delete()
      .eq(
        "worklog_id",
        selectedWorklogId
      );

    await supabase
      .from("worklogs")
      .delete()
      .eq(
        "id",
        selectedWorklogId
      );

    setModalOpen(false);

    fetchWorklogs();
  }

  const groupedProfiles =
    useMemo(() => {
      const grouped: Record<
        string,
        Profile[]
      > = {};

      const visibleTeams =
        canViewAllWorklogs(currentUser, currentRole)
          ? TEAM_ORDER
          : TEAM_ORDER.filter(
              (team) => team === currentTeam
            );

      visibleTeams.forEach((team) => {
        grouped[team] =
          profiles
            .filter(
              (v) => v.team === team
            )
            .sort(sortProfilesByOrg);
      });

      return grouped;
    }, [
      currentRole,
      currentTeam,
      currentUser,
      profiles,
    ]);

  const visibleTeamOrder = useMemo(
    () =>
      canViewAllWorklogs(currentUser, currentRole)
        ? TEAM_ORDER
        : TEAM_ORDER.filter((team) => team === currentTeam),
    [currentRole, currentTeam, currentUser]
  );

  useEffect(() => {
    if (
      visibleTeamOrder.length > 0 &&
      !visibleTeamOrder.includes(selectedTeam)
    ) {
      void Promise.resolve().then(() => {
        setSelectedTeam(visibleTeamOrder[0]);
      });
    }
  }, [selectedTeam, visibleTeamOrder]);

  const prevItems =
    selectedItems.filter(
      (v) => v.type === "prev"
    );

  const todayItems =
    selectedItems.filter(
      (v) => v.type === "today"
    );

  return (
    <>
      <div style={styles.page}>
        <div style={styles.topBar}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) =>
              setSelectedDate(
                e.target.value
              )
            }
            style={styles.dateInput}
          />
        </div>

        <div style={styles.layout}>
          <div style={styles.sidebar}>
            {visibleTeamOrder.map((team) => {
              const users =
                groupedProfiles[
                  team
                ] || [];

              return (
                <button
                  key={team}
                  style={styles.teamButton(
                    selectedTeam ===
                      team
                  )}
                  onClick={() =>
                    setSelectedTeam(
                      team
                    )
                  }
                >
                  <span
                    style={
                      styles.teamName
                    }
                  >
                    {team}
                  </span>

                  <span
                    style={
                      styles.teamCount
                    }
                  >
                    {users.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={styles.content}>
            <div style={styles.teamTitle}>
              {selectedTeam}
            </div>

            <div style={styles.cardGrid}>
              {(
                groupedProfiles[
                  selectedTeam
                ] || []
              ).map((profile) => (
                <div
                  key={profile.id}
                  style={styles.userCard}
                  onClick={() =>
                    openModal(profile)
                  }
                >
                  <div
                    style={
                      styles.cardTop
                    }
                  >
                    <div
                      style={
                        styles.userName
                      }
                    >
                      {profile.name}

                      {ORG_MEMBER_MAP.get(
                        profile.name
                      )?.leader && (
                        <span
                          style={
                            styles.leaderBadge
                          }
                        >
                          팀장
                        </span>
                      )}
                    </div>

                    <div
                      style={styles.status(
                        isWritten(
                          profile.id
                        )
                      )}
                    >
                      {isWritten(
                        profile.id
                      )
                        ? "작성완료"
                        : "미작성"}
                    </div>
                  </div>

                  <div
                    style={
                      styles.teamLabel
                    }
                  >
                    {profile.team}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
              {selectedUser?.name ===
                currentUser &&
                selectedWorklogId && (
                  <div
                    style={
                      styles.modalButtons
                    }
                  >
                    <button
                      style={
                        styles.editButton
                      }
                      onClick={() =>
                        router.push(
                          `/?date=${selectedDate}&edit=${selectedWorklogId}`
                        )
                      }
                    >
                      수정
                    </button>

                    <button
                      style={
                        styles.deleteButton
                      }
                      onClick={
                        deleteWorklog
                      }
                    >
                      삭제
                    </button>
                  </div>
                )}
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th
                      style={
                        styles.thType
                      }
                    >
                      구분
                    </th>

                    <th
                      style={
                        styles.thTime
                      }
                    >
                      시간
                    </th>

                    <th
                      style={
                        styles.thLocation
                      }
                    >
                      장소
                    </th>

                    <th
                      style={
                        styles.thCompany
                      }
                    >
                      업체명
                    </th>

                    <th
                      style={
                        styles.thEquipment
                      }
                    >
                      장비명
                    </th>

                    <th
                      style={
                        styles.thMain
                      }
                    >
                      주요업무
                    </th>

                    <th
                      style={
                        styles.thNote
                      }
                    >
                      비고
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {prevItems.map(
                    (
                      item,
                      index
                    ) => (
                      <tr
                        key={item.id}
                      >
                        {index ===
                          0 && (
                          <td
                            rowSpan={
                              prevItems.length
                            }
                            style={
                              styles.typeCell
                            }
                          >
                            전일
                            <br />
                            업무
                          </td>
                        )}

                        <td
                          style={
                            styles.timeTd
                          }
                        >
                          {item.start_time?.slice(
                            0,
                            5
                          )}{" "}
                          ~{" "}
                          {item.end_time?.slice(
                            0,
                            5
                          )}
                        </td>

                        <td
                          style={
                            styles.td
                          }
                        >
                          {
                            item.location
                          }
                        </td>

                        <td
                          style={
                            styles.td
                          }
                        >
                          {
                            item.company
                          }
                        </td>

                        <td
                          style={
                            styles.td
                          }
                        >
                          {
                            item.equipment
                          }
                        </td>

                        <td
                          style={
                            styles.taskTd
                          }
                        >
                          {
                            item.main_work
                          }
                        </td>

                        <td
                          style={
                            styles.td
                          }
                        >
                          {item.note}
                        </td>
                      </tr>
                    )
                  )}

                  {todayItems.map(
                    (
                      item,
                      index
                    ) => (
                      <tr
                        key={item.id}
                      >
                        {index ===
                          0 && (
                          <td
                            rowSpan={
                              todayItems.length
                            }
                            style={
                              styles.typeCell
                            }
                          >
                            금일
                            <br />
                            업무
                          </td>
                        )}

                        <td
                          style={
                            styles.timeTd
                          }
                        >
                          {item.start_time?.slice(
                            0,
                            5
                          )}{" "}
                          ~{" "}
                          {item.end_time?.slice(
                            0,
                            5
                          )}
                        </td>

                        <td
                          style={
                            styles.td
                          }
                        >
                          {
                            item.location
                          }
                        </td>

                        <td
                          style={
                            styles.td
                          }
                        >
                          {
                            item.company
                          }
                        </td>

                        <td
                          style={
                            styles.td
                          }
                        >
                          {
                            item.equipment
                          }
                        </td>

                        <td
                          style={
                            styles.taskTd
                          }
                        >
                          {
                            item.main_work
                          }
                        </td>

                        <td
                          style={
                            styles.td
                          }
                        >
                          {item.note}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    padding: "12px",
    fontFamily:
      "Pretendard, sans-serif",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    marginBottom: "14px",
  },

  title: {
    fontSize: "28px",
    fontWeight: 800,
  },

  subTitle: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#64748b",
  },

  right: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  userInfo: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#64748b",
    marginRight: "6px",
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

  topBar: {
    marginBottom: "14px",
    padding: "8px 10px",
    borderRadius: "12px",
    background: "#fff",
    border:
      "1px solid #e2e8f0",
  },

  mobileNotice: {
    marginBottom: "14px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#fff7ed",
    border:
      "1px solid #fed7aa",
    color: "#9a3412",
    fontSize: "13px",
    fontWeight: 700,
    lineHeight: 1.45,
  },

  dateInput: {
    height: "40px",
    borderRadius: "10px",
    border:
      "1px solid #cbd5e1",
    padding: "0 12px",
    fontSize: "14px",
    fontWeight: 700,
  },

  layout: {
    display: "flex",
    gap: "12px",
  },

  sidebar: {
    width: "176px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  teamButton: (
    active: boolean
  ) => ({
    width: "100%",
    height: "50px",
    borderRadius: "14px",
    border: active
      ? "2px solid #111827"
      : "1px solid #dbe2ea",
    background: "#fff",
    padding: "10px 14px",
    cursor: "pointer",
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
  }),

  teamName: {
    fontSize: "14px",
    fontWeight: 800,
  },

  teamCount: {
    fontSize: "13px",
    color: "#64748b",
    fontWeight: 700,
  },

  content: {
    flex: 1,
    minHeight: "600px",
    borderRadius: "16px",
    background: "#fff",
    border:
      "1px solid #e2e8f0",
    padding: "18px",
  },

  teamTitle: {
    fontSize: "28px",
    fontWeight: 800,
    marginBottom: "18px",
  },

  cardGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
  },

  userCard: {
    width: "210px",
    borderRadius: "16px",
    border:
      "1px solid #e2e8f0",
    background: "#fff",
    padding: "14px",
    cursor: "pointer",
  },

  cardTop: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    marginBottom: "14px",
  },

  userName: {
    fontSize: "15px",
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },

  leaderBadge: {
    fontSize: "10px",
    padding: "4px 6px",
    borderRadius: "999px",
    background: "#dbeafe",
    color: "#2563eb",
    fontWeight: 700,
  },

  status: (
    done: boolean
  ) => ({
    fontSize: "11px",
    fontWeight: 700,
    padding: "5px 8px",
    borderRadius: "999px",
    background: done
      ? "#dcfce7"
      : "#fee2e2",
    color: done
      ? "#16a34a"
      : "#dc2626",
  }),

  teamLabel: {
    fontSize: "12px",
    color: "#94a3b8",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background:
      "rgba(15,23,42,0.45)",
    display: "flex",
    justifyContent:
      "center",
    alignItems: "center",
    zIndex: 999,
    padding: "24px",
  },

  modal: {
    width: "1280px",
    maxHeight: "92vh",
    overflow: "auto",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "28px",
    boxShadow:
      "0 20px 60px rgba(0,0,0,0.12)",
  },

  modalHeader: {
    display: "flex",
    justifyContent:
      "flex-end",
    marginBottom: "18px",
  },

  modalButtons: {
    display: "flex",
    gap: "10px",
  },

  editButton: {
    height: "42px",
    padding: "0 18px",
    borderRadius: "12px",
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "14px",
  },

  deleteButton: {
    height: "42px",
    padding: "0 18px",
    borderRadius: "12px",
    border: "none",
    background: "#fee2e2",
    color: "#dc2626",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "14px",
  },

  tableWrap: {
    border:
      "1px solid #e5e7eb",
    borderRadius: "18px",
    overflow: "hidden",
  },

  table: {
    width: "100%",
    borderCollapse:
      "separate",
    borderSpacing: 0,
    background: "#fff",
  },

  thType: {
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 800,
    padding: "14px 12px",
    borderBottom:
      "1px solid #e5e7eb",
    textAlign: "center",
    width: "90px",
  },

  thTime: {
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 800,
    padding: "14px 12px",
    borderBottom:
      "1px solid #e5e7eb",
    textAlign: "center",
    width: "180px",
  },

  thLocation: {
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 800,
    padding: "14px 12px",
    borderBottom:
      "1px solid #e5e7eb",
    textAlign: "center",
    width: "120px",
  },

  thCompany: {
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 800,
    padding: "14px 12px",
    borderBottom:
      "1px solid #e5e7eb",
    textAlign: "center",
    width: "180px",
  },

  thEquipment: {
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 800,
    padding: "14px 12px",
    borderBottom:
      "1px solid #e5e7eb",
    textAlign: "center",
    width: "180px",
  },

  thMain: {
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 800,
    padding: "14px 12px",
    borderBottom:
      "1px solid #e5e7eb",
    textAlign: "center",
  },

  thNote: {
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 800,
    padding: "14px 12px",
    borderBottom:
      "1px solid #e5e7eb",
    textAlign: "center",
    width: "160px",
  },

  td: {
    padding: "14px 12px",
    borderBottom:
      "1px solid #edf2f7",
    borderRight:
      "1px solid #edf2f7",
    fontSize: "13px",
    color: "#334155",
    textAlign: "center",
    background: "#fff",
  },

  timeTd: {
    padding: "14px 12px",
    borderBottom:
      "1px solid #edf2f7",
    borderRight:
      "1px solid #edf2f7",
    fontSize: "13px",
    color: "#0f172a",
    textAlign: "center",
    fontWeight: 700,
    background: "#fff",
    whiteSpace: "nowrap",
  },

  taskTd: {
    padding: "14px 14px",
    borderBottom:
      "1px solid #edf2f7",
    borderRight:
      "1px solid #edf2f7",
    fontSize: "13px",
    color: "#111827",
    fontWeight: 600,
    textAlign: "left",
    background: "#fff",
    lineHeight: 1.5,
  },

  typeCell: {
    width: "90px",
    background: "#f1f5f9",
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: 800,
    textAlign: "center",
    lineHeight: 1.6,
    borderRight:
      "1px solid #e5e7eb",
    borderBottom:
      "1px solid #e5e7eb",
  },
} satisfies Record<
  string,
  CSSProperties | ((value: boolean) => CSSProperties)
>;
