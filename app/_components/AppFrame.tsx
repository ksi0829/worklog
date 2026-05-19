"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { getCurrentOrgTeam } from "@/app/_lib/currentOrg";

const supabase = createSupabaseBrowser();

type AppFrameProps = {
  children: ReactNode;
};

type IconName =
  | "approval"
  | "worklog"
  | "as"
  | "sales"
  | "schedule"
  | "customer"
  | "org"
  | "account"
  | "logout"
  | "notice";

type MenuItem = {
  title: string;
  path: string;
  icon: IconName;
  description: string;
};

type ApprovalStatus = "pending" | "approved" | "rejected";

type ApprovalLineRow = {
  id: number;
  step_order: number;
  role_label: string;
  approver_id?: string | null;
  approver_name: string;
  status: ApprovalStatus;
};

type ApprovalDocumentRow = {
  id: number;
  title: string;
  status: ApprovalStatus;
  form_data?: Record<string, unknown>;
  approval_lines?: ApprovalLineRow[];
};

const MENU_ITEMS: MenuItem[] = [
  { title: "결재문서", path: "/approval", icon: "approval", description: "상신 · 결재 · 문서함" },
  { title: "업무일지", path: "/view", icon: "worklog", description: "팀 업무 조회" },
  { title: "A/S 관리", path: "/as", icon: "as", description: "작업지시 · 처리 이력" },
  { title: "영업관리", path: "/sales", icon: "sales", description: "국내 · 해외 영업" },
  { title: "일정관리", path: "/schedule", icon: "schedule", description: "사내 일정 보드" },
  { title: "고객사", path: "/customer", icon: "customer", description: "거래처 · 담당자" },
];

const UTILITY_ITEMS: MenuItem[] = [
  { title: "조직도", path: "/organization", icon: "org", description: "조직 현황" },
  { title: "계정관리", path: "/change-password", icon: "account", description: "비밀번호 변경" },
];

const TITLE_BY_PATH: Record<string, string> = {
  "/": "업무일지 입력",
  "/main": "업무 통합 시스템",
  "/approval": "결재문서",
  "/view": "업무일지",
  "/as": "A/S 관리",
  "/sales": "영업관리",
  "/schedule": "일정관리",
  "/customer": "고객사 DB",
  "/organization": "조직도",
  "/change-password": "계정관리",
  "/notices": "공지관리",
};

const SUBMENU_BY_PATH: Record<string, string[]> = {
  "/approval": ["결재 작성", "내 문서함", "결재 대기", "완료 히스토리"],
  "/view": ["업무일지 조회", "팀별 보기", "일자 선택"],
  "/as": ["작업지시", "처리중", "완료 히스토리"],
  "/sales": ["국내영업", "해외영업", "활동 이력"],
  "/schedule": ["월간 일정", "일정 등록", "휴가 일정"],
  "/customer": ["고객사", "가공업체", "후처리", "담당자"],
  "/organization": ["조직 현황", "부서 구성"],
  "/change-password": ["계정 정보", "비밀번호 변경"],
};

function iconPath(name: IconName) {
  switch (name) {
    case "approval":
      return "M7 3h10l3 3v15H7V3Zm10 0v4h4M10 11h8M10 15h8";
    case "worklog":
      return "M5 5h14v14H5V5Zm4 0v14M8 9h1M8 13h1M8 17h1";
    case "as":
      return "M14 7l3-3 3 3-3 3-3-3ZM4 18l7-7 3 3-7 7H4v-3Z";
    case "sales":
      return "M4 17l6-6 4 4 6-8M4 20h16";
    case "schedule":
      return "M7 3v4M17 3v4M4 8h16M5 5h14v15H5V5Zm4 7h2v2H9v-2Z";
    case "customer":
      return "M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5-1a3 3 0 0 1 3 3v1";
    case "org":
      return "M12 4v5M7 14v-3h10v3M5 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z";
    case "account":
      return "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0";
    case "logout":
      return "M10 5H5v14h5M14 8l4 4-4 4M18 12H9";
    case "notice":
      return "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2ZM18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2Z";
    default:
      return "";
  }
}

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true">
      <path
        d={iconPath(name)}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getFirstPendingLine(document?: ApprovalDocumentRow | null) {
  if (!document) return null;
  return [...(document.approval_lines || [])]
    .sort((a, b) => a.step_order - b.step_order)
    .find((line) => line.status === "pending") || null;
}

function samePerson(left?: string | null, right?: string | null) {
  return Boolean(left && right && left === right);
}

export function AppFrame({ children }: AppFrameProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [role, setRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [approvalDocuments, setApprovalDocuments] = useState<ApprovalDocumentRow[]>([]);
  const [approvalAlertOpen, setApprovalAlertOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileInputNotice, setMobileInputNotice] = useState(false);

  const menuItems = useMemo(() => MENU_ITEMS, []);
  const title = TITLE_BY_PATH[pathname] || "ZETA";

  const approvalAlerts = useMemo(() => {
    return approvalDocuments.filter((document) => {
      if (document.status !== "pending") return false;
      const pendingLine = getFirstPendingLine(document);
      return (
        samePerson(pendingLine?.approver_name, name) ||
        samePerson(pendingLine?.approver_id, currentUserId)
      );
    });
  }, [approvalDocuments, currentUserId, name]);

  const loadApprovalAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from("approval_documents")
      .select("id,title,status,approval_lines(id,step_order,role_label,approver_id,approver_name,status)")
      .eq("status", "pending");

    if (!error && data) {
      setApprovalDocuments(data as ApprovalDocumentRow[]);
    }
  }, []);

  useEffect(() => {
    const storedName = localStorage.getItem("name") || "";
    const storedTeam = localStorage.getItem("team") || "";

    void Promise.resolve().then(() => {
      setName(storedName);
      setTeam(getCurrentOrgTeam(storedName, storedTeam));
      setRole(localStorage.getItem("role") || "");
      void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || ""));
      void loadApprovalAlerts();
    });
  }, [loadApprovalAlerts, pathname]);

  if (pathname === "/login") {
    return children;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("role");
    localStorage.removeItem("team");
    localStorage.removeItem("name");
    router.push("/login");
  }

  function handleWorklogInput() {
    if (window.matchMedia("(max-width: 820px)").matches) {
      setMobileInputNotice(true);
      return;
    }

    router.push("/");
  }

  function navigateTo(path: string) {
    setMobileMenuOpen(false);
    setApprovalAlertOpen(false);
    router.push(path);
  }

  return (
    <div style={styles.frame}>
      <aside className="app-icon-rail" style={styles.iconRail}>
        <button
          type="button"
          style={styles.iconLogoButton}
          onClick={() => router.push("/main")}
          aria-label="메인으로 이동"
        >
          <span style={styles.logoMark}>Z</span>
        </button>

        <nav style={styles.iconNav} aria-label="주요 메뉴">
          {menuItems.map((item) => {
            const active = pathname === item.path || (item.path === "/view" && pathname === "/");

            return (
              <button
                key={item.path}
                type="button"
                title={item.title}
                style={{
                  ...styles.iconNavItem,
                  ...(active ? styles.iconNavItemActive : {}),
                }}
                onClick={() => navigateTo(item.path)}
              >
                <NavIcon name={item.icon} />
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section style={styles.workspace}>
        <header className="app-topbar" style={styles.topbar}>
          <div>
            <div style={styles.mobileTitleRow}>
              <button
                type="button"
                className="app-mobile-menu-button"
                style={styles.mobileMenuButton}
                onClick={() => setMobileMenuOpen(true)}
                aria-label="메뉴 열기"
              >
                <span />
                <span />
                <span />
              </button>
              <h1 style={styles.title}>{title}</h1>
            </div>
            {mobileInputNotice && (
              <div style={styles.mobileNotice}>
                모바일 환경에서는 업무일지 작성이 제한됩니다. PC에서 작성해 주세요.
              </div>
            )}
          </div>

          <div style={styles.actions}>
            {pathname === "/view" && (
              <button type="button" style={styles.primaryButton} onClick={handleWorklogInput}>
                입력
              </button>
            )}
            <button
              type="button"
              style={styles.topbarIdentity}
              onClick={() => navigateTo("/main")}
              aria-label="메인으로 이동"
            >
              <img src="/brand/zeta-logo.png" alt="ZETA" style={styles.topbarLogo} />
              <span style={styles.topbarUser}>
                <span style={styles.topbarUserName}>{name || "-"}</span>
                <span style={styles.topbarUserMeta}>
                  {[team, role].filter(Boolean).join(" / ") || "-"}
                </span>
              </span>
            </button>
            <button
              type="button"
              style={{
                ...styles.alertButton,
                ...(approvalAlerts.length > 0 ? styles.alertButtonActive : {}),
              }}
              onClick={() => setApprovalAlertOpen(true)}
              aria-label="결재 알림"
              title="결재 알림"
            >
              <span style={styles.alertMark}>!</span>
              {approvalAlerts.length > 0 && (
                <span style={styles.alertCount}>{approvalAlerts.length}</span>
              )}
            </button>
            {UTILITY_ITEMS.map((item) => (
              <button
                key={item.path}
                type="button"
                style={styles.actionButton}
                onClick={() => navigateTo(item.path)}
              >
                {item.title}
              </button>
            ))}
            <button type="button" style={styles.actionButton} onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div
            className="app-mobile-menu-backdrop"
            style={styles.mobileMenuBackdrop}
            onClick={() => setMobileMenuOpen(false)}
          >
            <aside
              style={styles.mobileDrawer}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={styles.mobileDrawerHeader}>
                <strong>메뉴</strong>
                <button
                  type="button"
                  style={styles.mobileDrawerClose}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  닫기
                </button>
              </div>
              <nav style={styles.mobileDrawerNav}>
                {menuItems.map((item) => {
                  const active = pathname === item.path || (pathname === "/" && item.path === "/view");

                  return (
                    <button
                      key={item.path}
                      type="button"
                      style={{
                        ...styles.mobileDrawerItem,
                        ...(active ? styles.mobileDrawerItemActive : {}),
                      }}
                      onClick={() => navigateTo(item.path)}
                    >
                      <NavIcon name={item.icon} />
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        <main className="app-shell-content" style={styles.content}>
          {children}
        </main>
      </section>

      {approvalAlertOpen && (
        <div style={styles.modalBackdrop} onClick={() => setApprovalAlertOpen(false)}>
          <section style={styles.alertModal} onClick={(event) => event.stopPropagation()}>
            <div style={styles.alertModalHeader}>
              <div>
                <span style={styles.alertKicker}>결재 알림</span>
                <h2 style={styles.alertTitle}>확인할 결재 문서가 있습니다.</h2>
              </div>
              <button
                type="button"
                style={styles.modalCloseButton}
                onClick={() => setApprovalAlertOpen(false)}
              >
                닫기
              </button>
            </div>

            <div style={styles.alertList}>
              {approvalAlerts.length === 0 ? (
                <div style={styles.alertEmpty}>현재 확인할 결재 알림이 없습니다.</div>
              ) : (
                approvalAlerts.map((document) => {
                  const pendingLine = getFirstPendingLine(document);

                  return (
                    <button
                      key={document.id}
                      type="button"
                      style={styles.alertItem}
                      onClick={() => navigateTo("/approval")}
                    >
                      <strong>{document.title}</strong>
                      <span>
                        {pendingLine
                          ? `${pendingLine.role_label} / ${pendingLine.approver_name} 결재 대기`
                          : "참조 문서 확인"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  frame: {
    minHeight: "100dvh",
    display: "grid",
    gridTemplateColumns: "78px minmax(0, 1fr)",
    background: "#f6f7f9",
    color: "#111827",
  },
  iconRail: {
    position: "sticky",
    top: 0,
    alignSelf: "start",
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    borderRight: "1px solid #e6e8eb",
    background: "#ffffff",
    padding: "18px 8px",
    zIndex: 25,
  },
  iconLogoButton: {
    width: "44px",
    height: "44px",
    border: "none",
    borderRadius: "14px",
    background: "#111820",
    color: "#ffffff",
    cursor: "pointer",
  },
  logoMark: {
    fontSize: "21px",
    fontWeight: 900,
    letterSpacing: "0",
  },
  iconNav: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "100%",
  },
  iconNavItem: {
    width: "100%",
    minHeight: "58px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    border: "1px solid transparent",
    borderRadius: "14px",
    background: "transparent",
    color: "#667085",
    fontSize: "11px",
    fontWeight: 750,
    cursor: "pointer",
  },
  iconNavItemActive: {
    background: "#eef6f1",
    borderColor: "#d7eee0",
    color: "#0f8a56",
  },
  sidebar: {
    position: "sticky",
    top: 0,
    alignSelf: "start",
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    borderRight: "1px solid #e1e5ea",
    background: "#f3f4f6",
    padding: "20px 16px",
  },
  logoButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
  },
  logo: {
    display: "block",
    width: "142px",
    height: "auto",
  },
  userBox: {
    borderTop: "1px solid #e2e6eb",
    borderBottom: "1px solid #e2e6eb",
    padding: "14px 0",
  },
  userName: {
    fontSize: "14px",
    fontWeight: 850,
  },
  userMeta: {
    marginTop: "5px",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 650,
    lineHeight: 1.4,
  },
  sideSection: {
    display: "grid",
    gap: "9px",
  },
  sideSectionTitle: {
    color: "#8a94a3",
    fontSize: "12px",
    fontWeight: 850,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  navItem: {
    width: "100%",
    minHeight: "48px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1px solid transparent",
    borderRadius: "10px",
    background: "transparent",
    color: "#344054",
    padding: "0 10px",
    cursor: "pointer",
  },
  navItemActive: {
    background: "#ffffff",
    borderColor: "#ffffff",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
    color: "#111820",
  },
  navTextWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "3px",
    minWidth: 0,
  },
  navArrow: {
    color: "currentColor",
    opacity: 0.48,
    fontSize: "18px",
    lineHeight: 1,
  },
  subMenuList: {
    display: "grid",
    gap: "4px",
  },
  subMenuItem: {
    minHeight: "34px",
    display: "flex",
    alignItems: "center",
    borderRadius: "9px",
    color: "#475467",
    padding: "0 10px",
    fontSize: "13px",
    fontWeight: 650,
  },
  subMenuActive: {
    minHeight: "34px",
    display: "flex",
    alignItems: "center",
    borderRadius: "9px",
    background: "#e5e7eb",
    color: "#111820",
    padding: "0 10px",
    fontSize: "13px",
    fontWeight: 850,
  },
  workspace: {
    minWidth: 0,
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
  },
  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    minHeight: "70px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "18px",
    background: "#ffffff",
    borderBottom: "1px solid #e1e5ea",
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
    padding: "14px 24px",
  },
  title: {
    margin: 0,
    color: "#111820",
    fontSize: "22px",
    fontWeight: 850,
    lineHeight: 1.2,
  },
  mobileTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  mobileMenuButton: {
    width: "40px",
    height: "38px",
    display: "none",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    border: "1px solid #cfd6df",
    borderRadius: "10px",
    background: "#ffffff",
    cursor: "pointer",
  },
  mobileMenuBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    background: "rgba(15, 23, 42, 0.32)",
  },
  mobileDrawer: {
    width: "min(280px, 82vw)",
    minHeight: "100dvh",
    background: "#ffffff",
    borderRight: "1px solid #e1e5ea",
    padding: "16px",
    boxShadow: "16px 0 48px rgba(15, 23, 42, 0.18)",
  },
  mobileDrawerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "14px",
  },
  mobileDrawerClose: {
    height: "32px",
    padding: "0 10px",
    border: "1px solid #cfd6df",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  mobileDrawerNav: {
    display: "grid",
    gap: "7px",
  },
  mobileDrawerItem: {
    width: "100%",
    minHeight: "46px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#344054",
    padding: "0 12px",
    fontSize: "13px",
    fontWeight: 850,
    cursor: "pointer",
  },
  mobileDrawerItemActive: {
    background: "#eef6f1",
    borderColor: "#d7eee0",
    color: "#0f8a56",
  },
  mobileNotice: {
    marginTop: "7px",
    color: "#2563eb",
    fontSize: "12px",
    fontWeight: 750,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  topbarIdentity: {
    minWidth: "230px",
    height: "42px",
    display: "inline-flex",
    alignItems: "center",
    gap: "12px",
    border: "1px solid #e1e5ea",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 12px",
    cursor: "pointer",
  },
  topbarLogo: {
    width: "82px",
    height: "auto",
    display: "block",
    flex: "0 0 auto",
  },
  topbarUser: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "2px",
    minWidth: 0,
    borderLeft: "1px solid #edf0f3",
    paddingLeft: "10px",
    lineHeight: 1.15,
  },
  topbarUserName: {
    maxWidth: "96px",
    color: "#111820",
    fontSize: "12px",
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  topbarUserMeta: {
    maxWidth: "112px",
    color: "#667085",
    fontSize: "11px",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  alertButton: {
    position: "relative",
    width: "38px",
    height: "38px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    border: "1px solid #cfd6df",
    background: "#ffffff",
    color: "#667085",
    cursor: "pointer",
  },
  alertButtonActive: {
    borderColor: "#fecaca",
    background: "#fff1f2",
    color: "#dc2626",
  },
  alertMark: {
    fontSize: "20px",
    fontWeight: 950,
    lineHeight: 1,
  },
  alertCount: {
    position: "absolute",
    top: "-5px",
    right: "-5px",
    minWidth: "18px",
    height: "18px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background: "#ef4444",
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: 900,
  },
  actionButton: {
    minWidth: "82px",
    height: "36px",
    borderRadius: "9px",
    border: "1px solid #cfd6df",
    background: "#ffffff",
    color: "#111827",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryButton: {
    minWidth: "82px",
    height: "36px",
    borderRadius: "9px",
    border: "1px solid #0f8a56",
    background: "#0f8a56",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 850,
    cursor: "pointer",
  },
  content: {
    minWidth: 0,
    flex: 1,
    padding: "24px 24px 54px",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    background: "rgba(15, 23, 42, 0.34)",
  },
  alertModal: {
    width: "min(430px, 100%)",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    padding: "18px",
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.24)",
  },
  alertModalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "14px",
  },
  alertKicker: {
    color: "#dc2626",
    fontSize: "12px",
    fontWeight: 900,
  },
  alertTitle: {
    margin: "4px 0 0",
    color: "#111820",
    fontSize: "18px",
    fontWeight: 850,
  },
  modalCloseButton: {
    height: "32px",
    padding: "0 11px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  alertList: {
    display: "grid",
    gap: "8px",
  },
  alertItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    width: "100%",
    border: "1px solid #e5eaf0",
    borderRadius: "10px",
    background: "#fbfcfd",
    padding: "11px 12px",
    color: "#111820",
    textAlign: "left",
    cursor: "pointer",
    fontSize: "13px",
  },
  alertEmpty: {
    border: "1px dashed #d6dce5",
    borderRadius: "10px",
    background: "#fbfcfd",
    color: "#667085",
    padding: "18px 14px",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 750,
  },
};
