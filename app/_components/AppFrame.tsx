"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  getCurrentOrgTeam,
} from "@/app/_lib/currentOrg";

const supabase = createSupabaseBrowser();

type AppFrameProps = {
  children: ReactNode;
};

type MenuItem = {
  title: string;
  path: string;
};

const MENU_ITEMS: MenuItem[] = [
  { title: "결재문서", path: "/approval" },
  { title: "업무일지", path: "/view" },
  { title: "A/S 관리", path: "/as" },
  { title: "영업관리", path: "/sales" },
  { title: "일정관리", path: "/schedule" },
  { title: "고객사", path: "/customer" },
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

export function AppFrame({ children }: AppFrameProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [role, setRole] = useState("");
  const [mobileInputNotice, setMobileInputNotice] =
    useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem("name") || "";
    const storedTeam = localStorage.getItem("team") || "";

    void Promise.resolve().then(() => {
      setName(storedName);
      setTeam(getCurrentOrgTeam(storedName, storedTeam));
      setRole(localStorage.getItem("role") || "");
    });
  }, [pathname]);

  const menuItems = useMemo(() => MENU_ITEMS, []);

  if (pathname === "/login") {
    return children;
  }

  const title = TITLE_BY_PATH[pathname] || "ZETA";

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

  return (
    <div style={styles.frame}>
      <aside className="app-sidebar" style={styles.sidebar}>
        <button
          type="button"
          style={styles.logoButton}
          onClick={() => router.push("/main")}
          aria-label="메인으로 이동"
        >
          <img
            src="/brand/zeta-logo.png"
            alt="ZETA"
            style={styles.logo}
          />
        </button>

        <div style={styles.userBox}>
          <div style={styles.userName}>{name || "-"}</div>
          <div style={styles.userMeta}>
            {[team, role].filter(Boolean).join(" / ") || "-"}
          </div>
        </div>

        <nav className="app-nav" style={styles.nav}>
          {menuItems.map((item) => {
            const active =
              pathname === item.path ||
              (item.path === "/view" && pathname === "/");

            return (
              <button
                key={item.path}
                type="button"
                style={{
                  ...styles.navItem,
                  ...(active ? styles.navItemActive : {}),
                }}
                onClick={() => router.push(item.path)}
              >
                <span>{item.title}</span>
                <span style={styles.navArrow}>›</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section style={styles.workspace}>
        <header className="app-topbar" style={styles.topbar}>
          <div>
            <h1 style={styles.title}>{title}</h1>
            {mobileInputNotice && (
              <div style={styles.mobileNotice}>
                모바일 환경에서는 업무일지 작성이 제한됩니다. PC에서 작성해 주세요.
              </div>
            )}
          </div>

          <div style={styles.actions}>
            {pathname === "/view" && (
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleWorklogInput}
              >
                입력
              </button>
            )}
            <button
              type="button"
              style={styles.actionButton}
              onClick={() => router.push("/organization")}
            >
              조직도
            </button>
            <button
              type="button"
              style={styles.actionButton}
              onClick={() => router.push("/change-password")}
            >
              계정관리
            </button>
            <button
              type="button"
              style={styles.actionButton}
              onClick={handleLogout}
            >
              로그아웃
            </button>
          </div>
        </header>

        <main className="app-shell-content" style={styles.content}>
          {children}
        </main>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  frame: {
    minHeight: "100dvh",
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    background: "#f3f5f7",
    color: "#111827",
  },
  sidebar: {
    position: "sticky",
    top: 0,
    alignSelf: "start",
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    borderRight: "1px solid #dfe3e8",
    background: "#ffffff",
    padding: "24px 18px",
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
    borderTop: "1px solid #edf0f3",
    borderBottom: "1px solid #edf0f3",
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
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  navItem: {
    width: "100%",
    minHeight: "42px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1px solid transparent",
    borderRadius: "8px",
    background: "transparent",
    color: "#344054",
    padding: "0 10px",
    fontSize: "14px",
    fontWeight: 750,
    cursor: "pointer",
  },
  navItemActive: {
    background: "#111820",
    borderColor: "#111820",
    color: "#ffffff",
  },
  navArrow: {
    color: "currentColor",
    opacity: 0.62,
    fontSize: "18px",
    lineHeight: 1,
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
    minHeight: "74px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "18px",
    background: "rgba(243, 245, 247, 0.92)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid #dfe3e8",
    padding: "16px 26px",
  },
  title: {
    margin: 0,
    color: "#111820",
    fontSize: "24px",
    fontWeight: 850,
    lineHeight: 1.2,
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
  actionButton: {
    width: "82px",
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
    width: "82px",
    height: "36px",
    borderRadius: "9px",
    border: "1px solid #111820",
    background: "#111820",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 850,
    cursor: "pointer",
  },
  content: {
    minWidth: 0,
    flex: 1,
    padding: "24px 26px 54px",
  },
};
