export type CurrentOrgTeam = {
  team: string;
  leader: string;
  members: string[];
};

export type OrgMemberInfo = {
  team: string;
  leader: boolean;
};

export const CURRENT_ORG: CurrentOrgTeam[] = [
  {
    team: "연구개발",
    leader: "서중석",
    members: ["윤지환"],
  },
  {
    team: "기술 1팀",
    leader: "한차현",
    members: ["한재영", "권영일", "김학", "박상현"],
  },
  {
    team: "기술 2팀",
    leader: "이승준",
    members: ["김종혁"],
  },
  {
    team: "기술 3팀",
    leader: "장동철",
    members: ["양희원", "김성종"],
  },
  {
    team: "구매기획총무",
    leader: "권현진",
    members: ["신훈식", "최하영"],
  },
  {
    team: "재무_인사",
    leader: "김혜정",
    members: ["최인혜"],
  },
  {
    team: "국내영업",
    leader: "정대용",
    members: ["김선일"],
  },
  {
    team: "해외영업",
    leader: "이양로",
    members: ["반준영"],
  },
];

export const TEAM_ORDER = CURRENT_ORG.map(
  (team) => team.team
);

export const EXECUTIVE_NAMES = ["신영호", "신상민"];

export const ORG_MEMBER_MAP = new Map<
  string,
  OrgMemberInfo
>(
  CURRENT_ORG.flatMap((team) => [
    [
      team.leader,
      { team: team.team, leader: true },
    ] as [string, OrgMemberInfo],
    ...team.members.map(
      (name) =>
        [
          name,
          { team: team.team, leader: false },
        ] as [string, OrgMemberInfo]
    ),
  ])
);

export function getCurrentOrgTeam(
  name: string,
  fallbackTeam = ""
) {
  return ORG_MEMBER_MAP.get(name)?.team || fallbackTeam;
}

export function canAccessSales(
  name: string,
  team: string
) {
  const orgTeam = getCurrentOrgTeam(name, team);

  return (
    EXECUTIVE_NAMES.includes(name) ||
    orgTeam === "국내영업" ||
    orgTeam === "해외영업"
  );
}

export function canViewAllWorklogs(
  name: string,
  role: string
) {
  return role === "admin" || EXECUTIVE_NAMES.includes(name);
}
