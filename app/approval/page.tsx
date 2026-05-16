"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ORG_MEMBER_MAP,
  TEAM_ORDER,
  getCurrentOrgTeam,
} from "@/app/_lib/currentOrg";
import {
  type ExcelSheet,
  exportDateStamp,
  exportExcelWorkbook,
} from "@/app/_lib/excelExport";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type FieldType = "text" | "date" | "select" | "textarea";
type ApprovalStatus = "pending" | "approved" | "rejected";
type EquipmentStageKey = "manufacturingRequest" | "purchaseRequest" | "qa";

type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  span?: 1 | 2;
};

type TableColumn = {
  key: string;
  label: string;
  width?: string;
};

type TableDef = {
  key: string;
  title: string;
  columns: TableColumn[];
  initialRows: number;
};

type TemplateDef = {
  key: string;
  title: string;
  category: string;
  description: string;
  approvalRoles: string[];
  fields: FieldDef[];
  tables: TableDef[];
};

type ProfileRow = {
  id: string;
  name: string | null;
  team: string | null;
  role: string | null;
};

type ApprovalLineRow = {
  id: number;
  document_id: number;
  step_order: number;
  role_label: string;
  approver_id: string;
  approver_name: string;
  approver_team: string | null;
  status: ApprovalStatus;
  acted_at: string | null;
  memo: string | null;
};

type ApprovalDocumentRow = {
  id: number;
  template_key: string;
  template_title: string;
  title: string;
  status: ApprovalStatus;
  requester_id: string;
  requester_name: string;
  requester_team: string | null;
  current_step: number;
  form_data: Record<string, unknown>;
  submitted_at: string;
  completed_at: string | null;
  equipment_order_id?: number | null;
  equipment_stage_key?: EquipmentStageKey | null;
  created_at: string;
  updated_at: string;
  approval_lines?: ApprovalLineRow[];
};

type NotificationRow = {
  id: number;
  user_id: string;
  document_id: number;
  message: string;
  read_at: string | null;
  created_at: string;
};

type ApproverSlot = {
  roleLabel: string;
  approverId: string;
};

type EquipmentOrderRow = {
  id: number;
  category: "domestic" | "overseas" | "parts";
  order_date: string;
  country: string | null;
  customer: string;
  model: string;
  owner_name: string;
};

const supabase = createSupabaseBrowser();
const today = new Date().toISOString().slice(0, 10);
const DEFAULT_APPROVER_COUNT = 3;

const equipmentStageByTemplate: Partial<Record<string, EquipmentStageKey>> = {
  manufacturing_request: "manufacturingRequest",
  purchase_request: "purchaseRequest",
  inspection_request: "qa",
};

const equipmentDocumentColumnByStage: Record<EquipmentStageKey, string> = {
  manufacturingRequest: "manufacturing_document_id",
  purchaseRequest: "purchase_document_id",
  qa: "qa_document_id",
};

const equipmentDateColumnByStage: Record<EquipmentStageKey, string> = {
  manufacturingRequest: "manufacturing_request_approved_on",
  purchaseRequest: "purchase_request_approved_on",
  qa: "qa_approved_on",
};

const commonItemColumns: TableColumn[] = [
  { key: "name", label: "품명" },
  { key: "spec", label: "규격" },
  { key: "unit", label: "단위", width: "88px" },
  { key: "qty", label: "수량", width: "88px" },
  { key: "memo", label: "비고" },
];

const templates: TemplateDef[] = [
  {
    key: "purchase_request",
    title: "구매의뢰서",
    category: "구매",
    description: "장비, 원자재, 공용품 구매 요청",
    approvalRoles: ["담당", "팀장", "본부장", "부사장", "대표이사"],
    fields: [
      { key: "controlNo", label: "부서 관리 번호", type: "text" },
      { key: "client", label: "수주처", type: "text" },
      { key: "requester", label: "의뢰인", type: "text" },
      { key: "equipment", label: "장비명", type: "text" },
      { key: "serialNo", label: "S/N", type: "text" },
      { key: "deliveryPlace", label: "입고장소", type: "text" },
      { key: "requestDate", label: "의뢰일", type: "date" },
      { key: "dueDate", label: "입고요청일", type: "date" },
      {
        key: "usageType",
        label: "사용구분",
        type: "select",
        options: ["원자재", "재공품", "공용품", "판매", "무상", "사무용품", "기타"],
      },
      { key: "reference", label: "비교자료", type: "textarea", span: 2 },
    ],
    tables: [{ key: "items", title: "구매 품목", columns: commonItemColumns, initialRows: 3 }],
  },
  {
    key: "draft",
    title: "기안서",
    category: "공통",
    description: "사내 의사결정, 보고, 협조 요청",
    approvalRoles: ["담당", "차장", "팀장", "본부장", "부사장", "사장"],
    fields: [
      { key: "documentNo", label: "문서번호", type: "text" },
      { key: "classification", label: "분류기호", type: "text" },
      { key: "processingPeriod", label: "처리기간", type: "text" },
      { key: "effectiveDate", label: "시행일자", type: "date" },
      { key: "draftDate", label: "기안일자", type: "date" },
      { key: "owner", label: "기안책임자", type: "text" },
      { key: "recipient", label: "수신", type: "text" },
      { key: "via", label: "경유", type: "text" },
      { key: "sender", label: "발신", type: "text" },
      { key: "reference", label: "참조", type: "text" },
      { key: "title", label: "제목", type: "text", span: 2 },
      { key: "content", label: "내용", type: "textarea", span: 2 },
    ],
    tables: [],
  },
  {
    key: "outsourcing_request",
    title: "외주의뢰서",
    category: "구매",
    description: "외주 제작, 가공, 협력사 의뢰",
    approvalRoles: ["담당", "팀장", "본부장", "부사장", "대표이사"],
    fields: [
      { key: "controlNo", label: "부서 관리 번호", type: "text" },
      { key: "client", label: "수주처", type: "text" },
      { key: "requester", label: "의뢰인", type: "text" },
      { key: "equipment", label: "장비명", type: "text" },
      { key: "serialNo", label: "S/N", type: "text" },
      { key: "deliveryPlace", label: "입고장소", type: "text" },
      { key: "requestDate", label: "의뢰일", type: "date" },
      { key: "dueDate", label: "입고요청일", type: "date" },
      {
        key: "usageType",
        label: "사용구분",
        type: "select",
        options: ["원자재", "재공품", "공용품", "판매", "무상", "기타"],
      },
      { key: "reference", label: "비교자료", type: "textarea", span: 2 },
    ],
    tables: [
      {
        key: "items",
        title: "외주 품목",
        columns: [
          { key: "name", label: "품명" },
          { key: "drawingNo", label: "도면번호" },
          { key: "unit", label: "단위", width: "88px" },
          { key: "qty", label: "수량", width: "88px" },
          { key: "memo", label: "비고" },
        ],
        initialRows: 3,
      },
    ],
  },
  {
    key: "manufacturing_request",
    title: "제조요구서",
    category: "제조",
    description: "제품 제조 요청과 생산 조건 정리",
    approvalRoles: ["담당", "팀장", "이사", "부사장", "사장"],
    fields: [
      {
        key: "orderCategory",
        label: "현황 구분",
        type: "select",
        options: ["국내 장비", "해외 장비", "부품"],
      },
      { key: "orderDate", label: "수주일", type: "date" },
      { key: "country", label: "국가/구분", type: "text" },
      { key: "productName", label: "제품명", type: "text" },
      { key: "qty", label: "수량", type: "text" },
      { key: "createdDate", label: "작성일", type: "date" },
      { key: "client", label: "발주처", type: "text" },
      { key: "deliveryDate", label: "납기", type: "date" },
      { key: "documentNo", label: "문서 NO", type: "text" },
      { key: "serialNo", label: "Serial No", type: "text" },
      { key: "power", label: "전원", type: "text" },
      { key: "productSpec", label: "제품규격", type: "textarea", span: 2 },
      { key: "additional", label: "추가사항", type: "textarea", span: 2 },
      { key: "reference", label: "참고사항", type: "textarea", span: 2 },
      { key: "attachment", label: "첨부", type: "text", span: 2 },
    ],
    tables: [{ key: "specs", title: "Specification", columns: [{ key: "content", label: "내용" }], initialRows: 4 }],
  },
  {
    key: "inspection_request",
    title: "제품검사요청서",
    category: "QA",
    description: "생산 완료 후 제품 검사 요청",
    approvalRoles: ["담당", "팀장"],
    fields: [
      { key: "client", label: "발주처", type: "text" },
      { key: "contact", label: "담당자", type: "text" },
      { key: "manufacturedDate", label: "제조완료일", type: "date" },
      { key: "inspectionDate", label: "검수 요청일", type: "date" },
      { key: "qaMemo", label: "QA 접수 메모", type: "textarea", span: 2 },
    ],
    tables: [
      {
        key: "products",
        title: "검사 대상",
        columns: [
          { key: "productName", label: "제품명" },
          { key: "modelName", label: "모델명" },
          { key: "serialNo", label: "S/N" },
          { key: "spec", label: "제품 규격" },
        ],
        initialRows: 3,
      },
    ],
  },
  {
    key: "expense_request",
    title: "지출품의서",
    category: "재무",
    description: "비용 지출 승인 요청",
    approvalRoles: ["담당", "팀장", "재무", "대표이사"],
    fields: [
      { key: "title", label: "제목", type: "text", span: 2 },
      { key: "expenseDate", label: "지출 예정일", type: "date" },
      { key: "vendor", label: "지출처", type: "text" },
      { key: "amount", label: "금액", type: "text" },
      { key: "paymentMethod", label: "지급방법", type: "select", options: ["계좌이체", "카드", "현금", "기타"] },
      { key: "purpose", label: "지출 사유", type: "textarea", span: 2 },
    ],
    tables: [{ key: "items", title: "지출 내역", columns: commonItemColumns, initialRows: 3 }],
  },
  {
    key: "vacation_request",
    title: "휴가신청서",
    category: "인사",
    description: "연차, 반차, 기타 휴가 신청",
    approvalRoles: ["신청자", "팀장", "인사"],
    fields: [
      { key: "applicant", label: "신청자", type: "text" },
      { key: "team", label: "부서", type: "text" },
      { key: "vacationType", label: "휴가구분", type: "select", options: ["연차", "오전반차", "오후반차", "경조", "공가", "기타"] },
      { key: "days", label: "일수", type: "text" },
      { key: "startDate", label: "시작일", type: "date" },
      { key: "endDate", label: "종료일", type: "date" },
      { key: "emergencyContact", label: "비상연락처", type: "text" },
      { key: "delegate", label: "업무 대행자", type: "text" },
      { key: "reason", label: "사유", type: "textarea", span: 2 },
    ],
    tables: [],
  },
  {
    key: "holiday_work_request",
    title: "휴일근무신청서",
    category: "인사",
    description: "휴일 또는 연장 근무 사전 신청",
    approvalRoles: ["신청자", "팀장", "인사"],
    fields: [
      { key: "applicant", label: "신청자", type: "text" },
      { key: "team", label: "부서", type: "text" },
      { key: "workDate", label: "근무일", type: "date" },
      { key: "workTime", label: "근무시간", type: "text", placeholder: "예: 09:00-13:00" },
      { key: "location", label: "근무장소", type: "text" },
      { key: "participants", label: "대상자", type: "text" },
      { key: "workContent", label: "업무내용", type: "textarea", span: 2 },
      { key: "reason", label: "근무사유", type: "textarea", span: 2 },
    ],
    tables: [],
  },
];

const templateMap = Object.fromEntries(templates.map((template) => [template.key, template]));

function createDefaultApproverSlots(count = DEFAULT_APPROVER_COUNT): ApproverSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    roleLabel: `결재 ${index + 1}`,
    approverId: "",
  }));
}

function getDisplayTeam(profile: ProfileRow) {
  return getCurrentOrgTeam(profile.name || "", profile.team || "");
}

function getProfileSortValue(profile: ProfileRow) {
  const name = profile.name || "";
  const team = getDisplayTeam(profile);
  const teamIndex = TEAM_ORDER.includes(team) ? TEAM_ORDER.indexOf(team) : 999;
  const orgInfo = ORG_MEMBER_MAP.get(name);
  const leaderWeight = orgInfo?.leader ? 0 : 1;

  return `${String(teamIndex).padStart(3, "0")}-${leaderWeight}-${name}`;
}

function createTableRows(table: TableDef) {
  return Array.from({ length: table.initialRows }, () =>
    Object.fromEntries(table.columns.map((column) => [column.key, ""]))
  );
}

function createEmptyFormData(template: TemplateDef) {
  const next: Record<string, unknown> = {};

  template.fields.forEach((field) => {
    if (field.type === "date") {
      next[field.key] = today;
      return;
    }

    next[field.key] = "";
  });

  template.tables.forEach((table) => {
    next[table.key] = createTableRows(table);
  });

  return next;
}

function applyCurrentUserFields(
  data: Record<string, unknown>,
  name: string,
  team: string,
  overwrite = false
) {
  const next = { ...data };

  [
    ["applicant", name],
    ["requester", name],
    ["owner", name],
    ["team", team],
  ].forEach(([key, value]) => {
    if (!value) return;
    if (overwrite || !next[key]) {
      next[key] = value;
    }
  });

  return next;
}

function getRows(value: unknown): Record<string, string>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, string> => row && typeof row === "object");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatShortDate(value?: string | null) {
  if (!value) return "";
  const [, month, day] = value.slice(0, 10).split("-");
  if (!month || !day) return value;
  return `${Number(month)}/${Number(day)}`;
}

function statusText(status: ApprovalStatus) {
  if (status === "approved") return "승인완료";
  if (status === "rejected") return "반려";
  return "진행중";
}

function deriveDocumentTitle(template: TemplateDef, data: Record<string, unknown>) {
  const candidates = [
    data.title,
    data.productName,
    data.equipment,
    data.client,
    data.vendor,
    data.applicant,
  ];

  const found = candidates.find((value) => typeof value === "string" && value.trim());
  return found ? `${template.title} - ${String(found).trim()}` : template.title;
}

function getFirstPendingLine(document: ApprovalDocumentRow) {
  const lines = [...(document.approval_lines || [])].sort((a, b) => a.step_order - b.step_order);
  return lines.find((line) => line.status === "pending") || null;
}

function formatExcelValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function getDocumentSheetName(document: ApprovalDocumentRow) {
  const date = formatDate(document.submitted_at).replaceAll("-", "").slice(2);
  return `${date}_${document.template_title}`.slice(0, 31);
}

function createApprovalListSheet(documents: ApprovalDocumentRow[]): ExcelSheet {
  return {
    name: "결재문서 목록",
    widths: [95, 120, 240, 85, 100, 90, 100, 110, 120],
    rows: [
      ["결재문서 히스토리"],
      [""],
      [
        "작성일",
        "문서종류",
        "제목",
        "작성자",
        "부서",
        "상태",
        "현재결재자",
        "최종승인일",
        "결재라인",
      ],
      ...documents.map((document) => {
        const pendingLine = getFirstPendingLine(document);

        return [
          formatDate(document.submitted_at),
          document.template_title,
          document.title,
          document.requester_name,
          document.requester_team || "",
          statusText(document.status),
          pendingLine ? `${pendingLine.approver_name} (${pendingLine.role_label})` : "",
          formatDate(document.completed_at),
          (document.approval_lines || [])
            .map((line) => `${line.role_label}:${line.approver_name}/${statusText(line.status)}`)
            .join(" → "),
        ];
      }),
    ],
  };
}

function createApprovalDocumentSheet(document: ApprovalDocumentRow): ExcelSheet {
  const template = templateMap[document.template_key] || null;
  const rows = [
    [document.template_title],
    [""],
    ["항목", "내용"],
    ["제목", document.title],
    ["상태", statusText(document.status)],
    ["작성자", document.requester_name],
    ["부서", document.requester_team || ""],
    ["작성일", formatDate(document.submitted_at)],
    ["최종승인일", formatDate(document.completed_at)],
    [""],
    ["결재순서", "결재자", "부서", "상태", "처리일"],
    ...(document.approval_lines || []).map((line) => [
      line.role_label,
      line.approver_name,
      line.approver_team || "",
      statusText(line.status),
      formatDate(line.acted_at),
    ]),
    [""],
    ["문서 항목", "입력값"],
    ...(template?.fields || []).map((field) => [
      field.label,
      formatExcelValue(document.form_data[field.key]),
    ]),
  ];

  (template?.tables || []).forEach((table) => {
    rows.push([""], [table.title], table.columns.map((column) => column.label));
    getRows(document.form_data[table.key]).forEach((item) => {
      rows.push(table.columns.map((column) => item[column.key] || ""));
    });
  });

  return {
    name: getDocumentSheetName(document),
    widths: [120, 180, 140, 100, 100, 120],
    rows,
  };
}

function getEquipmentOrderLabel(order: EquipmentOrderRow) {
  const categoryText =
    order.category === "domestic"
      ? "국내"
      : order.category === "overseas"
        ? order.country || "해외"
        : order.country || "부품";

  return `${formatShortDate(order.order_date)} · ${categoryText} · ${order.customer} · ${order.model}`;
}

function toEquipmentCategory(value: unknown): "domestic" | "overseas" | "parts" {
  if (value === "해외 장비") return "overseas";
  if (value === "부품") return "parts";
  return "domestic";
}

function getStringValue(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildEquipmentOrderFromManufacturing(
  data: Record<string, unknown>,
  currentName: string
) {
  const category = toEquipmentCategory(data.orderCategory);

  return {
    category,
    order_date:
      getStringValue(data, "orderDate") ||
      getStringValue(data, "createdDate") ||
      today,
    country:
      category === "domestic"
        ? null
        : getStringValue(data, "country") || null,
    customer:
      getStringValue(data, "client") ||
      getStringValue(data, "customer") ||
      "고객사 미입력",
    model:
      getStringValue(data, "productName") ||
      getStringValue(data, "equipment") ||
      "모델 미입력",
    owner_name:
      getStringValue(data, "owner") ||
      getStringValue(data, "requester") ||
      getStringValue(data, "applicant") ||
      currentName ||
      "담당자",
    shipment_scheduled_on: getStringValue(data, "deliveryDate") || null,
  };
}

export default function ApprovalPage() {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(templates[0].key);
  const selectedTemplate = templateMap[selectedTemplateKey] || templates[0];
  const [formData, setFormData] = useState<Record<string, unknown>>(() =>
    createEmptyFormData(selectedTemplate)
  );
  const [approverSlots, setApproverSlots] = useState<ApproverSlot[]>(() =>
    createDefaultApproverSlots()
  );
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [equipmentOrders, setEquipmentOrders] = useState<EquipmentOrderRow[]>([]);
  const [selectedEquipmentOrderId, setSelectedEquipmentOrderId] = useState("");
  const [documents, setDocuments] = useState<ApprovalDocumentRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [currentTeam, setCurrentTeam] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "mine" | "pending" | "history">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [message, setMessage] = useState("");

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) || documents[0] || null,
    [documents, selectedDocumentId]
  );

  const pendingForMe = useMemo(
    () =>
      documents.filter((document) => {
        const pendingLine = getFirstPendingLine(document);
        return document.status === "pending" && pendingLine?.approver_id === currentUserId;
      }),
    [documents, currentUserId]
  );

  const filteredDocuments = useMemo(() => {
    if (activeFilter === "mine") {
      return documents.filter((document) => document.requester_id === currentUserId);
    }

    if (activeFilter === "pending") {
      return pendingForMe;
    }

    if (activeFilter === "history") {
      return documents.filter((document) => document.status === "approved");
    }

    return documents;
  }, [activeFilter, currentUserId, documents, pendingForMe]);

  const sortedProfiles = useMemo(
    () => [...profiles].sort((a, b) => getProfileSortValue(a).localeCompare(getProfileSortValue(b), "ko")),
    [profiles]
  );

  const selectedEquipmentStage = equipmentStageByTemplate[selectedTemplate.key] || null;
  const shouldCreateEquipmentOrder = selectedTemplate.key === "manufacturing_request";
  const shouldSelectEquipmentOrder = Boolean(selectedEquipmentStage && !shouldCreateEquipmentOrder);

  const loadData = useCallback(async () => {
    setLoading(true);
    setSetupError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const storedName = typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
    const storedTeam = typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
    const currentOrgTeam = getCurrentOrgTeam(storedName, storedTeam);

    setCurrentUserId(user?.id || "");
    setCurrentName(storedName);
    setCurrentTeam(currentOrgTeam);
    setFormData((prev) => applyCurrentUserFields(prev, storedName, currentOrgTeam));

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,name,team,role")
      .order("name", { ascending: true });

    setProfiles((profileRows || []) as ProfileRow[]);

    const { data: equipmentRows } = await supabase
      .from("equipment_orders")
      .select("id,category,order_date,country,customer,model,owner_name")
      .order("order_date", { ascending: false })
      .limit(80);

    setEquipmentOrders((equipmentRows || []) as EquipmentOrderRow[]);

    const { data: documentRows, error: documentError } = await supabase
      .from("approval_documents")
      .select("*, approval_lines(*)")
      .order("created_at", { ascending: false });

    if (documentError) {
      setSetupError(
        "결재문서 테이블이 아직 준비되지 않았습니다. project-docs/supabase-approval-documents.sql 실행 후 다시 열어주세요."
      );
      setDocuments([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    const normalizedDocuments = ((documentRows || []) as ApprovalDocumentRow[]).map((document) => ({
      ...document,
      approval_lines: [...(document.approval_lines || [])].sort(
        (a, b) => a.step_order - b.step_order
      ),
    }));

    setDocuments(normalizedDocuments);
    setSelectedDocumentId((prev) => prev || normalizedDocuments[0]?.id || null);

    if (user?.id) {
      const { data: notificationRows } = await supabase
        .from("approval_notifications")
        .select("*")
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false });

      setNotifications((notificationRows || []) as NotificationRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [loadData]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateMobile = () => setIsMobile(mediaQuery.matches);

    updateMobile();
    mediaQuery.addEventListener("change", updateMobile);
    return () => mediaQuery.removeEventListener("change", updateMobile);
  }, []);

  function changeTemplate(templateKey: string) {
    const nextTemplate = templateMap[templateKey] || templates[0];
    setSelectedTemplateKey(templateKey);
    setFormData(applyCurrentUserFields(createEmptyFormData(nextTemplate), currentName, currentTeam, true));
    setApproverSlots(createDefaultApproverSlots());
    setSelectedEquipmentOrderId("");
    setMessage("");
  }

  function updateField(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function updateTableCell(table: TableDef, rowIndex: number, columnKey: string, value: string) {
    setFormData((prev) => {
      const rows = getRows(prev[table.key]);
      const nextRows = rows.map((row, index) =>
        index === rowIndex ? { ...row, [columnKey]: value } : row
      );

      return { ...prev, [table.key]: nextRows };
    });
  }

  function addTableRow(table: TableDef) {
    setFormData((prev) => ({
      ...prev,
      [table.key]: [
        ...getRows(prev[table.key]),
        Object.fromEntries(table.columns.map((column) => [column.key, ""])),
      ],
    }));
  }

  function removeTableRow(table: TableDef, rowIndex: number) {
    setFormData((prev) => {
      const rows = getRows(prev[table.key]);
      if (rows.length <= 1) return prev;
      return { ...prev, [table.key]: rows.filter((_, index) => index !== rowIndex) };
    });
  }

  function selectApprover(index: number, approverId: string) {
    setApproverSlots((prev) =>
      prev.map((slot, slotIndex) => (slotIndex === index ? { ...slot, approverId } : slot))
    );
  }

  function addApproverSlot() {
    setApproverSlots((prev) => [
      ...prev,
      { roleLabel: `결재 ${prev.length + 1}`, approverId: "" },
    ]);
  }

  function removeApproverSlot(index: number) {
    setApproverSlots((prev) =>
      prev
        .filter((_, slotIndex) => slotIndex !== index)
        .map((slot, slotIndex) => ({ ...slot, roleLabel: `결재 ${slotIndex + 1}` }))
    );
  }

  function getProfile(id: string) {
    return profiles.find((profile) => profile.id === id) || null;
  }

  async function submitDocument() {
    setMessage("");

    if (!currentUserId) {
      setMessage("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      return;
    }

    const selectedApprovers = approverSlots
      .map((slot, index) => ({ ...slot, stepOrder: index + 1, profile: getProfile(slot.approverId) }))
      .filter((slot) => slot.profile);

    if (selectedApprovers.length === 0) {
      setMessage("결재라인에서 최소 1명 이상 선택해 주세요.");
      return;
    }

    setSaving(true);

    const title = deriveDocumentTitle(selectedTemplate, formData);
    const linkedEquipmentOrderId =
      shouldSelectEquipmentOrder && selectedEquipmentOrderId
        ? Number(selectedEquipmentOrderId)
        : null;
    let createdEquipmentOrderId: number | null = null;

    if (shouldCreateEquipmentOrder) {
      const { data: createdOrder, error: orderError } = await supabase
        .from("equipment_orders")
        .insert(buildEquipmentOrderFromManufacturing(formData, currentName))
        .select("id")
        .single();

      if (orderError || !createdOrder) {
        setMessage(
          "현황판 수주 건을 만들지 못했습니다. 수주 현황 테이블과 권한을 확인해 주세요."
        );
        setSaving(false);
        return;
      }

      createdEquipmentOrderId = (createdOrder as { id: number }).id;
    }

    const finalEquipmentOrderId = createdEquipmentOrderId || linkedEquipmentOrderId;
    const documentPayload: Record<string, unknown> = {
      template_key: selectedTemplate.key,
      template_title: selectedTemplate.title,
      title,
      status: "pending",
      requester_id: currentUserId,
      requester_name: currentName || "작성자",
      requester_team: currentTeam || null,
      current_step: 1,
      form_data: formData,
    };

    if (finalEquipmentOrderId && selectedEquipmentStage) {
      documentPayload.equipment_order_id = finalEquipmentOrderId;
      documentPayload.equipment_stage_key = selectedEquipmentStage;
    }

    const { data: insertedDocument, error: documentError } = await supabase
      .from("approval_documents")
      .insert(documentPayload)
      .select()
      .single();

    if (documentError || !insertedDocument) {
      setMessage("문서를 저장하지 못했습니다. Supabase 테이블과 권한을 확인해 주세요.");
      setSaving(false);
      return;
    }

    const documentId = (insertedDocument as ApprovalDocumentRow).id;

    if (finalEquipmentOrderId && selectedEquipmentStage) {
      await supabase
        .from("equipment_orders")
        .update({
          [equipmentDocumentColumnByStage[selectedEquipmentStage]]: documentId,
        })
        .eq("id", finalEquipmentOrderId);
    }

    const linePayload = selectedApprovers.map((slot) => ({
      document_id: documentId,
      step_order: slot.stepOrder,
      role_label: slot.roleLabel,
      approver_id: slot.profile?.id || "",
      approver_name: slot.profile?.name || "결재자",
      approver_team: slot.profile?.team || null,
      status: "pending",
    }));

    const { error: lineError } = await supabase.from("approval_lines").insert(linePayload);

    if (lineError) {
      setMessage("결재라인 저장에 실패했습니다. 문서를 삭제하거나 다시 확인해 주세요.");
      setSaving(false);
      return;
    }

    await supabase.from("approval_notifications").insert(
      selectedApprovers.map((slot) => ({
        user_id: slot.profile?.id || "",
        document_id: documentId,
        message: `${currentName || "작성자"}님이 ${selectedTemplate.title} 결재라인에 지정했습니다.`,
      }))
    );

    setMessage("결재문서가 등록되었습니다.");
    setFormData(createEmptyFormData(selectedTemplate));
    setSelectedEquipmentOrderId("");
    setSaving(false);
    await loadData();
    setSelectedDocumentId(documentId);
  }

  async function approveSelectedDocument() {
    if (!selectedDocument || !currentUserId) return;
    const pendingLine = getFirstPendingLine(selectedDocument);

    if (!pendingLine || pendingLine.approver_id !== currentUserId) {
      setMessage("현재 결재 순서가 아닙니다.");
      return;
    }

    setSaving(true);
    setMessage("");

    await supabase
      .from("approval_lines")
      .update({ status: "approved", acted_at: new Date().toISOString() })
      .eq("id", pendingLine.id);

    const remainingLines = (selectedDocument.approval_lines || [])
      .filter((line) => line.id !== pendingLine.id && line.status === "pending")
      .sort((a, b) => a.step_order - b.step_order);

    if (remainingLines.length === 0) {
      const completedDate = new Date().toISOString();
      await supabase
        .from("approval_documents")
        .update({ status: "approved", completed_at: completedDate })
        .eq("id", selectedDocument.id);

      if (selectedDocument.equipment_order_id && selectedDocument.equipment_stage_key) {
        await supabase
          .from("equipment_orders")
          .update({
            [equipmentDateColumnByStage[selectedDocument.equipment_stage_key]]:
              completedDate.slice(0, 10),
          })
          .eq("id", selectedDocument.equipment_order_id);
      }

      await supabase.from("approval_notifications").insert({
        user_id: selectedDocument.requester_id,
        document_id: selectedDocument.id,
        message: `${selectedDocument.title} 최종 결재가 완료되었습니다.`,
      });
    } else {
      const nextLine = remainingLines[0];
      await supabase
        .from("approval_documents")
        .update({ current_step: nextLine.step_order })
        .eq("id", selectedDocument.id);

      await supabase.from("approval_notifications").insert({
        user_id: nextLine.approver_id,
        document_id: selectedDocument.id,
        message: `${selectedDocument.title} 결재 순서가 도착했습니다.`,
      });
    }

    await supabase
      .from("approval_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", currentUserId)
      .eq("document_id", selectedDocument.id)
      .is("read_at", null);

    setMessage("승인 처리되었습니다.");
    setSaving(false);
    await loadData();
  }

  async function rejectSelectedDocument() {
    if (!selectedDocument || !currentUserId) return;
    const pendingLine = getFirstPendingLine(selectedDocument);

    if (!pendingLine || pendingLine.approver_id !== currentUserId) {
      setMessage("현재 결재 순서가 아닙니다.");
      return;
    }

    setSaving(true);
    setMessage("");

    await supabase
      .from("approval_lines")
      .update({ status: "rejected", acted_at: new Date().toISOString() })
      .eq("id", pendingLine.id);

    await supabase
      .from("approval_documents")
      .update({ status: "rejected", completed_at: new Date().toISOString() })
      .eq("id", selectedDocument.id);

    await supabase.from("approval_notifications").insert({
      user_id: selectedDocument.requester_id,
      document_id: selectedDocument.id,
      message: `${selectedDocument.title} 문서가 반려되었습니다.`,
    });

    setMessage("반려 처리되었습니다.");
    setSaving(false);
    await loadData();
  }

  function exportApprovalList() {
    if (filteredDocuments.length === 0) {
      setMessage("다운로드할 문서가 없습니다.");
      return;
    }

    exportExcelWorkbook(`결재문서_목록_${exportDateStamp()}.xls`, [
      createApprovalListSheet(filteredDocuments),
    ]);
  }

  function exportApprovalForms() {
    if (filteredDocuments.length === 0) {
      setMessage("다운로드할 문서가 없습니다.");
      return;
    }

    exportExcelWorkbook(
      `결재문서_양식_${exportDateStamp()}.xls`,
      filteredDocuments.map(createApprovalDocumentSheet)
    );
  }

  const currentPendingLine = selectedDocument ? getFirstPendingLine(selectedDocument) : null;
  const canAct =
    selectedDocument?.status === "pending" && currentPendingLine?.approver_id === currentUserId;

  return (
    <section style={styles.page}>
      <div
        style={{
          ...styles.summaryGrid,
          ...(isMobile ? styles.summaryGridMobile : {}),
        }}
      >
        <div style={{ ...styles.summaryCard, ...(isMobile ? styles.summaryCardMobile : {}) }}>
          <span style={styles.summaryLabel}>내 결재 대기</span>
          <strong style={styles.summaryValue}>{pendingForMe.length}건</strong>
        </div>
        <div style={{ ...styles.summaryCard, ...(isMobile ? styles.summaryCardMobile : {}) }}>
          <span style={styles.summaryLabel}>읽지 않은 알림</span>
          <strong style={styles.summaryValue}>{notifications.length}건</strong>
        </div>
        <div style={{ ...styles.summaryCard, ...(isMobile ? styles.summaryCardMobile : {}) }}>
          <span style={styles.summaryLabel}>완료 히스토리</span>
          <strong style={styles.summaryValue}>
            {documents.filter((document) => document.status === "approved").length}건
          </strong>
        </div>
      </div>

      {setupError && (
        <div style={styles.setupBox}>
          <strong>DB 준비 필요</strong>
          <span>{setupError}</span>
        </div>
      )}

      {message && <div style={styles.messageBox}>{message}</div>}

      <div
        style={{
          ...styles.layout,
          ...(isMobile ? styles.layoutMobile : {}),
        }}
      >
        <section
          style={{
            ...styles.formPanel,
            ...(isMobile ? styles.panelMobile : {}),
          }}
        >
          <div
            style={{
              ...styles.panelTitleRow,
              ...(isMobile ? styles.panelTitleRowMobile : {}),
            }}
          >
            <div>
              <h2 style={styles.panelTitle}>{selectedTemplate.title}</h2>
              <p style={styles.panelSubText}>기존 양식의 입력 항목을 웹 입력 흐름으로 정리했습니다.</p>
            </div>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={submitDocument}
              disabled={saving || Boolean(setupError)}
            >
              {saving ? "처리중" : "결재 등록"}
            </button>
          </div>

          <section style={styles.templateStripBox}>
            <div
              style={{
                ...styles.panelTitleRow,
                ...(isMobile ? styles.panelTitleRowMobile : {}),
              }}
            >
              <h3 style={styles.sectionTitle}>양식 선택</h3>
              <button type="button" style={styles.ghostButton} onClick={loadData}>
                새로고침
              </button>
            </div>
            <div
              style={{
                ...styles.templateList,
                ...(isMobile ? styles.templateListMobile : {}),
              }}
            >
              {templates.map((template) => {
                const active = template.key === selectedTemplate.key;

                return (
                  <button
                    key={template.key}
                    type="button"
                    style={{
                      ...styles.templateButton,
                      ...(isMobile ? styles.templateButtonMobile : {}),
                      ...(active ? styles.templateButtonActive : {}),
                    }}
                    onClick={() => changeTemplate(template.key)}
                  >
                    <span style={styles.templateCategory}>{template.category}</span>
                    <strong>{template.title}</strong>
                  </button>
                );
              })}
            </div>
          </section>

          {shouldCreateEquipmentOrder && (
            <section style={styles.orderReferenceBox}>
              <div>
                <h3 style={styles.sectionTitle}>현황판 자동 등록</h3>
                <p style={styles.panelSubText}>
                  제조요구서를 상신하면 입력한 수주 정보로 메인 현황판에 새 건이 자동 생성됩니다.
                </p>
              </div>
            </section>
          )}

          {shouldSelectEquipmentOrder && (
            <section style={styles.orderReferenceBox}>
              <div
                style={{
                  ...styles.panelTitleRow,
                  ...(isMobile ? styles.panelTitleRowMobile : {}),
                }}
              >
                <div>
                  <h3 style={styles.sectionTitle}>수주 건 연결</h3>
                  <p style={styles.panelSubText}>
                    최종 승인 시 메인 현황판의 해당 단계 날짜가 자동 반영됩니다.
                  </p>
                </div>
              </div>
              <select
                style={styles.input}
                value={selectedEquipmentOrderId}
                onChange={(event) => setSelectedEquipmentOrderId(event.target.value)}
              >
                <option value="">연결하지 않음</option>
                {equipmentOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {getEquipmentOrderLabel(order)}
                  </option>
                ))}
              </select>
            </section>
          )}

          <section style={styles.approvalLineBoxTop}>
            <div
              style={{
                ...styles.panelTitleRow,
                ...(isMobile ? styles.panelTitleRowMobile : {}),
              }}
            >
              <h3 style={styles.sectionTitle}>결재라인 지정</h3>
              <button type="button" style={styles.ghostButton} onClick={addApproverSlot}>
                결재라인 추가
              </button>
            </div>
            <div style={styles.approvalLineGrid}>
              {approverSlots.map((slot, index) => (
                <label key={`${slot.roleLabel}-${index}`} style={styles.approverSlot}>
                  <div style={styles.approverControl}>
                    <select
                      style={styles.input}
                      value={slot.approverId}
                      onChange={(event) => selectApprover(index, event.target.value)}
                    >
                      <option value="">결재자 선택</option>
                      {sortedProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name || "-"} / {getDisplayTeam(profile) || "-"}
                        </option>
                      ))}
                    </select>
                    {approverSlots.length > 1 && (
                      <button
                        type="button"
                        style={styles.removeLineButton}
                        onClick={() => removeApproverSlot(index)}
                        aria-label={`${slot.roleLabel} 삭제`}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </section>

          <div
            style={{
              ...styles.formGrid,
              ...(isMobile ? styles.formGridMobile : {}),
            }}
          >
            {selectedTemplate.fields.map((field) => {
              const readOnlyField = ["applicant", "requester", "owner", "team"].includes(field.key);

              return (
                <label
                  key={field.key}
                  style={{
                    ...styles.field,
                    gridColumn: field.span === 2 ? "1 / -1" : undefined,
                  }}
                >
                  <span>{field.label}</span>
                  {field.type === "textarea" ? (
                    <textarea
                      style={styles.textarea}
                      value={String(formData[field.key] || "")}
                      placeholder={field.placeholder}
                      onChange={(event) => updateField(field.key, event.target.value)}
                    />
                  ) : field.type === "select" ? (
                    <select
                      style={styles.input}
                      value={String(formData[field.key] || "")}
                      onChange={(event) => updateField(field.key, event.target.value)}
                    >
                      <option value="">선택</option>
                      {(field.options || []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      style={{
                        ...styles.input,
                        ...(readOnlyField ? styles.readOnlyInput : {}),
                      }}
                      type={field.type}
                      value={String(formData[field.key] || "")}
                      placeholder={field.placeholder}
                      readOnly={readOnlyField}
                      onChange={(event) => updateField(field.key, event.target.value)}
                    />
                  )}
                </label>
              );
            })}
          </div>

          {selectedTemplate.tables.map((table) => (
            <section key={table.key} style={styles.tableSection}>
              <div style={styles.panelTitleRow}>
                <h3 style={styles.sectionTitle}>{table.title}</h3>
                <button type="button" style={styles.ghostButton} onClick={() => addTableRow(table)}>
                  행 추가
                </button>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, width: "48px" }}>No</th>
                      {table.columns.map((column) => (
                        <th key={column.key} style={{ ...styles.th, width: column.width }}>
                          {column.label}
                        </th>
                      ))}
                      <th style={{ ...styles.th, width: "58px" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {getRows(formData[table.key]).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <td style={styles.td}>{rowIndex + 1}</td>
                        {table.columns.map((column) => (
                          <td key={column.key} style={styles.td}>
                            <input
                              style={styles.tableInput}
                              value={row[column.key] || ""}
                              onChange={(event) =>
                                updateTableCell(table, rowIndex, column.key, event.target.value)
                              }
                            />
                          </td>
                        ))}
                        <td style={styles.td}>
                          <button
                            type="button"
                            style={styles.smallDangerButton}
                            onClick={() => removeTableRow(table, rowIndex)}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

        </section>

        <aside
          style={{
            ...styles.documentPanel,
            ...(isMobile ? styles.panelMobile : {}),
          }}
        >
          <div
            style={{
              ...styles.panelTitleRow,
              ...(isMobile ? styles.panelTitleRowMobile : {}),
            }}
          >
            <h2 style={styles.panelTitle}>문서함</h2>
            <div style={styles.panelTitleActions}>
              <button type="button" style={styles.exportButton} onClick={exportApprovalList}>
                목록
              </button>
              <button type="button" style={styles.exportButton} onClick={exportApprovalForms}>
                양식
              </button>
              <span style={styles.countText}>{loading ? "불러오는 중" : `${filteredDocuments.length}건`}</span>
            </div>
          </div>

          <div
            style={{
              ...styles.filterTabs,
              ...(isMobile ? styles.filterTabsMobile : {}),
            }}
          >
            {[
              ["all", "전체"],
              ["mine", "내 문서"],
              ["pending", "결재 대기"],
              ["history", "완료"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                style={{
                  ...styles.filterButton,
                  ...(activeFilter === key ? styles.filterButtonActive : {}),
                }}
                onClick={() => setActiveFilter(key as typeof activeFilter)}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            style={{
              ...styles.documentList,
              ...(isMobile ? styles.documentListMobile : {}),
            }}
          >
            {filteredDocuments.length === 0 ? (
              <div style={styles.emptyBox}>표시할 문서가 없습니다.</div>
            ) : (
              filteredDocuments.map((document) => {
                const active = selectedDocument?.id === document.id;
                const pendingLine = getFirstPendingLine(document);

                return (
                  <button
                    key={document.id}
                    type="button"
                    style={{
                      ...styles.documentButton,
                      ...(active ? styles.documentButtonActive : {}),
                    }}
                    onClick={() => setSelectedDocumentId(document.id)}
                  >
                    <span style={styles.documentTopLine}>
                      <strong>{document.title}</strong>
                      <em style={styles.statusBadge}>{statusText(document.status)}</em>
                    </span>
                    <span style={styles.documentMeta}>
                      {document.requester_name} · {formatDate(document.submitted_at)}
                    </span>
                    <span style={styles.documentMeta}>
                      다음 결재: {pendingLine ? `${pendingLine.approver_name} (${pendingLine.role_label})` : "-"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {selectedDocument && (
            <section style={styles.detailBox}>
              <div
                style={{
                  ...styles.detailHeader,
                  ...(isMobile ? styles.detailHeaderMobile : {}),
                }}
              >
                <div>
                  <span style={styles.templateCategory}>{selectedDocument.template_title}</span>
                  <h3 style={styles.detailTitle}>{selectedDocument.title}</h3>
                </div>
                <span style={styles.statusBadge}>{statusText(selectedDocument.status)}</span>
              </div>

              <div
                style={{
                  ...styles.detailMetaGrid,
                  ...(isMobile ? styles.detailMetaGridMobile : {}),
                }}
              >
                <div>
                  <span>작성자</span>
                  <strong>{selectedDocument.requester_name}</strong>
                </div>
                <div>
                  <span>작성일</span>
                  <strong>{formatDate(selectedDocument.submitted_at)}</strong>
                </div>
              </div>

              <div style={styles.lineStatusList}>
                {(selectedDocument.approval_lines || []).map((line) => (
                  <div
                    key={line.id}
                    style={{
                      ...styles.lineStatusItem,
                      ...(isMobile ? styles.lineStatusItemMobile : {}),
                    }}
                  >
                    <span>{line.role_label}</span>
                    <strong>{line.approver_name}</strong>
                    <em>{statusText(line.status)}</em>
                  </div>
                ))}
              </div>

              {canAct && (
                <div style={styles.actionRow}>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={approveSelectedDocument}
                    disabled={saving}
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    style={styles.dangerButton}
                    onClick={rejectSelectedDocument}
                    disabled={saving}
                  >
                    반려
                  </button>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minWidth: 0,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
    marginBottom: "16px",
  },
  summaryGridMobile: {
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "8px",
    marginBottom: "12px",
  },
  summaryCard: {
    minHeight: "82px",
    border: "1px solid #dfe3e8",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "16px",
  },
  summaryCardMobile: {
    minHeight: "70px",
    padding: "10px",
  },
  summaryLabel: {
    display: "block",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 700,
  },
  summaryValue: {
    display: "block",
    marginTop: "8px",
    color: "#111820",
    fontSize: "26px",
    lineHeight: 1,
  },
  setupBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    border: "1px solid #facc15",
    borderRadius: "10px",
    background: "#fffbeb",
    color: "#854d0e",
    padding: "14px 16px",
    marginBottom: "16px",
    fontSize: "13px",
    fontWeight: 700,
  },
  messageBox: {
    border: "1px solid #bfdbfe",
    borderRadius: "10px",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "12px 14px",
    marginBottom: "16px",
    fontSize: "13px",
    fontWeight: 700,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(560px, 1fr) 360px",
    gap: "14px",
    alignItems: "start",
  },
  layoutMobile: {
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "12px",
  },
  formPanel: {
    border: "1px solid #dfe3e8",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "18px",
  },
  documentPanel: {
    border: "1px solid #dfe3e8",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "14px",
  },
  panelMobile: {
    padding: "12px",
    borderRadius: "9px",
  },
  panelTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "14px",
  },
  panelTitleRowMobile: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: "10px",
  },
  panelTitleActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "6px",
    flexWrap: "wrap",
  },
  panelTitle: {
    margin: 0,
    color: "#111820",
    fontSize: "17px",
    fontWeight: 800,
  },
  panelSubText: {
    margin: "5px 0 0",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 500,
  },
  templateStripBox: {
    borderTop: "1px solid #edf0f3",
    borderBottom: "1px solid #edf0f3",
    padding: "14px 0",
    marginBottom: "16px",
  },
  templateList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  templateListMobile: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "7px",
  },
  templateButton: {
    minWidth: "128px",
    minHeight: "54px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: "4px",
    border: "1px solid #e5e7eb",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#111827",
    padding: "9px 12px",
    textAlign: "left",
    cursor: "pointer",
    fontSize: "13px",
  },
  templateButtonMobile: {
    minWidth: 0,
    minHeight: "50px",
    padding: "8px 10px",
    fontSize: "12px",
  },
  templateButtonActive: {
    borderColor: "#111820",
    background: "#f8fafc",
    boxShadow: "inset 0 -3px 0 #111820",
  },
  templateCategory: {
    color: "#2fa368",
    fontSize: "11px",
    fontWeight: 700,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },
  formGridMobile: {
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "10px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    height: "40px",
    border: "1px solid #cfd6df",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 11px",
    fontSize: "13px",
    fontWeight: 500,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: "94px",
    resize: "vertical",
    border: "1px solid #cfd6df",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    padding: "11px",
    fontSize: "13px",
    fontWeight: 500,
    lineHeight: 1.5,
    boxSizing: "border-box",
  },
  primaryButton: {
    minWidth: "88px",
    height: "38px",
    border: "1px solid #111820",
    borderRadius: "9px",
    background: "#111820",
    color: "#ffffff",
    padding: "0 14px",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },
  dangerButton: {
    minWidth: "88px",
    height: "38px",
    border: "1px solid #fecaca",
    borderRadius: "9px",
    background: "#fff1f2",
    color: "#dc2626",
    padding: "0 14px",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },
  ghostButton: {
    height: "34px",
    border: "1px solid #cfd6df",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 11px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  exportButton: {
    height: "28px",
    border: "1px solid #cfd6df",
    borderRadius: "7px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 9px",
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  tableSection: {
    marginTop: "20px",
    borderTop: "1px solid #edf0f3",
    paddingTop: "16px",
  },
  sectionTitle: {
    margin: 0,
    color: "#111820",
    fontSize: "15px",
    fontWeight: 800,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    minWidth: "620px",
    borderCollapse: "separate",
    borderSpacing: 0,
  },
  th: {
    borderTop: "1px solid #e5e7eb",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
    color: "#667085",
    padding: "9px",
    fontSize: "12px",
    fontWeight: 700,
    textAlign: "left",
  },
  td: {
    borderBottom: "1px solid #edf0f3",
    padding: "7px",
    color: "#111827",
    fontSize: "13px",
  },
  tableInput: {
    width: "100%",
    height: "34px",
    border: "1px solid transparent",
    borderRadius: "7px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 8px",
    fontSize: "13px",
    fontWeight: 500,
    boxSizing: "border-box",
  },
  smallDangerButton: {
    height: "30px",
    border: "1px solid #fee2e2",
    borderRadius: "7px",
    background: "#ffffff",
    color: "#dc2626",
    padding: "0 8px",
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },
  approvalLineBox: {
    marginTop: "20px",
    borderTop: "1px solid #edf0f3",
    paddingTop: "16px",
  },
  approvalLineBoxTop: {
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#f8fafc",
    padding: "14px",
    marginBottom: "16px",
  },
  orderReferenceBox: {
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "14px",
    marginBottom: "16px",
  },
  approvalLineGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "10px",
    marginTop: "12px",
  },
  approverSlot: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 700,
  },
  approverControl: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "6px",
  },
  removeLineButton: {
    width: "48px",
    height: "40px",
    border: "1px solid #fee2e2",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#dc2626",
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },
  readOnlyInput: {
    background: "#f8fafc",
    color: "#475467",
  },
  countText: {
    color: "#667085",
    fontSize: "12px",
    fontWeight: 700,
  },
  filterTabs: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "6px",
    marginBottom: "12px",
  },
  filterTabsMobile: {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  filterButton: {
    height: "34px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  filterButtonActive: {
    borderColor: "#111820",
    background: "#111820",
    color: "#ffffff",
  },
  documentList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "390px",
    overflowY: "auto",
  },
  documentListMobile: {
    maxHeight: "none",
    overflowY: "visible",
  },
  documentButton: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    border: "1px solid #e5e7eb",
    borderRadius: "9px",
    background: "#ffffff",
    padding: "12px",
    textAlign: "left",
    cursor: "pointer",
  },
  documentButtonActive: {
    borderColor: "#111820",
    background: "#f8fafc",
  },
  documentTopLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
    color: "#111827",
    fontSize: "13px",
    lineHeight: 1.35,
  },
  documentMeta: {
    color: "#667085",
    fontSize: "12px",
    fontWeight: 500,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    height: "22px",
    borderRadius: "999px",
    background: "#edf0f3",
    color: "#344054",
    padding: "0 8px",
    fontSize: "11px",
    fontStyle: "normal",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  emptyBox: {
    border: "1px dashed #cfd6df",
    borderRadius: "9px",
    color: "#667085",
    padding: "18px",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 600,
  },
  detailBox: {
    marginTop: "16px",
    borderTop: "1px solid #edf0f3",
    paddingTop: "16px",
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
  },
  detailHeaderMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  detailTitle: {
    margin: "5px 0 0",
    color: "#111820",
    fontSize: "16px",
    lineHeight: 1.4,
  },
  detailMetaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "8px",
    marginTop: "14px",
  },
  detailMetaGridMobile: {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  lineStatusList: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    marginTop: "14px",
  },
  lineStatusItem: {
    display: "grid",
    gridTemplateColumns: "64px minmax(0, 1fr) 70px",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #edf0f3",
    borderRadius: "8px",
    padding: "9px",
    color: "#111827",
    fontSize: "12px",
  },
  lineStatusItemMobile: {
    gridTemplateColumns: "54px minmax(0, 1fr) 58px",
    gap: "6px",
    padding: "8px",
  },
  actionRow: {
    display: "flex",
    gap: "8px",
    marginTop: "14px",
  },
};
