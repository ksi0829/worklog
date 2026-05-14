"use client";

import {
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";

function subscribeStorage() {
  return () => {};
}

function readStorage(key: string) {
  return typeof window !== "undefined" ? localStorage.getItem(key) || "" : "";
}

export default function ApprovalPage() {
  const router = useRouter();

  const currentName = useSyncExternalStore(
    subscribeStorage,
    () => readStorage("name"),
    () => ""
  );
  const currentTeam = useSyncExternalStore(
    subscribeStorage,
    () => readStorage("team"),
    () => ""
  );
  const currentRole = useSyncExternalStore(
    subscribeStorage,
    () => readStorage("role"),
    () => ""
  );

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <BrandLogo
            subtitle="결재문서"
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

        <section style={styles.panel}>
          <div style={styles.badge}>준비중</div>
          <h2 style={styles.panelTitle}>결재문서 기능을 준비하고 있습니다.</h2>
          <p style={styles.panelText}>
            기존 결재 양식과 결재 라인 흐름을 기준으로 구성할 예정입니다.
          </p>
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    color: "#111827",
  },
  container: {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "30px 22px 56px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "22px",
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
  },
  headerRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "8px",
  },
  accountInfo: {
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
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
    fontWeight: 700,
    cursor: "pointer",
  },
  panel: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    padding: "26px",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    height: "26px",
    padding: "0 10px",
    borderRadius: "999px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 800,
    marginBottom: "16px",
  },
  panelTitle: {
    margin: 0,
    fontSize: "20px",
    lineHeight: 1.35,
  },
  panelText: {
    margin: "10px 0 0",
    color: "#64748b",
    fontSize: "14px",
    lineHeight: 1.55,
  },
};
