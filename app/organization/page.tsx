"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  name: string;
  rank: string;
  leader?: boolean;
};

type Team = {
  name: string;
  members: Member[];
};

const executive = {
  title: "대표이사",
  name: "신영호",
};

const advisor = {
  title: "고문",
  name: "신상민",
};

const teams: Team[] = [
  {
    name: "연구개발",
    members: [
      { name: "서중석", rank: "상무", leader: true },
      { name: "윤지환", rank: "부장" },
    ],
  },
  {
    name: "기술 1팀",
    members: [
      { name: "한차현", rank: "차장", leader: true },
      { name: "한재영", rank: "부장" },
      { name: "권영일", rank: "부장" },
      { name: "김학", rank: "대리" },
      { name: "박상현", rank: "대리" },
    ],
  },
  {
    name: "기술 2팀",
    members: [
      { name: "이승준", rank: "차장", leader: true },
      { name: "김종혁", rank: "과장" },
    ],
  },
  {
    name: "기술 3팀",
    members: [
      { name: "장동철", rank: "이사", leader: true },
      { name: "양희원", rank: "차장" },
      { name: "김성종", rank: "과장" },
    ],
  },
  {
    name: "구매기획총무",
    members: [
      { name: "권현진", rank: "부장", leader: true },
      { name: "신훈식", rank: "부장" },
      { name: "최하영", rank: "대리" },
    ],
  },
  {
    name: "재무_인사",
    members: [
      { name: "김혜정", rank: "차장", leader: true },
      { name: "최인혜", rank: "주임" },
    ],
  },
  {
    name: "국내영업",
    members: [
      { name: "정대용", rank: "상무", leader: true },
      { name: "김선일", rank: "과장" },
    ],
  },
  {
    name: "해외영업",
    members: [
      { name: "이양로", rank: "과장", leader: true },
      { name: "반준영", rank: "대리" },
    ],
  },
];

export default function OrganizationPage() {
  const router = useRouter();

  const currentName =
    typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
  const currentTeam =
    typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
  const currentRole =
    typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.logo}>ZETA</div>
            <h1 style={styles.title}>조직도</h1>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.accountInfo}>
              {currentName || "-"} / {currentTeam || "-"} / {currentRole || "-"}
            </div>
            <button style={styles.backButton} onClick={() => router.push("/main")}>
              메인
            </button>
          </div>
        </header>

        <section style={styles.tree}>
          <div style={styles.chartInner}>
            <div style={styles.topArea}>
              <PersonNode title={executive.title} name={executive.name} tone="dark" />

              <div style={styles.mainVerticalLine} />
              <div style={styles.advisorBranchLine} />

              <div style={styles.advisorBox}>
                <PersonNode title={advisor.title} name={advisor.name} tone="soft" />
              </div>
            </div>

            <div style={styles.teamRailArea}>
              <div style={styles.teamRail} />
            </div>

            <div style={styles.teamGrid}>
              {teams.map((team) => (
                <section key={team.name} style={styles.teamCard}>
                  <div style={styles.teamStem} />

                  <div style={styles.teamHeader}>
                    <h2 style={styles.teamTitle}>{team.name}</h2>
                    <span style={styles.teamCount}>{team.members.length}명</span>
                  </div>

                  <div style={styles.memberList}>
                    {team.members.map((member) => (
                      <MemberRow
                        key={`${team.name}-${member.name}`}
                        team={team.name}
                        member={member}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
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
  const tooltip = `${name} / ${title}`;

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

      <span style={{ ...styles.tooltip, display: open ? "grid" : "none" }}>
        <strong>{name}</strong>
        <span>{title}</span>
      </span>
    </div>
  );
}

function MemberRow({ team, member }: { team: string; member: Member }) {
  const [open, setOpen] = useState(false);
  const tooltip = `${member.name} / ${team} / ${member.rank}${
    member.leader ? " / 팀장" : ""
  }`;

  return (
    <div
      title={tooltip}
      tabIndex={0}
      style={member.leader ? styles.leaderRow : styles.memberRow}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span style={styles.memberName}>{member.name}</span>
      <span style={styles.memberRank}>
        {member.rank}
        {member.leader ? " · 팀장" : ""}
      </span>

      <span style={{ ...styles.tooltip, display: open ? "grid" : "none" }}>
        <strong>{member.name}</strong>
        <span>{team}</span>
        <span>
          {member.rank}
          {member.leader ? " / 팀장" : ""}
        </span>
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
  chartInner: {
    minWidth: "1480px",
    margin: "0 auto",
  },

  topArea: {
    position: "relative",
    width: "620px",
    height: "260px",
    margin: "0 auto",
  },
  mainVerticalLine: {
    position: "absolute",
    left: "50%",
    top: "76px",
    width: "1px",
    height: "184px",
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

  teamRailArea: {
    position: "relative",
    height: "28px",
    margin: "0 calc((100% - 98px) / 16)",
  },
  teamRail: {
    position: "absolute",
    left: "0",
    right: "0",
    top: "0",
    height: "1px",
    background: "#cbd5e1",
  },

  teamGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(8, 1fr)",
    gap: "14px",
    alignItems: "start",
  },
  teamCard: {
    position: "relative",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#f8fafc",
    padding: "12px",
    minHeight: "126px",
  },
  teamStem: {
    position: "absolute",
    left: "50%",
    top: "-29px",
    width: "1px",
    height: "28px",
    background: "#cbd5e1",
    transform: "translateX(-50%)",
  },
  teamHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
  },
  teamTitle: {
    margin: 0,
    fontSize: "14px",
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
    gap: "7px",
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
    position: "relative",
    width: "190px",
    minHeight: "70px",
    borderRadius: "10px",
    border: "1px solid #111827",
    background: "#ffffff",
    color: "#111827",
    padding: "12px",
    display: "grid",
    gap: "8px",
    textAlign: "center",
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
    minHeight: "38px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "0 10px",
  },
  leaderRow: {
    position: "relative",
    minHeight: "40px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #111827",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "0 10px",
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
    minWidth: "140px",
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
  },
};
