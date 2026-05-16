"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { canManageProductionOrders, getCurrentOrgTeam } from "@/app/_lib/currentOrg";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();
const defaultNotice =
  "금주 출하 일정 및 고객사 방문 일정 확인 바랍니다.";

type NoticeRow = {
  title: string;
  body: string;
  target_team: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

type ScheduleRow = {
  id: number;
  date: string;
  time: string | null;
  type: string | null;
  company: string | null;
  title: string | null;
  writer: string | null;
};

type OrderCategory = "domestic" | "overseas" | "parts";
type StageStatus = "done" | "pending" | "planned" | "waiting";

type StageKey =
  | "manufacturingRequest"
  | "purchaseRequest"
  | "inbound"
  | "assembly"
  | "control"
  | "test"
  | "qa"
  | "shipment";

type StageDef = {
  key: StageKey;
  label: string;
  column: keyof ProductionOrderRow;
  documentColumn?: keyof ProductionOrderRow;
  manual: boolean;
};

type ProductionOrderRow = {
  id: number;
  category: OrderCategory;
  order_date: string;
  country: string | null;
  customer: string;
  model: string;
  owner_name: string;
  note: string | null;
  manufacturing_document_id: number | null;
  purchase_document_id: number | null;
  qa_document_id: number | null;
  manufacturing_request_approved_on: string | null;
  purchase_request_approved_on: string | null;
  inbound_completed_on: string | null;
  assembly_completed_on: string | null;
  control_completed_on: string | null;
  test_completed_on: string | null;
  qa_approved_on: string | null;
  shipment_scheduled_on: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const stageDefs: StageDef[] = [
  {
    key: "manufacturingRequest",
    label: "제조요구",
    column: "manufacturing_request_approved_on",
    documentColumn: "manufacturing_document_id",
    manual: false,
  },
  {
    key: "purchaseRequest",
    label: "구매의뢰",
    column: "purchase_request_approved_on",
    documentColumn: "purchase_document_id",
    manual: false,
  },
  {
    key: "inbound",
    label: "최종입고",
    column: "inbound_completed_on",
    manual: true,
  },
  {
    key: "assembly",
    label: "조립완료",
    column: "assembly_completed_on",
    manual: true,
  },
  {
    key: "control",
    label: "전기/제어",
    column: "control_completed_on",
    manual: true,
  },
  {
    key: "test",
    label: "생산테스트",
    column: "test_completed_on",
    manual: true,
  },
  {
    key: "qa",
    label: "Q/A완료",
    column: "qa_approved_on",
    documentColumn: "qa_document_id",
    manual: false,
  },
  {
    key: "shipment",
    label: "출고예정",
    column: "shipment_scheduled_on",
    manual: true,
  },
];

const sectionDefs: {
  key: OrderCategory;
  title: string;
  tone: "green" | "blue" | "amber";
}[] = [
  { key: "domestic", title: "국내 장비", tone: "green" },
  { key: "overseas", title: "해외 장비", tone: "blue" },
  { key: "parts", title: "부품", tone: "amber" },
];

const sectionMarkerTone: Record<
  "green" | "blue" | "amber",
  CSSProperties
> = {
  green: { background: "#16a34a" },
  blue: { background: "#2563eb" },
  amber: { background: "#d97706" },
};

const stageTone: Record<StageStatus, CSSProperties> = {
  done: {
    borderColor: "#bbf7d0",
    background: "#f0fdf4",
    color: "#15803d",
  },
  planned: {
    borderColor: "#bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
  },
  pending: {
    borderColor: "#fed7aa",
    background: "#fff7ed",
    color: "#c2410c",
  },
  waiting: {
    borderColor: "#e2e8f0",
    background: "#f8fafc",
    color: "#64748b",
  },
};

function todayKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}-${String(now.getDate()).padStart(
    2,
    "0"
  )}`;
}

function formatShortDate(value?: string | null) {
  if (!value) return "";
  const [, month, day] = value.slice(0, 10).split("-");
  if (!month || !day) return value;
  return `${Number(month)}/${Number(day)}`;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getStageValue(order: ProductionOrderRow, stage: StageDef) {
  return (order[stage.column] as string | null) || "";
}

function getStageDocumentId(order: ProductionOrderRow, stage: StageDef) {
  if (!stage.documentColumn) return null;
  return (order[stage.documentColumn] as number | null) || null;
}

function getStageStatus(
  value?: string | null,
  documentId?: number | null
): StageStatus {
  const targetDate = parseDate(value);

  if (!value || !targetDate) return documentId ? "pending" : "waiting";
  if (targetDate <= new Date()) return "done";
  return "planned";
}

function getStageText(status: StageStatus) {
  if (status === "done") return "완료";
  if (status === "pending") return "결재중";
  if (status === "planned") return "예정";
  return "대기";
}

function getCurrentStage(order: ProductionOrderRow) {
  const firstOpenStage = stageDefs.find(
    (stage) =>
      getStageStatus(
        getStageValue(order, stage),
        getStageDocumentId(order, stage)
      ) !== "done"
  );

  return firstOpenStage?.label || "완료";
}

function getOrderProgress(order: ProductionOrderRow) {
  const doneCount = stageDefs.filter(
    (stage) =>
      getStageStatus(
        getStageValue(order, stage),
        getStageDocumentId(order, stage)
      ) === "done"
  ).length;

  return Math.round((doneCount / stageDefs.length) * 100);
}

function getSectionExtraColumn(section: OrderCategory) {
  if (section === "overseas") return "국가";
  if (section === "parts") return "구분";
  return "";
}

export default function MainPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("공지");
  const [noticeText, setNoticeText] =
    useState(defaultNotice);
  const [upcomingSchedules, setUpcomingSchedules] = useState<
    ScheduleRow[]
  >([]);
  const [orders, setOrders] = useState<ProductionOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [message, setMessage] = useState("");

  const canManageOrders = useMemo(
    () => canManageProductionOrders(name, role),
    [name, role]
  );

  const activeOrderCount = useMemo(
    () => orders.filter((order) => getOrderProgress(order) < 100).length,
    [orders]
  );

  const loadLatestNotice = useCallback(async (currentTeam: string) => {
    const { data, error } = await supabase
      .from("notices")
      .select("title,body,target_team,starts_on,ends_on")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);

    if (error || !data) return;

    const today = new Date().toISOString().slice(0, 10);
    const notice = ((data || []) as NoticeRow[]).find(
      (item) => {
        const teamMatched =
          !item.target_team ||
          item.target_team === currentTeam;
        const started =
          !item.starts_on || item.starts_on <= today;
        const notEnded =
          !item.ends_on || item.ends_on >= today;

        return teamMatched && started && notEnded;
      }
    );

    if (!notice) return;

    setNoticeTitle(notice.title || "공지");
    setNoticeText(notice.body || defaultNotice);
  }, []);

  const loadUpcomingSchedules = useCallback(async () => {
    const { data, error } = await supabase
      .from("schedules")
      .select("id,date,time,type,company,title,writer")
      .gte("date", todayKey())
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(8);

    if (!error && data) {
      setUpcomingSchedules(data as ScheduleRow[]);
    }
  }, []);

  const loadProductionOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError("");

    const { data, error } = await supabase
      .from("equipment_orders")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setOrders([]);
      setOrdersError(
        "수주 현황 테이블이 아직 준비되지 않았습니다. project-docs/supabase-equipment-orders.sql을 Supabase에 적용해 주세요."
      );
      setOrdersLoading(false);
      return;
    }

    setOrders((data || []) as ProductionOrderRow[]);
    setOrdersLoading(false);
  }, []);

  useEffect(() => {
    const storedName = localStorage.getItem("name") || "";
    const storedTeam = localStorage.getItem("team") || "";
    const storedRole = localStorage.getItem("role") || "";
    const currentTeam = getCurrentOrgTeam(storedName, storedTeam);

    void Promise.resolve().then(() => {
      setName(storedName);
      setRole(storedRole);
      void loadLatestNotice(currentTeam);
      void loadUpcomingSchedules();
      void loadProductionOrders();
    });
  }, [loadLatestNotice, loadProductionOrders, loadUpcomingSchedules]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateMobile = () => setIsMobile(mediaQuery.matches);

    updateMobile();
    mediaQuery.addEventListener("change", updateMobile);
    return () => mediaQuery.removeEventListener("change", updateMobile);
  }, []);

  async function updateManualStage(
    order: ProductionOrderRow,
    stage: StageDef,
    value: string
  ) {
    if (!canManageOrders || !stage.manual) return;

    const { error } = await supabase
      .from("equipment_orders")
      .update({ [stage.column]: value || null })
      .eq("id", order.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? { ...item, [stage.column]: value || null }
          : item
      )
    );
    setMessage("진행 날짜가 저장되었습니다.");
  }

  return (
    <section style={styles.dashboard}>
      <div style={styles.noticeBox}>
        <div style={styles.noticeBadge}>{noticeTitle}</div>
        <div style={styles.noticeText}>{noticeText}</div>

        {["admin", "lead"].includes(role) && (
          <button
            type="button"
            style={styles.noticeManageButton}
            onClick={() => router.push("/notices")}
          >
            공지관리
          </button>
        )}
      </div>

      <section style={styles.productionPanel}>
        <div style={styles.productionHeader}>
          <div>
            <h2 style={styles.productionTitle}>장비 발주 및 제작 현황</h2>
            <div style={styles.productionMeta}>
              제조요구서 상신 시 자동 등록 · 전체 {orders.length}건 · 진행중{" "}
              {activeOrderCount}건
            </div>
          </div>

          <div style={styles.legend}>
            <span style={styles.legendItem}>
              <i style={{ ...styles.legendDot, background: "#16a34a" }} />
              완료
            </span>
            <span style={styles.legendItem}>
              <i style={{ ...styles.legendDot, background: "#f97316" }} />
              결재중
            </span>
            <span style={styles.legendItem}>
              <i style={{ ...styles.legendDot, background: "#2563eb" }} />
              예정
            </span>
            <span style={styles.legendItem}>
              <i style={{ ...styles.legendDot, background: "#94a3b8" }} />
              대기
            </span>
          </div>
        </div>

        {ordersError && (
          <div style={styles.setupBox}>
            <strong>DB 준비 필요</strong>
            <span>{ordersError}</span>
          </div>
        )}

        {message && <div style={styles.messageBox}>{message}</div>}

        <div style={styles.orderSections}>
          {sectionDefs.map((section) => {
            const sectionOrders = orders.filter(
              (order) => order.category === section.key
            );
            const extraColumn = getSectionExtraColumn(section.key);

            return (
              <section key={section.key} style={styles.orderSection}>
                <div style={styles.sectionHeader}>
                  <div style={styles.sectionTitleWrap}>
                    <span
                      style={{
                        ...styles.sectionMarker,
                        ...sectionMarkerTone[section.tone],
                      }}
                    />
                    <h3 style={styles.sectionTitle}>{section.title}</h3>
                  </div>
                  <span style={styles.sectionCount}>
                    {ordersLoading ? "불러오는 중" : `${sectionOrders.length}건`}
                  </span>
                </div>

                {sectionOrders.length === 0 ? (
                  <div style={styles.compactEmpty}>등록된 건이 없습니다.</div>
                ) : isMobile ? (
                  <div style={styles.orderCardList}>
                    {sectionOrders.map((order) => (
                      <article key={order.id} style={styles.orderMobileCard}>
                        <div style={styles.orderMobileTop}>
                          <div>
                            <div style={styles.orderMobileMeta}>
                              {formatShortDate(order.order_date)}
                              {extraColumn ? ` · ${order.country || "-"}` : ""}
                              {" · "}
                              {order.owner_name}
                            </div>
                            <h4 style={styles.orderMobileTitle}>
                              {order.customer} / {order.model}
                            </h4>
                          </div>
                          <strong style={styles.orderMobileProgress}>
                            {getOrderProgress(order)}%
                          </strong>
                        </div>

                        <div style={styles.progressTrack}>
                          <span
                            style={{
                              ...styles.progressFill,
                              width: `${getOrderProgress(order)}%`,
                            }}
                          />
                        </div>

                        <div style={styles.stageGridMobile}>
                          {stageDefs.map((stage) => {
                            const value = getStageValue(order, stage);
                            const status = getStageStatus(
                              value,
                              getStageDocumentId(order, stage)
                            );

                            return (
                              <div key={stage.key} style={styles.stageMobileCell}>
                                <span style={styles.stageMobileLabel}>{stage.label}</span>
                                {stage.manual && canManageOrders ? (
                                  <input
                                    type="date"
                                    value={value}
                                    style={styles.stageDateInputMobile}
                                    onChange={(event) =>
                                      updateManualStage(
                                        order,
                                        stage,
                                        event.target.value
                                      )
                                    }
                                  />
                                ) : (
                                  <span
                                    style={{
                                      ...styles.stageChip,
                                      ...styles.stageChipMobile,
                                      ...stageTone[status],
                                    }}
                                  >
                                    <span>{getStageText(status)}</span>
                                    <strong>{formatShortDate(value) || "-"}</strong>
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {order.note && <div style={styles.orderMobileNote}>{order.note}</div>}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div style={styles.orderTableWrap}>
                    <table style={styles.orderTable}>
                      <thead>
                        <tr>
                          <th style={styles.orderTh}>수주</th>
                          {extraColumn && (
                            <th style={styles.orderTh}>{extraColumn}</th>
                          )}
                          <th style={styles.orderTh}>고객사</th>
                          <th style={styles.orderTh}>모델/품목</th>
                          <th style={styles.orderTh}>담당</th>
                          <th style={styles.orderTh}>현재</th>
                          {stageDefs.map((stage) => (
                            <th key={stage.key} style={styles.orderTh}>
                              {stage.label}
                            </th>
                          ))}
                          <th style={styles.orderTh}>비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionOrders.map((order) => (
                          <tr key={order.id}>
                            <td style={styles.orderTd}>
                              {formatShortDate(order.order_date)}
                            </td>
                            {extraColumn && (
                              <td style={styles.orderTd}>{order.country || "-"}</td>
                            )}
                            <td style={styles.strongTd}>{order.customer}</td>
                            <td style={styles.strongTd}>{order.model}</td>
                            <td style={styles.orderTd}>{order.owner_name}</td>
                            <td style={styles.currentTd}>
                              <div style={styles.currentStage}>
                                <span>{getCurrentStage(order)}</span>
                                <strong>{getOrderProgress(order)}%</strong>
                              </div>
                              <div style={styles.progressTrack}>
                                <span
                                  style={{
                                    ...styles.progressFill,
                                    width: `${getOrderProgress(order)}%`,
                                  }}
                                />
                              </div>
                            </td>
                            {stageDefs.map((stage) => {
                              const value = getStageValue(order, stage);
                              const status = getStageStatus(
                                value,
                                getStageDocumentId(order, stage)
                              );

                              return (
                                <td key={stage.key} style={styles.stageTd}>
                                  {stage.manual && canManageOrders ? (
                                    <input
                                      type="date"
                                      value={value}
                                      style={styles.stageDateInput}
                                      onChange={(event) =>
                                        updateManualStage(
                                          order,
                                          stage,
                                          event.target.value
                                        )
                                      }
                                    />
                                  ) : (
                                    <span
                                      style={{
                                        ...styles.stageChip,
                                        ...stageTone[status],
                                      }}
                                    >
                                      <span>{getStageText(status)}</span>
                                      <strong>{formatShortDate(value) || "-"}</strong>
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td style={styles.noteTd}>{order.note || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>다가오는 일정</h2>
          <button
            type="button"
            style={styles.panelButton}
            onClick={() => router.push("/schedule")}
          >
            일정관리
          </button>
        </div>

        {upcomingSchedules.length === 0 ? (
          <div style={styles.empty}>등록된 예정 일정이 없습니다.</div>
        ) : (
          <div style={styles.scheduleList}>
            {upcomingSchedules.map((item) => (
              <button
                key={item.id}
                type="button"
                style={styles.scheduleItem}
                onClick={() => router.push("/schedule")}
              >
                <div style={styles.scheduleDate}>
                  <strong>{item.date.slice(5).replace("-", ".")}</strong>
                  <span>{item.time?.slice(0, 5) || "-"}</span>
                </div>

                <div style={styles.scheduleBody}>
                  <div style={styles.scheduleTitle}>
                    {item.title || item.company || "일정"}
                  </div>
                  <div style={styles.scheduleMeta}>
                    {[item.type, item.company, item.writer]
                      .filter(Boolean)
                      .join(" / ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  dashboard: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  noticeBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "#ffffff",
    padding: "14px 16px",
    borderRadius: "10px",
    border: "1px solid #e3e7ed",
  },
  noticeBadge: {
    fontSize: "12px",
    fontWeight: 850,
    color: "#fff",
    background: "#111820",
    padding: "4px 9px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
  },
  noticeText: {
    flex: 1,
    fontSize: "13px",
    color: "#475467",
    lineHeight: 1.5,
  },
  noticeManageButton: {
    height: "32px",
    padding: "0 12px",
    borderRadius: "8px",
    border: "1px solid #cfd6df",
    background: "#fff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  productionPanel: {
    background: "#ffffff",
    border: "1px solid #e3e7ed",
    borderRadius: "10px",
    padding: "18px",
  },
  productionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },
  productionTitle: {
    margin: 0,
    color: "#111820",
    fontSize: "18px",
    fontWeight: 800,
  },
  productionMeta: {
    marginTop: "5px",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 600,
  },
  legend: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    paddingTop: "3px",
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    color: "#475467",
    fontSize: "12px",
    fontWeight: 700,
  },
  legendDot: {
    width: "7px",
    height: "7px",
    borderRadius: "999px",
  },
  setupBox: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    border: "1px solid #facc15",
    borderRadius: "9px",
    background: "#fffbeb",
    color: "#854d0e",
    padding: "12px 14px",
    marginBottom: "12px",
    fontSize: "13px",
  },
  messageBox: {
    border: "1px solid #bfdbfe",
    borderRadius: "9px",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "10px 12px",
    marginBottom: "12px",
    fontSize: "13px",
    fontWeight: 700,
  },
  orderSections: {
    display: "grid",
    gap: "12px",
  },
  orderSection: {
    border: "1px solid #edf0f3",
    borderRadius: "9px",
    background: "#fbfcfd",
    padding: "12px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
  },
  sectionTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  sectionMarker: {
    width: "8px",
    height: "22px",
    borderRadius: "999px",
    flex: "0 0 auto",
  },
  sectionTitle: {
    margin: 0,
    color: "#111820",
    fontSize: "15px",
    fontWeight: 800,
  },
  sectionCount: {
    color: "#667085",
    fontSize: "12px",
    fontWeight: 800,
  },
  compactEmpty: {
    border: "1px dashed #d6dce5",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#667085",
    padding: "16px",
    fontSize: "13px",
    textAlign: "center",
  },
  orderTableWrap: {
    overflowX: "auto",
    border: "1px solid #e5eaf0",
    borderRadius: "8px",
    background: "#ffffff",
  },
  orderCardList: {
    display: "grid",
    gap: "10px",
  },
  orderMobileCard: {
    border: "1px solid #e5eaf0",
    borderRadius: "9px",
    background: "#ffffff",
    padding: "12px",
  },
  orderMobileTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
  },
  orderMobileMeta: {
    color: "#667085",
    fontSize: "11px",
    fontWeight: 750,
    lineHeight: 1.4,
  },
  orderMobileTitle: {
    margin: "4px 0 0",
    color: "#111820",
    fontSize: "14px",
    lineHeight: 1.35,
  },
  orderMobileProgress: {
    color: "#111820",
    fontSize: "13px",
    whiteSpace: "nowrap",
  },
  stageGridMobile: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
    marginTop: "10px",
  },
  stageMobileCell: {
    minWidth: 0,
    border: "1px solid #edf0f3",
    borderRadius: "8px",
    background: "#fbfcfd",
    padding: "8px",
  },
  stageMobileLabel: {
    display: "block",
    marginBottom: "6px",
    color: "#475467",
    fontSize: "11px",
    fontWeight: 800,
  },
  stageChipMobile: {
    width: "100%",
    minWidth: 0,
  },
  stageDateInputMobile: {
    width: "100%",
    height: "34px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 7px",
    fontSize: "12px",
  },
  orderMobileNote: {
    marginTop: "10px",
    color: "#667085",
    fontSize: "12px",
    lineHeight: 1.5,
  },
  orderTable: {
    width: "100%",
    minWidth: "1180px",
    borderCollapse: "separate",
    borderSpacing: 0,
  },
  orderTh: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: "#f8fafc",
    borderBottom: "1px solid #e5eaf0",
    color: "#475467",
    padding: "9px 8px",
    fontSize: "12px",
    fontWeight: 800,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  orderTd: {
    borderBottom: "1px solid #edf0f3",
    color: "#344054",
    padding: "9px 8px",
    fontSize: "12px",
    fontWeight: 600,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  strongTd: {
    borderBottom: "1px solid #edf0f3",
    color: "#111820",
    padding: "9px 8px",
    fontSize: "12px",
    fontWeight: 800,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  currentTd: {
    width: "142px",
    borderBottom: "1px solid #edf0f3",
    padding: "8px 10px",
  },
  currentStage: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    color: "#111820",
    fontSize: "12px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  progressTrack: {
    position: "relative",
    height: "5px",
    marginTop: "7px",
    borderRadius: "999px",
    background: "#edf2f7",
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    inset: "0 auto 0 0",
    borderRadius: "999px",
    background: "#111820",
  },
  stageTd: {
    borderBottom: "1px solid #edf0f3",
    padding: "7px 5px",
    textAlign: "center",
  },
  stageChip: {
    minWidth: "72px",
    minHeight: "34px",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "2px",
    border: "1px solid",
    borderRadius: "8px",
    padding: "4px 7px",
    fontSize: "11px",
    lineHeight: 1.05,
  },
  stageDateInput: {
    width: "118px",
    height: "34px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 7px",
    fontSize: "12px",
  },
  noteTd: {
    minWidth: "120px",
    borderBottom: "1px solid #edf0f3",
    color: "#667085",
    padding: "9px 8px",
    fontSize: "12px",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  panel: {
    minHeight: "280px",
    background: "#ffffff",
    border: "1px solid #e3e7ed",
    borderRadius: "10px",
    padding: "22px",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "14px",
  },
  panelTitle: {
    margin: 0,
    fontSize: "18px",
    color: "#111820",
  },
  panelButton: {
    height: "32px",
    padding: "0 12px",
    borderRadius: "8px",
    border: "1px solid #cfd6df",
    background: "#fff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  empty: {
    border: "1px dashed #d6dce5",
    borderRadius: "10px",
    padding: "28px 16px",
    color: "#667085",
    fontSize: "13px",
    textAlign: "center",
  },
  scheduleList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "10px",
  },
  scheduleItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    minHeight: "68px",
    border: "1px solid #e3e7ed",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "12px",
    textAlign: "left",
    cursor: "pointer",
  },
  scheduleDate: {
    width: "56px",
    minWidth: "56px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    borderRadius: "8px",
    background: "#f3f5f7",
    color: "#111820",
    fontSize: "12px",
  },
  scheduleBody: {
    minWidth: 0,
    flex: 1,
  },
  scheduleTitle: {
    color: "#111820",
    fontSize: "14px",
    fontWeight: 850,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  scheduleMeta: {
    marginTop: "5px",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 650,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};
