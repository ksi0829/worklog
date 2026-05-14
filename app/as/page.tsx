"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { styles } from "@/app/_modules/as/styles";

type Priority = "LOW" | "MID" | "HIGH";
type Status = "OPEN" | "IN_PROGRESS" | "CLOSED";
type Tab = "active" | "history";

type ServiceLog = {
  id: number;
  seq: number;
  action: string;
  part: string;
  memo: string;
  createdAt: string;
};

type WorkOrder = {
  id: number;
  woNo: string;
  customer: string;
  model: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
  logs: ServiceLog[];
};

type WorkOrderForm = {
  woNo: string;
  customer: string;
  model: string;
  title: string;
  description: string;
  priority: Priority;
};

type LogForm = {
  action: string;
  part: string;
  memo: string;
};

type WorkOrderRow = {
  id: number;
  wo_no: string;
  customer: string | null;
  model: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  created_at: string | null;
  updated_at: string | null;
};

type ServiceLogRow = {
  id: number;
  work_order_id: number;
  seq: number;
  action: string;
  part: string | null;
  memo: string | null;
  created_at: string | null;
};

type CustomerOption = {
  id: number;
  name: string;
};

const todayLabel = new Date().toISOString().slice(0, 10);
const supabase = createSupabaseBrowser();

const emptyOrderForm: WorkOrderForm = {
  woNo: "",
  customer: "",
  model: "",
  title: "",
  description: "",
  priority: "MID",
};

const emptyLogForm: LogForm = {
  action: "",
  part: "",
  memo: "",
};

const priorityLabel: Record<Priority, string> = {
  LOW: "낮음",
  MID: "보통",
  HIGH: "긴급",
};

const statusLabel: Record<Status, string> = {
  OPEN: "접수",
  IN_PROGRESS: "처리중",
  CLOSED: "완료",
};

export default function AsPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("active");
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [orderForm, setOrderForm] = useState<WorkOrderForm>(emptyOrderForm);
  const [logForm, setLogForm] = useState<LogForm>(emptyLogForm);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "CLOSED"),
    [orders]
  );

  const historyOrders = useMemo(() => {
    const text = query.trim().toLowerCase();
    const closed = orders.filter((order) => order.status === "CLOSED");

    if (!text) return closed;

    return closed.filter((order) =>
      [
        order.woNo,
        order.customer,
        order.model,
        order.title,
        order.description,
        ...order.logs.flatMap((log) => [log.action, log.part, log.memo]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(text)
    );
  }, [orders, query]);

  const selectedOrder =
    orders.find((order) => order.id === selectedId) || activeOrders[0] || null;

  const visibleOrders = tab === "active" ? activeOrders : historyOrders;

  const currentName =
    typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
  const currentTeam =
    typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
  const currentRole =
    typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";

  async function loadOrders() {
    setLoading(true);
    setLoadError("");

    const { data: orderRows, error: orderError } = await supabase
      .from("as_work_orders")
      .select("id,wo_no,customer,model,title,description,priority,status,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (orderError) {
      setLoadError("A/S 저장 테이블을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: logRows, error: logError } = await supabase
      .from("as_service_logs")
      .select("id,work_order_id,seq,action,part,memo,created_at")
      .order("seq", { ascending: false });

    if (logError) {
      setLoadError("A/S 처리내역을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: customerRows } = await supabase
      .from("customers")
      .select("id,name")
      .order("name", { ascending: true });

    const logsByOrder = new Map<number, ServiceLog[]>();
    ((logRows || []) as ServiceLogRow[]).forEach((log) => {
      const nextLog: ServiceLog = {
        id: log.id,
        seq: log.seq,
        action: log.action,
        part: log.part || "",
        memo: log.memo || "",
        createdAt: (log.created_at || todayLabel).slice(0, 10),
      };
      logsByOrder.set(log.work_order_id, [
        nextLog,
        ...(logsByOrder.get(log.work_order_id) || []),
      ]);
    });

    const mappedOrders = ((orderRows || []) as WorkOrderRow[]).map((order) => ({
      id: order.id,
      woNo: order.wo_no,
      customer: order.customer || "",
      model: order.model || "",
      title: order.title,
      description: order.description || "",
      priority: order.priority,
      status: order.status,
      createdAt: (order.created_at || todayLabel).slice(0, 10),
      updatedAt: (order.updated_at || todayLabel).slice(0, 10),
      logs: logsByOrder.get(order.id) || [],
    }));

    setOrders(mappedOrders);
    setCustomerOptions((customerRows || []) as CustomerOption[]);
    setSelectedId((current) => {
      if (current && mappedOrders.some((order) => order.id === current)) {
        return current;
      }
      return mappedOrders[0]?.id || null;
    });
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadOrders());
  }, []);

  function updateOrder<K extends keyof WorkOrderForm>(
    key: K,
    value: WorkOrderForm[K]
  ) {
    setOrderForm((current) => ({ ...current, [key]: value }));
  }

  function updateLog<K extends keyof LogForm>(key: K, value: LogForm[K]) {
    setLogForm((current) => ({ ...current, [key]: value }));
  }

  async function addWorkOrder() {
    const woNo = orderForm.woNo.trim();
    const customer = orderForm.customer.trim();
    const model = orderForm.model.trim();
    const title = orderForm.title.trim();

    if (!woNo || !customer || !model || !title) {
      alert("번호, 업체명, 장비/모델, 제목은 필수입니다.");
      return;
    }

    const { data, error } = await supabase
      .from("as_work_orders")
      .insert({
        wo_no: woNo,
        customer,
        model,
        title,
        description: orderForm.description.trim(),
        priority: orderForm.priority,
        status: "OPEN",
      })
      .select("id,wo_no,customer,model,title,description,priority,status,created_at,updated_at")
      .single();

    if (error || !data) {
      alert(error?.message || "작업지시 등록에 실패했습니다.");
      return;
    }

    const row = data as WorkOrderRow;
    const nextOrder: WorkOrder = {
      id: row.id,
      woNo: row.wo_no,
      customer: row.customer || "",
      model: row.model || "",
      title: row.title,
      description: row.description || "",
      priority: row.priority,
      status: row.status,
      createdAt: (row.created_at || todayLabel).slice(0, 10),
      updatedAt: (row.updated_at || todayLabel).slice(0, 10),
      logs: [],
    };

    setOrders((current) => [nextOrder, ...current]);
    setSelectedId(nextOrder.id);
    setOrderForm(emptyOrderForm);
    setTab("active");
  }

  async function addServiceLog() {
    if (!selectedOrder) return;

    const action = logForm.action.trim();

    if (!action) {
      alert("조치 내용은 필수입니다.");
      return;
    }

    const nextSeq = selectedOrder.logs.length + 1;
    const { data, error } = await supabase
      .from("as_service_logs")
      .insert({
        work_order_id: selectedOrder.id,
        seq: nextSeq,
        action,
        part: logForm.part.trim(),
        memo: logForm.memo.trim(),
      })
      .select("id,work_order_id,seq,action,part,memo,created_at")
      .single();

    if (error || !data) {
      alert(error?.message || "처리내역 추가에 실패했습니다.");
      return;
    }

    const nextStatus = selectedOrder.status === "OPEN" ? "IN_PROGRESS" : selectedOrder.status;
    const { error: orderError } = await supabase
      .from("as_work_orders")
      .update({ status: nextStatus, updated_at: todayLabel })
      .eq("id", selectedOrder.id);

    if (orderError) {
      alert(orderError.message);
      return;
    }

    const row = data as ServiceLogRow;
    const nextLog: ServiceLog = {
      id: row.id,
      seq: row.seq,
      action: row.action,
      part: row.part || "",
      memo: row.memo || "",
      createdAt: (row.created_at || todayLabel).slice(0, 10),
    };

    setOrders((current) =>
      current.map((order) =>
        order.id === selectedOrder.id
          ? {
              ...order,
              status: nextStatus,
              updatedAt: todayLabel,
              logs: [nextLog, ...order.logs],
            }
          : order
      )
    );

    setLogForm(emptyLogForm);
  }

  async function closeOrder() {
    if (!selectedOrder) return;
    if (!confirm("선택한 작업지시를 완료 처리할까요?")) return;

    const { error } = await supabase
      .from("as_work_orders")
      .update({ status: "CLOSED", updated_at: todayLabel })
      .eq("id", selectedOrder.id);

    if (error) {
      alert(error.message);
      return;
    }

    setOrders((current) =>
      current.map((order) =>
        order.id === selectedOrder.id
          ? { ...order, status: "CLOSED", updatedAt: todayLabel }
          : order
      )
    );
    setTab("history");
  }

  async function deleteOrder() {
    if (!selectedOrder) return;
    if (!confirm("선택한 작업지시를 삭제할까요?")) return;

    const { error } = await supabase
      .from("as_work_orders")
      .delete()
      .eq("id", selectedOrder.id);

    if (error) {
      alert(error.message);
      return;
    }

    const remainingOrders = orders.filter((order) => order.id !== selectedOrder.id);
    const nextVisible =
      tab === "active"
        ? remainingOrders.find((order) => order.status !== "CLOSED")
        : remainingOrders.find((order) => order.status === "CLOSED");
    const nextSelected = nextVisible || remainingOrders[0] || null;

    setOrders(remainingOrders);
    setSelectedId(nextSelected?.id || null);
    setLogForm(emptyLogForm);

    if (tab === "history" && !remainingOrders.some((order) => order.status === "CLOSED")) {
      setTab("active");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <BrandLogo
            subtitle="A/S 관리"
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

        {loadError && <div style={styles.errorBox}>{loadError}</div>}
        {loading && <div style={styles.empty}>A/S 작업지시를 불러오는 중입니다.</div>}

        <section style={styles.summaryGrid}>
          <SummaryCard label="진행중" value={activeOrders.length} />
          <SummaryCard
            label="긴급"
            value={activeOrders.filter((order) => order.priority === "HIGH").length}
          />
          <SummaryCard
            label="완료"
            value={orders.filter((order) => order.status === "CLOSED").length}
          />
        </section>

        <section style={styles.layout}>
          <div style={styles.panel}>
            <h2 style={styles.panelTitle}>작업지시 등록</h2>
            <p style={styles.panelHint}>기존 A/S 앱의 필수 항목 기준입니다.</p>

            <div style={styles.formGrid}>
              <Field label="작업지시서 번호">
                <input
                  value={orderForm.woNo}
                  onChange={(event) => updateOrder("woNo", event.target.value)}
                  placeholder="예: AS-001"
                  style={styles.input}
                />
              </Field>

              <Field label="업체명">
                <input
                  value={orderForm.customer}
                  onChange={(event) => updateOrder("customer", event.target.value)}
                  placeholder="업체명 입력"
                  list="as-customer-options"
                  style={styles.input}
                />
              </Field>

              <Field label="장비/모델">
                <input
                  value={orderForm.model}
                  onChange={(event) => updateOrder("model", event.target.value)}
                  placeholder="장비명 또는 모델명"
                  style={styles.input}
                />
              </Field>

              <Field label="우선순위">
                <select
                  value={orderForm.priority}
                  onChange={(event) =>
                    updateOrder("priority", event.target.value as Priority)
                  }
                  style={styles.input}
                >
                  <option value="LOW">낮음</option>
                  <option value="MID">보통</option>
                  <option value="HIGH">긴급</option>
                </select>
              </Field>
            </div>

            <datalist id="as-customer-options">
              {customerOptions.map((customer) => (
                <option key={customer.id} value={customer.name} />
              ))}
            </datalist>

            <Field label="제목">
              <input
                value={orderForm.title}
                onChange={(event) => updateOrder("title", event.target.value)}
                placeholder="예: 센서 알람 확인"
                style={styles.input}
              />
            </Field>

            <Field label="증상/요청사항">
              <textarea
                value={orderForm.description}
                onChange={(event) => updateOrder("description", event.target.value)}
                placeholder="현장 증상, 요청사항, 특이사항"
                style={{ ...styles.input, ...styles.textarea }}
              />
            </Field>

            <button style={styles.primaryButton} onClick={addWorkOrder}>
              작업지시 등록
            </button>
          </div>

          <div style={styles.panel}>
            <div style={styles.tabs}>
              <button
                style={tab === "active" ? styles.activeTab : styles.tab}
                onClick={() => setTab("active")}
              >
                진행중
              </button>
              <button
                style={tab === "history" ? styles.activeTab : styles.tab}
                onClick={() => setTab("history")}
              >
                히스토리
              </button>
            </div>

            {tab === "history" && (
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="번호, 업체, 모델, 조치 내용 검색"
                style={{ ...styles.input, marginBottom: 12 }}
              />
            )}

            <div style={styles.orderList}>
              {visibleOrders.length === 0 ? (
                <div style={styles.empty}>표시할 작업지시가 없습니다.</div>
              ) : (
                visibleOrders.map((order) => (
                  <button
                    key={order.id}
                    style={
                      selectedOrder?.id === order.id
                        ? styles.selectedOrderCard
                        : styles.orderCard
                    }
                    onClick={() => setSelectedId(order.id)}
                  >
                    <div style={styles.orderTop}>
                      <span style={styles.woNo}>{order.woNo}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div style={styles.orderTitle}>{order.title}</div>
                    <div style={styles.orderMeta}>
                      {order.customer} / {order.model}
                    </div>
                    <div style={styles.orderBottom}>
                      <PriorityBadge priority={order.priority} />
                      <span>{order.logs.length}건 처리</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section style={styles.detailPanel}>
          {!selectedOrder ? (
            <div style={styles.empty}>작업지시를 선택하세요.</div>
          ) : (
            <>
              <div style={styles.detailHeader}>
                <div>
                  <div style={styles.detailMeta}>
                    {selectedOrder.woNo} / {selectedOrder.customer} / {selectedOrder.model}
                  </div>
                  <h2 style={styles.detailTitle}>{selectedOrder.title}</h2>
                </div>

                <div style={styles.detailActions}>
                  <PriorityBadge priority={selectedOrder.priority} />
                  <StatusBadge status={selectedOrder.status} />
                  {selectedOrder.status !== "CLOSED" && (
                    <button style={styles.ghostButton} onClick={closeOrder}>
                      완료 처리
                    </button>
                  )}
                  <button style={styles.dangerButton} onClick={deleteOrder}>
                    삭제
                  </button>
                </div>
              </div>

              {selectedOrder.description && (
                <div style={styles.description}>{selectedOrder.description}</div>
              )}

              {selectedOrder.status !== "CLOSED" && (
                <div style={styles.logForm}>
                  <Field label="조치 내용">
                    <input
                      value={logForm.action}
                      onChange={(event) => updateLog("action", event.target.value)}
                      placeholder="예: 부품 교체 / 점검 완료 / 펌웨어 업데이트"
                      style={styles.input}
                    />
                  </Field>

                  <div style={styles.formGrid}>
                    <Field label="부품">
                      <input
                        value={logForm.part}
                        onChange={(event) => updateLog("part", event.target.value)}
                        placeholder="예: PCB, 센서, 커넥터"
                        style={styles.input}
                      />
                    </Field>

                    <Field label="메모">
                      <input
                        value={logForm.memo}
                        onChange={(event) => updateLog("memo", event.target.value)}
                        placeholder="원인, 결과, 추후 조치"
                        style={styles.input}
                      />
                    </Field>
                  </div>

                  <button style={styles.primaryButton} onClick={addServiceLog}>
                    처리내역 추가
                  </button>
                </div>
              )}

              <div style={styles.logList}>
                <h3 style={styles.sectionTitle}>처리내역</h3>
                {selectedOrder.logs.length === 0 ? (
                  <div style={styles.empty}>아직 처리내역이 없습니다.</div>
                ) : (
                  selectedOrder.logs.map((log) => (
                    <div key={log.id} style={styles.logItem}>
                      <div style={styles.logTop}>
                        <span style={styles.logSeq}>#{log.seq}차</span>
                        <span style={styles.logDate}>{log.createdAt}</span>
                      </div>
                      <div style={styles.logAction}>{log.action}</div>
                      {(log.part || log.memo) && (
                        <div style={styles.logMemo}>
                          {log.part && <span>부품: {log.part}</span>}
                          {log.memo && <span>메모: {log.memo}</span>}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span style={{ ...styles.badge, ...styles[`priority${priority}`] }}>
      {priorityLabel[priority]}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span style={{ ...styles.badge, ...styles[`status${status}`] }}>
      {statusLabel[status]}
    </span>
  );
}

