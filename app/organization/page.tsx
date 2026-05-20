"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";

type Member = {
  name: string;
  rank: string;
  leader?: boolean;
  leaderLabel?: string;
};

type Department = {
  name: string;
  members: Member[];
};

type Division = {
  name: string;
  english: string;
  tone: "orange" | "yellow" | "blue" | "green" | "sky";
  head?: Member;
  departments: Department[];
};

const chairman = {
  title: "회장",
  name: "신상민",
};

const executive = {
  title: "대표이사",
  name: "신영호",
};

const divisions: Division[] = [
  {
    name: "관리본부",
    english: "Administration Division",
    tone: "orange",
    head: { name: "정대용", rank: "상무", leader: true, leaderLabel: "본부장" },
    departments: [
      {
        name: "재무/인사",
        members: [
          { name: "김혜정", rank: "차장", leader: true, leaderLabel: "팀장" },
          { name: "최인혜", rank: "주임" },
        ],
      },
      {
        name: "구매/총무",
        members: [
          { name: "신훈식", rank: "부장" },
          { name: "최하영", rank: "대리" },
        ],
      },
      {
        name: "국내영업부",
        members: [
          { name: "김선일", rank: "과장" },
        ],
      },
    ],
  },
  {
    name: "영업본부",
    english: "Sales & Marketing Division",
    tone: "yellow",
    departments: [
      {
        name: "해외영업부",
        members: [
          { name: "이양로", rank: "과장", leader: true, leaderLabel: "팀장" },
          { name: "반준영", rank: "주임" },
        ],
      },
    ],
  },
  {
    name: "기획본부",
    english: "Planning Division",
    tone: "blue",
    departments: [
      {
        name: "전략기획부",
        members: [],
      },
      {
        name: "신사업부",
        members: [
          { name: "권현진", rank: "부장", leader: true, leaderLabel: "팀장" },
          { name: "박봉근", rank: "실장" },
          { name: "최하영", rank: "대리" },
        ],
      },
    ],
  },
  {
    name: "R&D/품질보증본부",
    english: "R&D/QA Division",
    tone: "green",
    head: { name: "서중석", rank: "상무", leader: true, leaderLabel: "본부장" },
    departments: [
      {
        name: "R&D/QA부",
        members: [
          { name: "윤지환", rank: "부장" },
        ],
      },
    ],
  },
  {
    name: "생산본부",
    english: "Engineering Division",
    tone: "sky",
    head: { name: "장동철", rank: "이사", leader: true, leaderLabel: "본부장" },
    departments: [
      {
        name: "기술 1팀",
        members: [
          { name: "한차현", rank: "차장", leader: true, leaderLabel: "팀장" },
          { name: "한재영", rank: "부장" },
          { name: "권영일", rank: "부장" },
          { name: "김학", rank: "대리" },
          { name: "박상현", rank: "대리" },
        ],
      },
      {
        name: "기술 2팀",
        members: [
          { name: "이승준", rank: "차장", leader: true, leaderLabel: "팀장" },
          { name: "김종혁", rank: "과장" },
        ],
      },
      {
        name: "기술 3팀",
        members: [
          { name: "양희원", rank: "차장" },
          { name: "김성종", rank: "과장" },
        ],
      },
    ],
  },
];

const divisionTone: Record<Division["tone"], CSSProperties> = {
  orange: {
    background: "#fff1e7",
    borderColor: "#f6b17a",
  },
  yellow: {
    background: "#fff8dc",
    borderColor: "#e8c647",
  },
  blue: {
    background: "#edf4ff",
    borderColor: "#8eb0dc",
  },
  green: {
    background: "#eef9ea",
    borderColor: "#99cc85",
  },
  sky: {
    background: "#edf7ff",
    borderColor: "#82b6df",
  },
};

const USER_EMAIL_BY_NAME: Record<string, string> = {
  김선일: "ksi@zetacorporation.com",
  김종혁: "jhkim@zetacorporation.com",
  권영일: "yikwon@zetacorporation.com",
  권현진: "jin@zetacorporation.com",
  김성종: "sjkim@zetacorporation.com",
  김학: "hkim@zetacorporation.com",
  김혜정: "hjkim@zetacorporation.com",
  박상현: "shpark@zetacorporation.com",
  반준영: "june@zetacorporation.com",
  서중석: "jsseo@zetacorporation.com",
  신영호: "Lucian@zetacorporation.com",
  신상민: "shinsm@zetacorporation.com",
  신훈식: "shs@zetacorporation.com",
  양희원: "yhw@zetacorporation.com",
  윤지환: "jhyun@zetacorporation.com",
  이승준: "sjlee@zetacorporation.com",
  이양로: "patrick@zetacorporation.com",
  장동철: "dcjang@zetacorporation.com",
  정대용: "dyjoung@zetacorporation.com",
  최인혜: "ihchoi@zetacorporation.com",
  최하영: "hwchoi@zetacorporation.com",
  한재영: "jyhan@zetacorporation.com",
  한차현: "hanch@zetacorporation.com",
};

function getRegisteredEmail(name: string) {
  return USER_EMAIL_BY_NAME[name] || "등록 메일 없음";
}

export default function OrganizationPage() {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);

  const currentName =
    typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
  const currentTeam =
    typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
  const currentRole =
    typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobile(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <BrandLogo
            subtitle="조직도"
            subtitleTag="h1"
          />

          <div style={styles.headerRight}>
            <div style={styles.accountInfo}>
              {currentName || "-"} / {currentTeam || "-"} / {currentRole || "-"}
            </div>
            <button style={styles.backButton} onClick={() => router.push("/main")}>
              메인
            </button>
          </div>
        </header>

        {isMobile ? (
          <section style={styles.mobileTree}>
            <div style={styles.mobileExecutiveStack}>
              <PersonCard title={chairman.title} name={chairman.name} />
              <PersonCard title={executive.title} name={executive.name} />
            </div>

            <div style={styles.mobileDivisionList}>
              {divisions.map((division, index) => (
                <details key={division.name} open={index === 0} style={styles.mobileDivision}>
                  <summary style={styles.mobileDivisionSummary}>
                    <span style={styles.mobileDivisionName}>
                      <strong>{division.name}</strong>
                      <em style={styles.mobileDivisionEnglish}>{division.english}</em>
                    </span>
                    <span style={styles.mobileDivisionCount}>
                      {division.departments.reduce(
                        (total, department) => total + department.members.length,
                        division.head ? 1 : 0
                      )}
                      명
                    </span>
                  </summary>

                  <div style={styles.mobileDivisionBody}>
                    {division.head && (
                      <section style={styles.mobileDepartmentCard}>
                        <div style={styles.mobileDepartmentHeader}>
                          <strong>본부장</strong>
                        </div>
                        <MemberRow member={division.head} compact />
                      </section>
                    )}

                    {division.departments.map((department) => (
                      <section key={`${division.name}-${department.name}`} style={styles.mobileDepartmentCard}>
                        <div style={styles.mobileDepartmentHeader}>
                          <strong>{department.name}</strong>
                          <span>{department.members.length}명</span>
                        </div>
                        <div style={styles.memberList}>
                          {department.members.length > 0 ? (
                            department.members.map((member) => (
                              <MemberRow
                                key={`${division.name}-${department.name}-${member.name}`}
                                member={member}
                              />
                            ))
                          ) : (
                            <div style={styles.emptyDepartment}>배정 인원 없음</div>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ) : (
          <section style={styles.tree}>
            <div style={styles.chartInner}>
              <div style={styles.topArea}>
                <PersonNode title={chairman.title} name={chairman.name} tone="soft" />
                <div style={styles.ceoBox}>
                  <PersonNode title={executive.title} name={executive.name} tone="soft" />
                </div>
                <div style={styles.topVerticalLine} />
                <div style={styles.lowerVerticalLine} />
              </div>

              <div style={styles.divisionRailArea}>
                <div style={styles.divisionRail} />
              </div>

              <div style={styles.divisionGrid}>
                {divisions.map((division) => (
                  <section key={division.name} style={styles.divisionCard}>
                    <div style={styles.divisionStem} />

                    <div style={{ ...styles.divisionHeader, ...divisionTone[division.tone] }}>
                      <h2 style={styles.divisionTitle}>{division.name}</h2>
                      <span style={styles.divisionEnglish}>{division.english}</span>
                    </div>

                    {division.head && (
                      <div style={styles.divisionHeadBox}>
                        <span style={styles.divisionHeadLabel}>
                          {division.head.leaderLabel || "본부장"}
                        </span>
                        <MemberRow member={division.head} compact />
                      </div>
                    )}

                    <div style={styles.departmentList}>
                      {division.departments.map((department) => (
                        <section key={`${division.name}-${department.name}`} style={styles.departmentCard}>
                          <div style={styles.departmentHeader}>
                            <h3 style={styles.departmentTitle}>{department.name}</h3>
                            <span style={styles.teamCount}>{department.members.length}명</span>
                          </div>

                          <div style={styles.memberList}>
                            {department.members.length > 0 ? (
                              department.members.map((member) => (
                                <MemberRow
                                  key={`${division.name}-${department.name}-${member.name}`}
                                  member={member}
                                />
                              ))
                            ) : (
                              <div style={styles.emptyDepartment}>배정 인원 없음</div>
                            )}
                          </div>
                        </section>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function PersonCard({ title, name }: { title: string; name: string }) {
  return (
    <div style={styles.mobileExecutiveCard}>
      <span>{title}</span>
      <strong>{name}</strong>
    </div>
  );
}

function PersonNode({
  title,
  name,
  tone,
}: {
  title: string;
  name: string;
  tone: "dark" | "soft";
}) {
  const [open, setOpen] = useState(false);
  const email = getRegisteredEmail(name);
  const tooltip = `${name} / ${email}`;

  return (
    <div
      title={tooltip}
      tabIndex={0}
      style={tone === "dark" ? styles.executiveNode : styles.advisorNode}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span style={styles.nodeTitle}>{title}</span>
      <strong style={styles.nodeName}>{name}</strong>

      <span
        style={{
          ...styles.tooltip,
          ...styles.tooltipBelow,
          display: open ? "grid" : "none",
        }}
      >
        <strong>{name}</strong>
        <span>{email}</span>
      </span>
    </div>
  );
}

function MemberRow({ member, compact = false }: { member: Member; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const email = getRegisteredEmail(member.name);
  const tooltip = `${member.name} / ${email}`;

  return (
    <div
      title={tooltip}
      tabIndex={0}
      style={{
        ...(member.leader ? styles.leaderRow : styles.memberRow),
        ...(compact ? styles.compactMemberRow : {}),
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span style={styles.memberName}>{member.name}</span>
      <span style={styles.memberRank}>
        {member.rank}
        {member.leader ? ` · ${member.leaderLabel || "팀장"}` : ""}
      </span>

      <span style={{ ...styles.tooltip, display: open ? "grid" : "none" }}>
        <strong>{member.name}</strong>
        <span>{email}</span>
      </span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    color: "#111827",
  },
  container: {
    maxWidth: "1680px",
    margin: "0 auto",
    padding: "28px 28px 42px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "20px",
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
    fontWeight: 700,
  },
  headerRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "8px",
  },
  accountInfo: {
    color: "#475569",
    fontSize: "12px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  backButton: {
    height: "36px",
    padding: "0 14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },
  tree: {
    position: "relative",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "28px 24px 34px",
    overflowX: "auto",
    overflowY: "visible",
  },
  mobileTree: {
    display: "grid",
    gap: "14px",
  },
  mobileExecutiveStack: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  mobileExecutiveCard: {
    minHeight: "74px",
    display: "grid",
    placeItems: "center",
    gap: "6px",
    border: "1px solid #111827",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#111827",
    padding: "12px",
    textAlign: "center",
  },
  mobileDivisionList: {
    display: "grid",
    gap: "10px",
  },
  mobileDivision: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    overflow: "hidden",
  },
  mobileDivisionSummary: {
    minHeight: "58px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    cursor: "pointer",
    listStyle: "none",
  },
  mobileDivisionCount: {
    color: "#475569",
    fontSize: "12px",
    fontWeight: 900,
  },
  mobileDivisionName: {
    display: "grid",
    gap: "3px",
    minWidth: 0,
  },
  mobileDivisionEnglish: {
    color: "#64748b",
    fontSize: "11px",
    fontStyle: "normal",
    fontWeight: 750,
  },
  mobileDivisionBody: {
    display: "grid",
    gap: "10px",
    borderTop: "1px solid #e5e7eb",
    background: "#f8fafc",
    padding: "10px",
  },
  mobileDepartmentCard: {
    display: "grid",
    gap: "8px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "10px",
  },
  mobileDepartmentHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    color: "#111827",
    fontSize: "13px",
    fontWeight: 900,
  },
  chartInner: {
    width: "1580px",
    maxWidth: "none",
    margin: "0 auto",
  },

  topArea: {
    position: "relative",
    width: "620px",
    height: "246px",
    margin: "0 auto",
  },
  ceoBox: {
    position: "absolute",
    left: "50%",
    top: "100px",
    width: "220px",
    height: "76px",
    transform: "translateX(-50%)",
  },
  topVerticalLine: {
    position: "absolute",
    left: "50%",
    top: "76px",
    width: "1px",
    height: "24px",
    background: "#cbd5e1",
    transform: "translateX(-50%)",
  },
  lowerVerticalLine: {
    position: "absolute",
    left: "50%",
    top: "181px",
    width: "1px",
    height: "65px",
    background: "#cbd5e1",
    transform: "translateX(-50%)",
  },
  advisorBranchLine: {
    position: "absolute",
    left: "50%",
    top: "138px",
    width: "150px",
    height: "1px",
    background: "#cbd5e1",
  },
  advisorBox: {
    position: "absolute",
    left: "calc(50% + 150px)",
    top: "102px",
  },

  divisionRailArea: {
    position: "relative",
    height: "28px",
    margin: "0 calc((100% - 56px) / 10)",
  },
  divisionRail: {
    position: "absolute",
    left: "0",
    right: "0",
    top: "0",
    height: "1px",
    background: "#cbd5e1",
  },

  divisionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: "14px",
    alignItems: "start",
  },
  divisionCard: {
    position: "relative",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#f8fafc",
    padding: "10px",
    minHeight: "250px",
  },
  divisionStem: {
    position: "absolute",
    left: "50%",
    top: "-29px",
    width: "1px",
    height: "28px",
    background: "#cbd5e1",
    transform: "translateX(-50%)",
  },
  divisionHeader: {
    display: "grid",
    gap: "4px",
    minHeight: "62px",
    alignContent: "center",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "8px 10px",
    marginBottom: "9px",
    textAlign: "center",
  },
  divisionTitle: {
    margin: 0,
    color: "#111827",
    fontSize: "14px",
    fontWeight: 900,
    lineHeight: 1.2,
  },
  divisionEnglish: {
    color: "#334155",
    fontSize: "10px",
    fontWeight: 700,
    lineHeight: 1.25,
  },
  divisionHeadBox: {
    display: "grid",
    gap: "6px",
    marginBottom: "10px",
  },
  divisionHeadLabel: {
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 900,
    textAlign: "center",
  },
  compactMemberRow: {
    minHeight: "34px",
  },
  departmentList: {
    display: "grid",
    gap: "8px",
  },
  departmentCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "8px",
  },
  departmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
  },
  departmentTitle: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  teamCount: {
    color: "#475569",
    fontSize: "12px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  memberList: {
    display: "grid",
    gap: "6px",
  },
  emptyDepartment: {
    minHeight: "32px",
    display: "grid",
    placeItems: "center",
    border: "1px dashed #cbd5e1",
    borderRadius: "8px",
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 800,
  },

  executiveNode: {
    position: "absolute",
    left: "50%",
    top: 0,
    width: "220px",
    minHeight: "76px",
    borderRadius: "10px",
    background: "#111827",
    color: "#ffffff",
    padding: "13px 12px",
    display: "grid",
    gap: "8px",
    textAlign: "center",
    transform: "translateX(-50%)",
    zIndex: 2,
  },
  advisorNode: {
    position: "absolute",
    left: "50%",
    top: 0,
    width: "220px",
    minHeight: "76px",
    borderRadius: "10px",
    border: "1px solid #111827",
    background: "#ffffff",
    color: "#111827",
    padding: "12px",
    display: "grid",
    gap: "8px",
    textAlign: "center",
    transform: "translateX(-50%)",
    zIndex: 2,
  },
  nodeTitle: {
    fontSize: "12px",
    fontWeight: 900,
    color: "inherit",
    opacity: 0.82,
  },
  nodeName: {
    fontSize: "20px",
    fontWeight: 900,
  },

  memberRow: {
    position: "relative",
    minHeight: "34px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "0 8px",
  },
  leaderRow: {
    position: "relative",
    minHeight: "36px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #111827",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "0 8px",
  },
  memberName: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "12px",
    fontWeight: 750,
  },
  memberRank: {
    color: "#334155",
    fontSize: "11px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  tooltip: {
    position: "absolute",
    left: "50%",
    bottom: "calc(100% + 8px)",
    zIndex: 20,
    minWidth: "210px",
    transform: "translateX(-50%)",
    display: "none",
    gap: "5px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    background: "#ffffff",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)",
    padding: "10px",
    color: "#111827",
    fontSize: "12px",
    textAlign: "left",
    pointerEvents: "none",
    wordBreak: "break-all",
  },
  tooltipBelow: {
    top: "calc(100% + 8px)",
    bottom: "auto",
  },
};
