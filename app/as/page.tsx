"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";
import {
  type ExcelSheet,
  exportDateStamp,
  exportExcelWorkbook,
} from "@/app/_lib/excelExport";
import { getCurrentOrgTeam } from "@/app/_lib/currentOrg";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { styles } from "@/app/_modules/as/styles";

type Priority = "LOW" | "MID" | "HIGH";
type Status = "OPEN" | "IN_PROGRESS" | "CLOSED";
type Tab = "active" | "history" | "equipment";

type ServiceLog = {
  id: number;
  seq: number;
  action: string;
  part: string;
  memo: string;
  createdAt: string;
  createdBy: string | null;
  handlerName: string;
  handlerTeam: string;
};

type WorkOrder = {
  id: number;
  woNo: string;
  equipmentOrderId: number | null;
  serialNo: string;
  customer: string;
  contactName: string;
  contactPhone: string;
  model: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  logs: ServiceLog[];
};

type WorkOrderForm = {
  woNo: string;
  equipmentOrderId: string;
  serialNo: string;
  customer: string;
  contactName: string;
  contactPhone: string;
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
  customer_equipment_id?: number | null;
  serial_no?: string | null;
  customer: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  model: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

type ServiceLogRow = {
  id: number;
  work_order_id: number;
  seq: number;
  action: string;
  part: string | null;
  memo: string | null;
  created_at: string | null;
  created_by: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  team: string | null;
};

type CustomerOption = {
  id: number;
  name: string;
  category?: string | null;
};

type CustomerContactOption = {
  id: number;
  customer_id: number;
  name: string;
  phone: string | null;
};

type CustomerEquipment = {
  id: number;
  customerId: number | null;
  customer: string;
  model: string;
  serialNo: string;
  deliveredOn: string;
  location: string;
  contactName: string;
  contactPhone: string;
  note: string;
};

type CustomerEquipmentRow = {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  model: string | null;
  serial_no?: string | null;
  delivered_on: string | null;
  location: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  note: string | null;
};

type InsertResult = {
  data: unknown;
  error: { message: string } | null;
};

type InsertTable = {
  insert: (payload: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => Promise<InsertResult>;
    };
  };
};

const todayLabel = new Date().toISOString().slice(0, 10);
const supabase = createSupabaseBrowser();

const emptyOrderForm: WorkOrderForm = {
  woNo: "",
  equipmentOrderId: "",
  serialNo: "",
  customer: "",
  contactName: "",
  contactPhone: "",
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


const TECH_1_MEMBERS = ["한차현", "한재영", "권영일", "김학", "박상현"];
const TEAM_LEAD_NAMES = [
  "신상민",
  "신영호",
  "정대용",
  "서중석",
  "한차현",
  "이승준",
  "장동철",
  "권현진",
  "김혜정",
  "이양로",
];

function getEquipmentLabel(order: CustomerEquipment) {
  return [
    order.customer,
    order.model,
    order.serialNo,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getEquipmentOptionValue(order: CustomerEquipment) {
  return [order.model, order.serialNo].filter(Boolean).join(" / ");
}

function orderMatchesEquipment(order: WorkOrder, equipment: CustomerEquipment) {
  const workOrderSerial = order.serialNo.trim().toLowerCase();
  const equipmentSerial = equipment.serialNo.trim().toLowerCase();

  return (
    order.equipmentOrderId === equipment.id ||
    Boolean(workOrderSerial && equipmentSerial && workOrderSerial === equipmentSerial)
  );
}

function createAsSummarySheet(orders: WorkOrder[]): ExcelSheet {
  return {
    name: "A/S 히스토리",
    widths: [100, 95, 150, 140, 220, 80, 80, 90, 90, 90],
    rows: [
      ["A/S 관리 히스토리"],
      [""],
      [
        "접수일",
        "작업번호",
        "업체명",
        "장비/모델",
        "제목",
        "우선순위",
        "상태",
        "처리건수",
        "최종수정",
        "완료여부",
      ],
      ...orders.map((order) => [
        order.createdAt,
        order.woNo,
        order.customer,
        order.model,
        order.title,
        priorityLabel[order.priority],
        statusLabel[order.status],
        order.logs.length,
        order.updatedAt,
        order.status === "CLOSED" ? "완료" : "진행",
      ]),
    ],
  };
}

function createAsDetailSheet(order: WorkOrder): ExcelSheet {
  return {
    name: `${order.createdAt.slice(2).replaceAll("-", "")}_${order.woNo}`,
    widths: [110, 110, 150, 220, 110, 220],
    rows: [
      ["A/S 작업지시서"],
      [""],
      ["항목", "내용"],
      ["작업번호", order.woNo],
      ["업체명", order.customer],
      ["장비/모델", order.model],
      ["Serial No", order.serialNo],
      ["제목", order.title],
      ["우선순위", priorityLabel[order.priority]],
      ["상태", statusLabel[order.status]],
      ["접수일", order.createdAt],
      ["최종수정", order.updatedAt],
      ["증상/요청사항", order.description],
      [""],
      ["차수", "일자", "처리자", "조치내용", "부품", "메모"],
      ...order.logs.map((log) => [
        `${log.seq}차`,
        log.createdAt,
        [log.handlerName, log.handlerTeam].filter(Boolean).join(" / "),
        log.action,
        log.part,
        log.memo,
      ]),
    ],
  };
}

export default function AsPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("active");
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [equipmentOrders, setEquipmentOrders] = useState<CustomerEquipment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [orderForm, setOrderForm] = useState<WorkOrderForm>(emptyOrderForm);
  const [logForm, setLogForm] = useState<LogForm>(emptyLogForm);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [contactOptions, setContactOptions] = useState<CustomerContactOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [asEquipmentLinkReady, setAsEquipmentLinkReady] = useState(true);

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
        order.serialNo,
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

  const visibleEquipmentOrders = useMemo(() => {
    const text = equipmentQuery.trim().toLowerCase();

    return equipmentOrders.filter((equipment) => {
      if (!text) return true;

      const relatedOrders = orders.filter((order) =>
        orderMatchesEquipment(order, equipment)
      );
      return [
        equipment.customer,
        equipment.model,
        equipment.serialNo,
        equipment.deliveredOn,
        equipment.location,
        equipment.contactName,
        equipment.contactPhone,
        equipment.note,
        ...relatedOrders.flatMap((order) => [
          order.woNo,
          order.title,
          order.description,
          ...order.logs.flatMap((log) => [log.action, log.part, log.memo]),
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [equipmentOrders, equipmentQuery, orders]);

  const selectedEquipment =
    visibleEquipmentOrders.find((equipment) => equipment.id === selectedEquipmentId) ||
    visibleEquipmentOrders[0] ||
    null;

  const selectedEquipmentOrders = selectedEquipment
    ? orders.filter((order) => orderMatchesEquipment(order, selectedEquipment))
    : [];

  const currentName =
    typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
  const storedTeam =
    typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
  const currentTeam = getCurrentOrgTeam(currentName, storedTeam);
  const currentRole =
    typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
  const isAdmin = currentRole === "admin";
  const isLeadOrAbove =
    isAdmin ||
    currentRole === "lead" ||
    currentRole === "executive" ||
    TEAM_LEAD_NAMES.includes(currentName);
  const isSalesTeam = currentTeam === "국내영업" || currentTeam === "해외영업";
  const isTech1Member = currentTeam === "기술 1팀" || TECH_1_MEMBERS.includes(currentName);
  const canCreateWorkOrder = isLeadOrAbove || isSalesTeam;
  const canDeleteSelectedOrder = Boolean(
    selectedOrder && (isAdmin || selectedOrder.createdBy === currentUserId)
  );
  const canHandleSelectedOrder = Boolean(
    selectedOrder && selectedOrder.status !== "CLOSED" && (isAdmin || isTech1Member)
  );
  const selectedCustomerOption = customerOptions.find(
    (customer) => customer.name === orderForm.customer
  );
  const filteredContactOptions = contactOptions.filter((contact) => {
    if (!selectedCustomerOption) return false;
    return contact.customer_id === selectedCustomerOption.id;
  });
  const filteredEquipmentOptions = equipmentOrders.filter((equipment) => {
    if (!selectedCustomerOption) return false;
    return (
      equipment.customerId === selectedCustomerOption.id ||
      equipment.customer === selectedCustomerOption.name
    );
  });

  async function loadOrders() {
    setLoading(true);
    setLoadError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || "");

    const orderSelectBase =
      "id,wo_no,customer,contact_name,contact_phone,model,title,description,priority,status,created_at,updated_at,created_by";
    const orderSelectWithEquipment = `${orderSelectBase},customer_equipment_id,serial_no`;
    const primaryOrderResult = await supabase
      .from("as_work_orders")
      .select(orderSelectWithEquipment)
      .order("updated_at", { ascending: false });

    let orderRows = primaryOrderResult.data as WorkOrderRow[] | null;
    if (primaryOrderResult.error) {
      const fallbackOrderResult = await supabase
        .from("as_work_orders")
        .select(orderSelectBase)
        .order("updated_at", { ascending: false });

      if (fallbackOrderResult.error) {
        setLoadError("A/S 저장 테이블을 불러오지 못했습니다.");
        setLoading(false);
        return;
      }

      setAsEquipmentLinkReady(false);
      orderRows = fallbackOrderResult.data as WorkOrderRow[] | null;
    } else {
      setAsEquipmentLinkReady(true);
    }

    const { data: logRows, error: logError } = await supabase
      .from("as_service_logs")
      .select("id,work_order_id,seq,action,part,memo,created_at,created_by")
      .order("seq", { ascending: false });

    if (logError) {
      setLoadError("A/S 처리내역을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: customerRows } = await supabase
      .from("customers")
      .select("id,name,category")
      .eq("category", "customer")
      .order("name", { ascending: true });

    const { data: contactRows } = await supabase
      .from("customer_contacts")
      .select("id,customer_id,name,phone")
      .order("name", { ascending: true });

    const { data: equipmentRows } = await supabase
      .from("customer_equipments")
      .select(
        [
          "id",
          "customer_id",
          "customer_name",
          "model",
          "serial_no",
          "delivered_on",
          "location",
          "contact_name",
          "contact_phone",
          "note",
        ].join(",")
      )
      .order("customer_name", { ascending: true })
      .order("model", { ascending: true })
      .limit(200);

    const logUserIds = Array.from(
      new Set(
        ((logRows || []) as ServiceLogRow[])
          .map((log) => log.created_by)
          .filter(Boolean) as string[]
      )
    );
    const { data: profileRows } =
      logUserIds.length > 0
        ? await supabase.from("profiles").select("id,name,team").in("id", logUserIds)
        : { data: [] as ProfileRow[] };
    const profilesById = new Map(
      ((profileRows || []) as ProfileRow[]).map((profile) => [profile.id, profile])
    );

    const logsByOrder = new Map<number, ServiceLog[]>();
    ((logRows || []) as ServiceLogRow[]).forEach((log) => {
      const handler = log.created_by ? profilesById.get(log.created_by) : null;
      const nextLog: ServiceLog = {
        id: log.id,
        seq: log.seq,
        action: log.action,
        part: log.part || "",
        memo: log.memo || "",
        createdAt: (log.created_at || todayLabel).slice(0, 10),
        createdBy: log.created_by,
        handlerName: handler?.name || "",
        handlerTeam: handler?.team || "",
      };
      logsByOrder.set(log.work_order_id, [
        nextLog,
        ...(logsByOrder.get(log.work_order_id) || []),
      ]);
    });

    const mappedEquipmentOrders = ((equipmentRows || []) as unknown as CustomerEquipmentRow[]).map(
      (order) => ({
        id: order.id,
        customerId: order.customer_id || null,
        customer: order.customer_name || "",
        model: order.model || "",
        serialNo: order.serial_no || "",
        deliveredOn: (order.delivered_on || "").slice(0, 10),
        location: order.location || "",
        contactName: order.contact_name || "",
        contactPhone: order.contact_phone || "",
        note: order.note || "",
      })
    );

    const mappedOrders = ((orderRows || []) as WorkOrderRow[]).map((order) => ({
      id: order.id,
      woNo: order.wo_no,
      equipmentOrderId: order.customer_equipment_id || null,
      serialNo: order.serial_no || "",
      customer: order.customer || "",
      contactName: order.contact_name || "",
      contactPhone: order.contact_phone || "",
      model: order.model || "",
      title: order.title,
      description: order.description || "",
      priority: order.priority,
      status: order.status,
      createdAt: (order.created_at || todayLabel).slice(0, 10),
      updatedAt: (order.updated_at || todayLabel).slice(0, 10),
      createdBy: order.created_by,
      logs: logsByOrder.get(order.id) || [],
    }));

    setOrders(mappedOrders);
    setEquipmentOrders(mappedEquipmentOrders);
    setCustomerOptions((customerRows || []) as CustomerOption[]);
    setContactOptions((contactRows || []) as CustomerContactOption[]);
    setSelectedId((current) => {
      if (current && mappedOrders.some((order) => order.id === current)) {
        return current;
      }
      return mappedOrders[0]?.id || null;
    });
    setSelectedEquipmentId((current) => {
      if (current && mappedEquipmentOrders.some((order) => order.id === current)) {
        return current;
      }
      return mappedEquipmentOrders[0]?.id || null;
    });
    setLoading(false);
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateViewport = () => setIsMobile(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    void Promise.resolve().then(() => loadOrders());

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  function updateOrder<K extends keyof WorkOrderForm>(
    key: K,
    value: WorkOrderForm[K]
  ) {
    setOrderForm((current) => ({ ...current, [key]: value }));
  }

  function handleCustomerChange(value: string) {
    setOrderForm((current) => ({
      ...current,
      customer: value,
      equipmentOrderId: "",
      model: "",
      serialNo: "",
      contactName: "",
      contactPhone: "",
    }));
  }

  function handleContactNameChange(value: string) {
    const matchedContact = filteredContactOptions.find((contact) => contact.name === value);

    setOrderForm((current) => ({
      ...current,
      contactName: value,
      contactPhone: matchedContact?.phone || current.contactPhone,
    }));
  }

  function handleEquipmentInputChange(value: string) {
    const normalized = value.trim();
    const matchedEquipment = filteredEquipmentOptions.find(
      (equipment) =>
        getEquipmentOptionValue(equipment) === value ||
        equipment.model === normalized ||
        equipment.serialNo === normalized
    );

    setOrderForm((current) => ({
      ...current,
      equipmentOrderId: matchedEquipment ? String(matchedEquipment.id) : "",
      customer: matchedEquipment?.customer || current.customer,
      model: matchedEquipment?.model || value,
      serialNo: matchedEquipment?.serialNo || current.serialNo,
      contactName: matchedEquipment?.contactName || current.contactName,
      contactPhone: matchedEquipment?.contactPhone || current.contactPhone,
      title:
        matchedEquipment && !current.title
          ? `${matchedEquipment.model || matchedEquipment.customer} A/S 요청`
          : current.title,
    }));
  }

  function updateLog<K extends keyof LogForm>(key: K, value: LogForm[K]) {
    setLogForm((current) => ({ ...current, [key]: value }));
  }

  async function addWorkOrder() {
    if (!canCreateWorkOrder) {
      alert("A/S 작업지시는 각 팀장급 이상 또는 영업팀만 등록할 수 있습니다.");
      return;
    }

    const woNo = orderForm.woNo.trim();
    const customer = orderForm.customer.trim();
    const contactName = orderForm.contactName.trim();
    const contactPhone = orderForm.contactPhone.trim();
    const model = orderForm.model.trim();
    const serialNo = orderForm.serialNo.trim();
    const title = orderForm.title.trim();

    if (!woNo || !customer || !model || !title) {
      alert("번호, 업체명, 장비/모델, 제목은 필수입니다.");
      return;
    }

    const insertPayload: Record<string, unknown> = {
      wo_no: woNo,
      customer,
      contact_name: contactName,
      contact_phone: contactPhone,
      model,
      title,
      description: orderForm.description.trim(),
      priority: orderForm.priority,
      status: "OPEN",
    };

    if (asEquipmentLinkReady) {
      insertPayload.customer_equipment_id = orderForm.equipmentOrderId
        ? Number(orderForm.equipmentOrderId)
        : null;
      insertPayload.serial_no = serialNo || null;
    }

    const selectColumns = asEquipmentLinkReady
      ? "id,wo_no,customer_equipment_id,serial_no,customer,contact_name,contact_phone,model,title,description,priority,status,created_at,updated_at,created_by"
      : "id,wo_no,customer,contact_name,contact_phone,model,title,description,priority,status,created_at,updated_at,created_by";

    const asWorkOrdersTable = supabase.from("as_work_orders") as unknown as InsertTable;
    const insertResult = await asWorkOrdersTable
      .insert(insertPayload)
      .select(selectColumns)
      .single();
    const data = insertResult.data as WorkOrderRow | null;
    const error = insertResult.error;

    if (error || !data) {
      alert(error?.message || "작업지시 등록에 실패했습니다.");
      return;
    }

    const row = data;
    const nextOrder: WorkOrder = {
      id: row.id,
      woNo: row.wo_no,
      equipmentOrderId: row.customer_equipment_id || null,
      serialNo: row.serial_no || serialNo,
      customer: row.customer || "",
      contactName: row.contact_name || "",
      contactPhone: row.contact_phone || "",
      model: row.model || "",
      title: row.title,
      description: row.description || "",
      priority: row.priority,
      status: row.status,
      createdAt: (row.created_at || todayLabel).slice(0, 10),
      updatedAt: (row.updated_at || todayLabel).slice(0, 10),
      createdBy: row.created_by,
      logs: [],
    };

    setOrders((current) => [nextOrder, ...current]);
    setSelectedId(nextOrder.id);
    setOrderForm(emptyOrderForm);
    setTab("active");
  }

  async function addServiceLog() {
    if (!selectedOrder) return;
    if (!canHandleSelectedOrder) {
      alert("처리내역은 기술 1팀 또는 관리자만 추가할 수 있습니다.");
      return;
    }

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
      .select("id,work_order_id,seq,action,part,memo,created_at,created_by")
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
      createdBy: row.created_by,
      handlerName: currentName,
      handlerTeam: currentTeam,
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
    if (!canHandleSelectedOrder) {
      alert("완료 처리는 기술 1팀 또는 관리자만 할 수 있습니다.");
      return;
    }
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
    if (!canDeleteSelectedOrder) {
      alert("작성자 또는 관리자만 삭제할 수 있습니다.");
      return;
    }
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

  function exportVisibleOrders() {
    if (visibleOrders.length === 0) {
      alert("다운로드할 A/S 내역이 없습니다.");
      return;
    }

    exportExcelWorkbook(`AS관리_${tab === "history" ? "히스토리" : "진행중"}_${exportDateStamp()}.xls`, [
      createAsSummarySheet(visibleOrders),
      ...visibleOrders.map(createAsDetailSheet),
    ]);
  }

  return (
    <main style={{ ...styles.page, ...(isMobile ? styles.pageMobile : {}) }}>
      <section style={{ ...styles.container, ...(isMobile ? styles.containerMobile : {}) }}>
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

        <section style={{ ...styles.summaryGrid, ...(isMobile ? styles.summaryGridMobile : {}) }}>
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

        <section style={{ ...styles.layout, ...(isMobile ? styles.layoutMobile : {}) }}>
          <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
            <h2 style={styles.panelTitle}>작업지시 등록</h2>
            <p style={styles.panelHint}>기존 A/S 앱의 필수 항목 기준입니다.</p>

            <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
              <Field label="작업지시서 번호">
                <input
                  value={orderForm.woNo}
                  onChange={(event) => updateOrder("woNo", event.target.value)}
                  placeholder="예: AS-001"
                  style={styles.input}
                />
              </Field>

              <Field label="업체명">
                <select
                  value={orderForm.customer}
                  onChange={(event) => handleCustomerChange(event.target.value)}
                  style={styles.input}
                >
                  <option value="">업체 선택</option>
                  {customerOptions.map((customer) => (
                    <option key={customer.id} value={customer.name}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="관련 장비">
                <input
                  value={orderForm.model}
                  onChange={(event) => handleEquipmentInputChange(event.target.value)}
                  placeholder={
                    selectedCustomerOption
                      ? "장비명/모델명 입력 또는 선택"
                      : "업체를 먼저 선택"
                  }
                  list="as-equipment-options"
                  style={styles.input}
                  disabled={!selectedCustomerOption}
                />
              </Field>

              <Field label="담당자">
                <select
                  value={orderForm.contactName}
                  onChange={(event) => handleContactNameChange(event.target.value)}
                  style={styles.input}
                  disabled={!selectedCustomerOption}
                >
                  <option value="">담당자 선택</option>
                  {filteredContactOptions.map((contact) => (
                    <option key={contact.id} value={contact.name}>
                      {[contact.name, contact.phone].filter(Boolean).join(" / ")}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="연락처">
                <input
                  value={orderForm.contactPhone}
                  onChange={(event) => updateOrder("contactPhone", event.target.value)}
                  placeholder="휴대폰 또는 내선"
                  style={styles.input}
                />
              </Field>

              <Field label="Serial No">
                <input
                  value={orderForm.serialNo}
                  onChange={(event) => updateOrder("serialNo", event.target.value)}
                  placeholder={
                    orderForm.equipmentOrderId
                      ? "선택 장비 Serial No"
                      : "직접 입력: 시리얼 번호"
                  }
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

            <datalist id="as-equipment-options">
              {filteredEquipmentOptions.map((equipment) => (
                <option
                  key={equipment.id}
                  value={getEquipmentOptionValue(equipment)}
                  label={getEquipmentLabel(equipment)}
                />
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

            {!canCreateWorkOrder && (
              <div style={styles.empty}>
                A/S 작업지시는 각 팀장급 이상 또는 영업팀만 등록할 수 있습니다.
              </div>
            )}

            <button
              style={{
                ...styles.primaryButton,
                opacity: canCreateWorkOrder ? 1 : 0.45,
                cursor: canCreateWorkOrder ? "pointer" : "not-allowed",
              }}
              onClick={addWorkOrder}
              disabled={!canCreateWorkOrder}
            >
              작업지시 등록
            </button>
          </div>

          <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
            <div style={styles.panelTopRow}>
              <h2 style={styles.panelTitle}>A/S 목록</h2>
              <button style={styles.exportButton} onClick={exportVisibleOrders}>
                엑셀
              </button>
            </div>

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
              <button
                style={tab === "equipment" ? styles.activeTab : styles.tab}
                onClick={() => setTab("equipment")}
              >
                장비이력
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
            {tab === "equipment" && (
              <input
                value={equipmentQuery}
                onChange={(event) => setEquipmentQuery(event.target.value)}
                placeholder="업체명, 장비명, Serial No 검색"
                style={{ ...styles.input, marginBottom: 12 }}
              />
            )}

            <div style={styles.orderList}>
              {tab === "equipment" ? (
                visibleEquipmentOrders.length === 0 ? (
                  <div style={styles.empty}>표시할 장비 이력이 없습니다.</div>
                ) : (
                  visibleEquipmentOrders.map((equipment) => {
                    const relatedCount = orders.filter((order) =>
                      orderMatchesEquipment(order, equipment)
                    ).length;

                    return (
                      <button
                        key={equipment.id}
                        style={
                          selectedEquipment?.id === equipment.id
                            ? styles.selectedOrderCard
                            : styles.orderCard
                        }
                        onClick={() => setSelectedEquipmentId(equipment.id)}
                      >
                        <div style={styles.orderTop}>
                          <span style={styles.woNo}>
                            납품 장비
                          </span>
                          <span style={styles.historyCount}>{relatedCount}건</span>
                        </div>
                        <div style={styles.orderTitle}>
                          {equipment.customer} / {equipment.model || "모델 미입력"}
                        </div>
                        <div style={styles.orderMeta}>
                          {[equipment.serialNo, equipment.location, equipment.deliveredOn]
                            .filter(Boolean)
                            .join(" · ") || "-"}
                        </div>
                      </button>
                    );
                  })
                )
              ) : visibleOrders.length === 0 ? (
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
                      {[order.customer, order.model, order.serialNo]
                        .filter(Boolean)
                        .join(" / ")}
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

        <section style={{ ...styles.detailPanel, ...(isMobile ? styles.detailPanelMobile : {}) }}>
          {tab === "equipment" ? (
            !selectedEquipment ? (
              <div style={styles.empty}>장비를 선택하세요.</div>
            ) : (
              <>
                <div style={{ ...styles.detailHeader, ...(isMobile ? styles.detailHeaderMobile : {}) }}>
                  <div>
                    <div style={styles.detailMeta}>
                      납품 장비 {selectedEquipment.deliveredOn ? `/ ${selectedEquipment.deliveredOn}` : ""}
                    </div>
                    <h2 style={styles.detailTitle}>
                      {selectedEquipment.customer} /{" "}
                      {selectedEquipment.model || "모델 미입력"}
                    </h2>
                  </div>
                  <div style={styles.detailActions}>
                    <span style={styles.equipmentPill}>
                      Serial {selectedEquipment.serialNo || "-"}
                    </span>
                  </div>
                </div>

                <div style={styles.equipmentInfoGrid}>
                  <InfoBox label="담당자" value={selectedEquipment.contactName || "-"} />
                  <InfoBox label="연락처" value={selectedEquipment.contactPhone || "-"} />
                  <InfoBox label="설치/사용 위치" value={selectedEquipment.location || "-"} />
                </div>

                {selectedEquipment.note && (
                  <div style={styles.description}>{selectedEquipment.note}</div>
                )}

                <div style={styles.logList}>
                  <h3 style={styles.sectionTitle}>장비 A/S 이력</h3>
                  {selectedEquipmentOrders.length === 0 ? (
                    <div style={styles.empty}>이 장비에 연결된 A/S 이력이 없습니다.</div>
                  ) : (
                    selectedEquipmentOrders.map((order) => (
                      <div key={order.id} style={styles.historyBlock}>
                        <div style={styles.orderTop}>
                          <div>
                            <div style={styles.woNo}>{order.woNo}</div>
                            <div style={styles.orderTitle}>{order.title}</div>
                            <div style={styles.orderMeta}>
                              {order.createdAt} · {statusLabel[order.status]} ·{" "}
                              {priorityLabel[order.priority]}
                            </div>
                          </div>
                          <StatusBadge status={order.status} />
                        </div>

                        {order.logs.length === 0 ? (
                          <div style={{ ...styles.empty, marginTop: 10 }}>
                            처리내역이 없습니다.
                          </div>
                        ) : (
                          <div style={styles.compactTimeline}>
                            {order.logs.map((log) => (
                              <div key={log.id} style={styles.compactTimelineItem}>
                                <strong>{log.createdAt}</strong>
                                <span>{log.action}</span>
                                {(log.part || log.memo) && (
                                  <em>
                                    {[log.part && `부품 ${log.part}`, log.memo]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </em>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )
          ) : !selectedOrder ? (
            <div style={styles.empty}>작업지시를 선택하세요.</div>
          ) : (
            <>
              <div style={{ ...styles.detailHeader, ...(isMobile ? styles.detailHeaderMobile : {}) }}>
                <div>
                  <div style={styles.detailMeta}>
                    {selectedOrder.woNo} / {selectedOrder.customer} / {selectedOrder.model}
                  </div>
                  {selectedOrder.serialNo && (
                    <div style={styles.detailMeta}>Serial No {selectedOrder.serialNo}</div>
                  )}
                  {(selectedOrder.contactName || selectedOrder.contactPhone) && (
                    <div style={styles.detailMeta}>
                      담당자 {selectedOrder.contactName || "-"} / 연락처{" "}
                      {selectedOrder.contactPhone || "-"}
                    </div>
                  )}
                  <h2 style={styles.detailTitle}>{selectedOrder.title}</h2>
                </div>

                <div style={{ ...styles.detailActions, ...(isMobile ? styles.detailActionsMobile : {}) }}>
                  <PriorityBadge priority={selectedOrder.priority} />
                  <StatusBadge status={selectedOrder.status} />
                  {canHandleSelectedOrder && (
                    <button style={styles.ghostButton} onClick={closeOrder}>
                      완료 처리
                    </button>
                  )}
                  {canDeleteSelectedOrder && (
                    <button style={styles.dangerButton} onClick={deleteOrder}>
                      삭제
                    </button>
                  )}
                </div>
              </div>

              {selectedOrder.description && (
                <div style={styles.description}>{selectedOrder.description}</div>
              )}

              {canHandleSelectedOrder && (
                <div style={styles.logForm}>
                  <Field label="조치 내용">
                    <input
                      value={logForm.action}
                      onChange={(event) => updateLog("action", event.target.value)}
                      placeholder="예: 부품 교체 / 점검 완료 / 펌웨어 업데이트"
                      style={styles.input}
                    />
                  </Field>

                  <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
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
                      <div style={{ ...styles.logTop, ...(isMobile ? styles.logTopMobile : {}) }}>
                        <span style={styles.logSeq}>#{log.seq}차</span>
                        <span style={styles.logDate}>
                          {[
                            log.createdAt,
                            log.handlerName ? `처리자 ${log.handlerName}` : "",
                            log.handlerTeam,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.equipmentInfoBox}>
      <span style={styles.equipmentInfoLabel}>{label}</span>
      <strong style={styles.equipmentInfoValue}>{value}</strong>
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

