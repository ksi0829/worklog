"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import {
  EXECUTIVE_NAMES,
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
type EquipmentStageKey = "manufacturingRequest" | "purchaseRequest" | "outsourcingRequest" | "qa";
type InputMode = "modern" | "legacy";
type DocumentFilter = "mine" | "pending" | "reference" | "history";
type DocumentStatusFilter = "all" | ApprovalStatus;

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

type ApprovalReferenceInfo = {
  id: string;
  name: string;
  team: string;
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

type ApprovalAttachmentRow = {
  id: number;
  document_id: number;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
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
  serial_no?: string | null;
  delivery_place?: string | null;
  note?: string | null;
  manufacturing_document_id?: number | null;
  outsourcing_document_id?: number | null;
};

type CustomerOption = {
  id: number;
  name: string;
};

const supabase = createSupabaseBrowser();
const today = new Date().toISOString().slice(0, 10);
const DEFAULT_APPROVER_COUNT = 3;
const APPROVAL_ATTACHMENT_BUCKET = "approval-attachments";
const APPROVAL_ATTACHMENT_ACCEPT = ".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.dwg,.dxf,.zip";
const MAX_ATTACHMENT_COUNT = 10;
const MAX_ATTACHMENT_SIZE = 30 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "xlsx",
  "xls",
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "dwg",
  "dxf",
  "zip",
]);

const equipmentStageByTemplate: Partial<Record<string, EquipmentStageKey>> = {
  manufacturing_request: "manufacturingRequest",
  purchase_request: "purchaseRequest",
  outsourcing_request: "outsourcingRequest",
  inspection_request: "qa",
};

const equipmentDateColumnByStage: Record<EquipmentStageKey, string> = {
  manufacturingRequest: "manufacturing_request_approved_on",
  purchaseRequest: "purchase_request_approved_on",
  outsourcingRequest: "outsourcing_request_approved_on",
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
    tables: [{ key: "items", title: "구매 품목", columns: commonItemColumns, initialRows: 8 }],
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
        initialRows: 8,
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
      { key: "attachment", label: "첨부 메모(기존)", type: "text", span: 2 },
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
        initialRows: 5,
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
const legacyTemplateKeys = [
  "manufacturing_request",
  "purchase_request",
  "outsourcing_request",
  "inspection_request",
];
const manufacturingTemplateKeys = [
  "manufacturing_request",
  "purchase_request",
  "outsourcing_request",
  "inspection_request",
];
const generalTemplateKeys = ["draft", "expense_request", "vacation_request", "holiday_work_request"];
const templateRows = [
  [...manufacturingTemplateKeys, ...generalTemplateKeys]
    .map((key) => templateMap[key])
    .filter((template): template is TemplateDef => Boolean(template)),
];

function createDefaultApproverSlots(count = DEFAULT_APPROVER_COUNT): ApproverSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    roleLabel: `${index + 1}차 결재`,
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

function applyEquipmentOrderFields(
  data: Record<string, unknown>,
  order: EquipmentOrderRow
) {
  const next = { ...data };
  const pairs: Array<[string, string | null | undefined]> = [
    ["client", order.customer],
    ["customer", order.customer],
    ["equipment", order.model],
    ["productName", order.model],
    ["modelName", order.model],
    ["serialNo", order.serial_no],
    ["deliveryPlace", order.delivery_place],
  ];

  pairs.forEach(([key, value]) => {
    if (value && key in next) {
      next[key] = value;
    }
  });

  return next;
}

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const maybeError = error as { message?: string; details?: string; hint?: string; code?: string };

  return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
    .filter(Boolean)
    .join(" / ");
}

function getRows(value: unknown): Record<string, string>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, string> => row && typeof row === "object");
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return extension;
}

function validateAttachmentFiles(files: File[], existingCount = 0) {
  if (existingCount + files.length > MAX_ATTACHMENT_COUNT) {
    return `첨부파일은 문서당 최대 ${MAX_ATTACHMENT_COUNT}개까지 등록할 수 있습니다.`;
  }

  for (const file of files) {
    const extension = getFileExtension(file.name);

    if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) {
      return `${file.name}: 엑셀, PDF, 이미지, DWG/DXF, ZIP 파일만 첨부할 수 있습니다.`;
    }

    if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) {
      return `${file.name}: 파일 크기는 30MB 이하여야 합니다.`;
    }
  }

  return "";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatMonthKey(value?: string | null) {
  if (!value) return "unknown";
  return value.slice(0, 7);
}

function formatMonthLabel(monthKey: string) {
  if (monthKey === "unknown") return "날짜 미지정";
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
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

function progressText(document: ApprovalDocumentRow) {
  if (document.status === "approved") return "최종 승인 완료";
  if (document.status === "rejected") return "반려 처리됨";

  const pendingLine = getFirstPendingLine(document);
  return pendingLine ? `${pendingLine.approver_name} (${pendingLine.role_label}) 결재 대기` : "결재 진행 중";
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

function getSortedApprovalLines(document: ApprovalDocumentRow) {
  return [...(document.approval_lines || [])].sort((a, b) => a.step_order - b.step_order);
}

function formatExcelValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function formatDocumentValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function escapePrintHtml(value: unknown) {
  return formatDocumentValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getReferenceInfos(data: Record<string, unknown>): ApprovalReferenceInfo[] {
  const value = data._references;
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is ApprovalReferenceInfo =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as ApprovalReferenceInfo).id === "string"
  );
}

function collectSearchValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap(collectSearchValues);
  if (typeof value === "object") return Object.values(value).flatMap(collectSearchValues);
  return [];
}

function documentMatchesSearch(document: ApprovalDocumentRow, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  if (!normalizedQuery) return true;

  const searchableText = [
    document.template_title,
    document.title,
    document.requester_name,
    document.requester_team || "",
    statusText(document.status),
    formatDate(document.submitted_at),
    formatDate(document.completed_at),
    ...(document.approval_lines || []).flatMap((line) => [
      line.approver_name,
      line.approver_team || "",
      line.role_label,
      statusText(line.status),
    ]),
    ...getReferenceInfos(document.form_data).flatMap((reference) => [
      reference.name,
      reference.team,
    ]),
    ...collectSearchValues(document.form_data),
  ]
    .join(" ")
    .toLocaleLowerCase("ko");

  return searchableText.includes(normalizedQuery);
}

function getLinkedEquipmentInfo(document: ApprovalDocumentRow) {
  const data = document.form_data || {};
  const orderIdValue = document.equipment_order_id || data._equipmentOrderId;
  const stageValue = document.equipment_stage_key || data._equipmentStageKey;
  const orderId =
    typeof orderIdValue === "number"
      ? orderIdValue
      : typeof orderIdValue === "string"
        ? Number(orderIdValue)
        : null;

  if (
    !orderId ||
    typeof stageValue !== "string" ||
    !(stageValue in equipmentDateColumnByStage)
  ) {
    return null;
  }

  return {
    orderId,
    stageKey: stageValue as EquipmentStageKey,
  };
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
    ["참조 인원", getReferenceInfos(document.form_data).map((item) => `${item.name}/${item.team}`).join(", ")],
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

function getStringValue(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

export default function ApprovalPage() {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(templates[0].key);
  const selectedTemplate = templateMap[selectedTemplateKey] || templates[0];
  const [inputMode, setInputMode] = useState<InputMode>("modern");
  const [formData, setFormData] = useState<Record<string, unknown>>(() =>
    createEmptyFormData(selectedTemplate)
  );
  const [approverSlots, setApproverSlots] = useState<ApproverSlot[]>(() =>
    createDefaultApproverSlots()
  );
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [equipmentOrders, setEquipmentOrders] = useState<EquipmentOrderRow[]>([]);
  const [selectedEquipmentOrderId, setSelectedEquipmentOrderId] = useState("");
  const [documents, setDocuments] = useState<ApprovalDocumentRow[]>([]);
  const [attachments, setAttachments] = useState<ApprovalAttachmentRow[]>([]);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);
  const [attachmentFeatureReady, setAttachmentFeatureReady] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [currentTeam, setCurrentTeam] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [detailModalDocumentId, setDetailModalDocumentId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<DocumentFilter>("mine");
  const [documentSearchQuery, setDocumentSearchQuery] = useState("");
  const [documentTemplateFilter, setDocumentTemplateFilter] = useState("all");
  const [documentStatusFilter, setDocumentStatusFilter] = useState<DocumentStatusFilter>("all");
  const [documentRequesterFilter, setDocumentRequesterFilter] = useState("all");
  const [documentDateFrom, setDocumentDateFrom] = useState("");
  const [documentDateTo, setDocumentDateTo] = useState("");
  const [documentsWithAttachmentsOnly, setDocumentsWithAttachmentsOnly] = useState(false);
  const [showDocumentFilters, setShowDocumentFilters] = useState(false);
  const [expandedHistoryMonths, setExpandedHistoryMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [message, setMessage] = useState("");

  const isCurrentUserId = useCallback(
    (value?: string | null) => Boolean(currentUserId && value === currentUserId),
    [currentUserId]
  );
  const isCurrentUserName = useCallback(
    (value?: string | null) => Boolean(currentName && value === currentName),
    [currentName]
  );
  const isCurrentRequester = useCallback(
    (document: ApprovalDocumentRow) => {
      if (currentName) return document.requester_name === currentName;
      return isCurrentUserId(document.requester_id);
    },
    [currentName, isCurrentUserId]
  );
  const isCurrentApprover = useCallback(
    (document: ApprovalDocumentRow) =>
      (document.approval_lines || []).some(
        (line) => isCurrentUserId(line.approver_id) || isCurrentUserName(line.approver_name)
      ),
    [isCurrentUserId, isCurrentUserName]
  );
  const isCurrentReference = useCallback(
    (document: ApprovalDocumentRow) =>
      getReferenceInfos(document.form_data).some(
        (reference) => isCurrentUserId(reference.id) || isCurrentUserName(reference.name)
      ),
    [isCurrentUserId, isCurrentUserName]
  );
  const isCurrentApprovalLine = useCallback(
    (line?: ApprovalLineRow | null) =>
      Boolean(line && (isCurrentUserId(line.approver_id) || isCurrentUserName(line.approver_name))),
    [isCurrentUserId, isCurrentUserName]
  );
  const isAdmin = currentRole === "admin";
  const visibleDocuments = useMemo(
    () =>
      isAdmin
        ? documents
        : documents.filter(
        (document) =>
          isCurrentRequester(document) ||
          isCurrentApprover(document) ||
          isCurrentReference(document)
      ),
    [documents, isAdmin, isCurrentApprover, isCurrentReference, isCurrentRequester]
  );

  const pendingForMe = useMemo(
    () =>
      visibleDocuments.filter((document) => {
        const pendingLine = getFirstPendingLine(document);
        return document.status === "pending" && isCurrentApprovalLine(pendingLine);
      }),
    [isCurrentApprovalLine, visibleDocuments]
  );
  const completedForMe = useMemo(
    () => visibleDocuments.filter((document) => document.status === "approved"),
    [visibleDocuments]
  );

  const referenceForMe = useMemo(
    () => visibleDocuments.filter(isCurrentReference),
    [isCurrentReference, visibleDocuments]
  );
  const myDocuments = useMemo(
    () => (isAdmin ? visibleDocuments : visibleDocuments.filter(isCurrentRequester)),
    [isAdmin, isCurrentRequester, visibleDocuments]
  );
  const requesterFilterOptions = useMemo(
    () =>
      Array.from(new Set(visibleDocuments.map((document) => document.requester_name)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ko")),
    [visibleDocuments]
  );

  const baseFilteredDocuments = useMemo(() => {
    if (activeFilter === "mine") {
      return myDocuments;
    }

    if (activeFilter === "pending") {
      return pendingForMe;
    }

    if (activeFilter === "reference") {
      return referenceForMe;
    }

    if (activeFilter === "history") {
      return completedForMe;
    }

    return [];
  }, [
    activeFilter,
    completedForMe,
    myDocuments,
    pendingForMe,
    referenceForMe,
  ]);

  const filteredDocuments = useMemo(
    () =>
      baseFilteredDocuments.filter((document) => {
        if (!documentMatchesSearch(document, documentSearchQuery)) return false;
        if (documentTemplateFilter !== "all" && document.template_key !== documentTemplateFilter) return false;
        if (documentStatusFilter !== "all" && document.status !== documentStatusFilter) return false;
        if (documentRequesterFilter !== "all" && document.requester_name !== documentRequesterFilter) return false;
        if (documentDateFrom && document.submitted_at.slice(0, 10) < documentDateFrom) return false;
        if (documentDateTo && document.submitted_at.slice(0, 10) > documentDateTo) return false;
        if (documentsWithAttachmentsOnly && !attachments.some((attachment) => attachment.document_id === document.id)) {
          return false;
        }
        return true;
      }),
    [
      attachments,
      baseFilteredDocuments,
      documentDateFrom,
      documentDateTo,
      documentRequesterFilter,
      documentSearchQuery,
      documentStatusFilter,
      documentTemplateFilter,
      documentsWithAttachmentsOnly,
    ]
  );
  const hasDetailedFilters =
    documentTemplateFilter !== "all" ||
    documentStatusFilter !== "all" ||
    documentRequesterFilter !== "all" ||
    Boolean(documentDateFrom) ||
    Boolean(documentDateTo) ||
    documentsWithAttachmentsOnly;

  const historyMonthGroups = useMemo(() => {
    const groupMap = new Map<string, ApprovalDocumentRow[]>();

    filteredDocuments.forEach((document) => {
      const monthKey = formatMonthKey(document.completed_at || document.submitted_at);
      groupMap.set(monthKey, [...(groupMap.get(monthKey) || []), document]);
    });

    return Array.from(groupMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, rows]) => ({
        monthKey,
        rows: rows.sort((a, b) =>
          (b.completed_at || b.submitted_at).localeCompare(a.completed_at || a.submitted_at)
        ),
      }));
  }, [filteredDocuments]);

  const selectedDocument = useMemo(
    () =>
      filteredDocuments.find((document) => document.id === selectedDocumentId) ||
      filteredDocuments[0] ||
      null,
    [filteredDocuments, selectedDocumentId]
  );
  const detailModalDocument = useMemo(
    () => visibleDocuments.find((document) => document.id === detailModalDocumentId) || null,
    [detailModalDocumentId, visibleDocuments]
  );

  const sortedProfiles = useMemo(
    () =>
      profiles
        .filter(
          (profile) =>
            profile.name &&
            (ORG_MEMBER_MAP.has(profile.name) || EXECUTIVE_NAMES.includes(profile.name))
        )
        .sort((a, b) => getProfileSortValue(a).localeCompare(getProfileSortValue(b), "ko")),
    [profiles]
  );

  const selectedEquipmentStage = equipmentStageByTemplate[selectedTemplate.key] || null;
  const shouldCreateEquipmentOrder = selectedTemplate.key === "manufacturing_request";
  const shouldSelectEquipmentOrder = Boolean(selectedEquipmentStage && !shouldCreateEquipmentOrder);
  const linkableEquipmentOrders = useMemo(() => {
    if (!shouldSelectEquipmentOrder) return [];

    return equipmentOrders.filter(
      (order) => Boolean(order.manufacturing_document_id)
    );
  }, [equipmentOrders, shouldSelectEquipmentOrder]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setSetupError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const storedName = typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
    const storedTeam = typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
    const storedRole = typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
    const currentOrgTeam = getCurrentOrgTeam(storedName, storedTeam);

    setCurrentUserId(user?.id || "");
    setCurrentName(storedName);
    setCurrentTeam(currentOrgTeam);
    setCurrentRole(storedRole);
    setFormData((prev) => applyCurrentUserFields(prev, storedName, currentOrgTeam));

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,name,team,role")
      .order("name", { ascending: true });

    setProfiles((profileRows || []) as ProfileRow[]);

    const { data: customerRows } = await supabase
      .from("customers")
      .select("id,name")
      .eq("category", "customer")
      .order("name", { ascending: true });

    setCustomerOptions((customerRows || []) as CustomerOption[]);

    const primaryEquipmentOrders = await supabase
      .from("equipment_orders")
      .select("id,category,order_date,country,customer,model,owner_name,serial_no,delivery_place,note,manufacturing_document_id,outsourcing_document_id")
      .order("order_date", { ascending: false })
      .limit(80);

    let equipmentRows = primaryEquipmentOrders.data;

    if (primaryEquipmentOrders.error?.message?.includes("outsourcing")) {
      const fallbackEquipmentOrders = await supabase
        .from("equipment_orders")
        .select("id,category,order_date,country,customer,model,owner_name,serial_no,delivery_place,note,manufacturing_document_id")
        .order("order_date", { ascending: false })
        .limit(80);

      equipmentRows = (fallbackEquipmentOrders.data || []).map((order) => ({
        ...order,
        outsourcing_document_id: null,
      }));
    }

    setEquipmentOrders((equipmentRows || []) as EquipmentOrderRow[]);

    const { data: documentRows, error: documentError } = await supabase
      .from("approval_documents")
      .select(
        [
          "id",
          "template_key",
          "template_title",
          "title",
          "status",
          "requester_id",
          "requester_name",
          "requester_team",
          "current_step",
          "form_data",
          "submitted_at",
          "completed_at",
          "equipment_order_id",
          "equipment_stage_key",
          "created_at",
          "updated_at",
          "approval_lines(id,document_id,step_order,role_label,approver_id,approver_name,approver_team,status,acted_at,memo)",
        ].join(",")
      )
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

    const normalizedDocuments = (((documentRows || []) as unknown) as ApprovalDocumentRow[]).map((document) => ({
      ...document,
      approval_lines: [...(document.approval_lines || [])].sort(
        (a, b) => a.step_order - b.step_order
      ),
    }));

    setDocuments(normalizedDocuments);
    setSelectedDocumentId((prev) => prev || normalizedDocuments[0]?.id || null);

    const { data: attachmentRows, error: attachmentError } = await supabase
      .from("approval_attachments")
      .select("id,document_id,storage_path,original_name,mime_type,size_bytes,uploaded_by,created_at")
      .order("created_at", { ascending: true });

    if (attachmentError) {
      setAttachments([]);
      setAttachmentFeatureReady(false);
    } else {
      setAttachments((attachmentRows || []) as ApprovalAttachmentRow[]);
      setAttachmentFeatureReady(true);
    }

    if (user?.id) {
      const { data: notificationRows } = await supabase
        .from("approval_notifications")
        .select("id,user_id,document_id,message,read_at,created_at")
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

  useEffect(() => {
    if (!shouldSelectEquipmentOrder || !selectedEquipmentOrderId) return;

    const selectedOrder = linkableEquipmentOrders.find(
      (order) => String(order.id) === selectedEquipmentOrderId
    );

    if (!selectedOrder) {
      void Promise.resolve().then(() => setSelectedEquipmentOrderId(""));
      return;
    }

    const manufacturingDocument = documents.find(
      (document) => document.id === selectedOrder.manufacturing_document_id
    );
    const serialFromDocument = manufacturingDocument
      ? getStringValue(manufacturingDocument.form_data, "serialNo")
      : "";

    void Promise.resolve().then(() =>
      setFormData((prev) =>
        applyEquipmentOrderFields(prev, {
          ...selectedOrder,
          serial_no: selectedOrder.serial_no || serialFromDocument || null,
        })
      )
    );
  }, [documents, linkableEquipmentOrders, selectedEquipmentOrderId, shouldSelectEquipmentOrder]);

  function changeTemplate(templateKey: string, mode: InputMode = "modern") {
    const nextTemplate = templateMap[templateKey] || templates[0];
    setSelectedTemplateKey(templateKey);
    setInputMode(legacyTemplateKeys.includes(templateKey) ? mode : "modern");
    setFormData(applyCurrentUserFields(createEmptyFormData(nextTemplate), currentName, currentTeam, true));
    setApproverSlots(createDefaultApproverSlots());
    setReferenceIds([]);
    setSelectedEquipmentOrderId("");
    setPendingAttachmentFiles([]);
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
      { roleLabel: `${prev.length + 1}차 결재`, approverId: "" },
    ]);
  }

  function removeApproverSlot(index: number) {
    setApproverSlots((prev) =>
      prev
        .filter((_, slotIndex) => slotIndex !== index)
        .map((slot, slotIndex) => ({ ...slot, roleLabel: `${slotIndex + 1}차 결재` }))
    );
  }

  function getProfile(id: string) {
    return profiles.find((profile) => profile.id === id) || null;
  }

  function addReference() {
    setReferenceIds((prev) => [...prev, ""]);
  }

  function selectReference(index: number, profileId: string) {
    setReferenceIds((prev) =>
      prev.map((id, currentIndex) => (currentIndex === index ? profileId : id))
    );
  }

  function removeReference(index: number) {
    setReferenceIds((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleEquipmentOrderChange(orderId: string) {
    setSelectedEquipmentOrderId(orderId);
  }

  function getDocumentAttachments(documentId: number) {
    return attachments.filter((attachment) => attachment.document_id === documentId);
  }

  function handlePendingAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    const error = validateAttachmentFiles(files, pendingAttachmentFiles.length);
    if (error) {
      setMessage(error);
      return;
    }

    setPendingAttachmentFiles((prev) => [...prev, ...files]);
    setMessage("");
  }

  async function uploadFilesToDocument(documentId: number, files: File[]) {
    const failedFiles: string[] = [];

    if (!currentUserId || !attachmentFeatureReady) {
      return ["파일 첨부 저장소가 아직 준비되지 않았습니다."];
    }

    setAttachmentBusy(true);

    for (const file of files) {
      const extension = getFileExtension(file.name);
      const storagePath = `${currentUserId}/${documentId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(APPROVAL_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) {
        failedFiles.push(file.name);
        continue;
      }

      const { error: metadataError } = await supabase.from("approval_attachments").insert({
        document_id: documentId,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: currentUserId,
      });

      if (metadataError) {
        await supabase.storage.from(APPROVAL_ATTACHMENT_BUCKET).remove([storagePath]);
        failedFiles.push(file.name);
      }
    }

    setAttachmentBusy(false);
    return failedFiles;
  }

  async function addFilesToExistingDocument(
    document: ApprovalDocumentRow,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    const error = validateAttachmentFiles(files, getDocumentAttachments(document.id).length);
    if (error) {
      setMessage(error);
      return;
    }

    const failedFiles = await uploadFilesToDocument(document.id, files);
    setMessage(
      failedFiles.length > 0
        ? `일부 파일을 첨부하지 못했습니다: ${failedFiles.join(", ")}`
        : "첨부파일이 등록되었습니다."
    );
    await loadData();
  }

  async function downloadAttachment(attachment: ApprovalAttachmentRow) {
    setAttachmentBusy(true);
    setMessage("");

    const { data, error } = await supabase.storage
      .from(APPROVAL_ATTACHMENT_BUCKET)
      .download(attachment.storage_path);

    if (error || !data) {
      setMessage(`첨부파일을 내려받지 못했습니다. ${getErrorMessage(error)}`);
      setAttachmentBusy(false);
      return;
    }

    const url = URL.createObjectURL(data);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = attachment.original_name;
    link.click();
    URL.revokeObjectURL(url);
    setAttachmentBusy(false);
  }

  async function deleteAttachment(attachment: ApprovalAttachmentRow) {
    if (!confirm(`${attachment.original_name} 파일을 삭제할까요?`)) return;

    setAttachmentBusy(true);
    setMessage("");

    const { error: storageError } = await supabase.storage
      .from(APPROVAL_ATTACHMENT_BUCKET)
      .remove([attachment.storage_path]);

    if (storageError) {
      setMessage(`첨부파일을 삭제하지 못했습니다. ${getErrorMessage(storageError)}`);
      setAttachmentBusy(false);
      return;
    }

    const { error: metadataError } = await supabase
      .from("approval_attachments")
      .delete()
      .eq("id", attachment.id);

    if (metadataError) {
      setMessage(`첨부 내역을 삭제하지 못했습니다. ${getErrorMessage(metadataError)}`);
      setAttachmentBusy(false);
      return;
    }

    setMessage("첨부파일이 삭제되었습니다.");
    setAttachmentBusy(false);
    await loadData();
  }

  async function submitDocument() {
    setMessage("");

    if (!currentUserId) {
      setMessage("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const requesterId = session?.user?.id || currentUserId;

    if (!requesterId) {
      setMessage("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }

    const selectedApprovers = approverSlots
      .map((slot, index) => ({ ...slot, stepOrder: index + 1, profile: getProfile(slot.approverId) }))
      .filter((slot) => slot.profile);
    const selectedReferences = Array.from(new Set(referenceIds))
      .map((profileId) => getProfile(profileId))
      .filter((profile): profile is ProfileRow => Boolean(profile));

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
    const finalEquipmentOrderId = linkedEquipmentOrderId;
    const finalFormData = {
      ...formData,
      _inputMode: inputMode,
      _equipmentOrderId: finalEquipmentOrderId,
      _equipmentStageKey: selectedEquipmentStage,
      _references: selectedReferences.map((profile) => ({
        id: profile.id,
        name: profile.name || "-",
        team: getDisplayTeam(profile) || profile.team || "",
      })),
    };
    const documentPayload: Record<string, unknown> = {
      template_key: selectedTemplate.key,
      template_title: selectedTemplate.title,
      title,
      status: "pending",
      requester_id: requesterId,
      requester_name: currentName || "작성자",
      requester_team: currentTeam || null,
      current_step: 1,
      form_data: finalFormData,
    };

    if (finalEquipmentOrderId) {
      documentPayload.equipment_order_id = finalEquipmentOrderId;
    }

    if (selectedEquipmentStage) {
      documentPayload.equipment_stage_key = selectedEquipmentStage;
    }

    const linePayload = selectedApprovers.map((slot) => ({
      step_order: slot.stepOrder,
      role_label: slot.roleLabel,
      approver_id: slot.profile?.id || "",
      approver_name: slot.profile?.name || "결재자",
      approver_team: slot.profile ? getDisplayTeam(slot.profile) || slot.profile.team || null : null,
      status: "pending",
    }));

    const referencePayload = selectedReferences.map((profile) => ({
      user_id: profile.id,
      reference_name: profile.name || "참조자",
      reference_team: getDisplayTeam(profile) || profile.team || null,
    }));
    const notificationPayload = [
      ...selectedApprovers.map((slot) => ({
        user_id: slot.profile?.id || "",
        message: `${currentName || "작성자"}님이 ${selectedTemplate.title} 결재라인에 지정했습니다.`,
      })),
      ...selectedReferences.map((profile) => ({
        user_id: profile.id,
        message: `${currentName || "작성자"}님이 ${selectedTemplate.title} 참조자로 지정했습니다.`,
      })),
    ];

    const { data: documentId, error: submitError } = await supabase.rpc(
      "submit_approval_document",
      {
        document_payload: documentPayload,
        line_payload: linePayload,
        reference_payload: referencePayload,
        notification_payload: notificationPayload,
      }
    );

    if (submitError || !documentId) {
      const detail = getErrorMessage(submitError);
      setMessage(
        `문서를 저장하지 못했습니다. ${detail || "project-docs/supabase-approval-submit-rpc.sql 실행 여부를 확인해 주세요."}`
      );
      setSaving(false);
      return;
    }

    const failedAttachments =
      pendingAttachmentFiles.length > 0
        ? await uploadFilesToDocument(Number(documentId), pendingAttachmentFiles)
        : [];

    setMessage(
      failedAttachments.length > 0
        ? `결재문서는 등록됐지만 일부 첨부 업로드에 실패했습니다: ${failedAttachments.join(", ")}`
        : pendingAttachmentFiles.length > 0
          ? "결재문서와 첨부파일이 등록되었습니다."
          : "결재문서가 등록되었습니다."
    );
    setFormData(applyCurrentUserFields(createEmptyFormData(selectedTemplate), currentName, currentTeam, true));
    setReferenceIds([]);
    setSelectedEquipmentOrderId("");
    setPendingAttachmentFiles([]);
    setSaving(false);
    await loadData();
    setSelectedDocumentId(documentId);
  }

  async function approveSelectedDocument() {
    if (!selectedDocument || !currentUserId) return;
    const pendingLine = getFirstPendingLine(selectedDocument);

    if (!pendingLine || !isCurrentApprovalLine(pendingLine)) {
      setMessage("현재 결재 순서가 아닙니다.");
      return;
    }

    setSaving(true);
    setMessage("");
    let approvalMessage = "승인 처리되었습니다.";

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

      const linkedEquipment = getLinkedEquipmentInfo(selectedDocument);

      if (linkedEquipment) {
        await supabase
          .from("equipment_orders")
          .update({
            [equipmentDateColumnByStage[linkedEquipment.stageKey]]:
              completedDate.slice(0, 10),
          })
          .eq("id", linkedEquipment.orderId);
      }

      await supabase.from("approval_notifications").insert({
        user_id: selectedDocument.requester_id,
        document_id: selectedDocument.id,
        message: `${selectedDocument.title} 최종 결재가 완료되었습니다.`,
      });

      if (selectedDocument.template_key === "vacation_request") {
        const { error: scheduleError } = await supabase.rpc("add_vacation_schedule_from_document", {
          target_document_id: selectedDocument.id,
        });

        if (scheduleError) {
          approvalMessage =
            "승인은 완료됐지만 휴가 일정 자동 등록은 실패했습니다. project-docs/supabase-approval-vacation-schedule.sql을 다시 실행해 주세요.";
        }
      }
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

    setMessage(approvalMessage);
    setSaving(false);
    await loadData();
  }

  async function rejectSelectedDocument() {
    if (!selectedDocument || !currentUserId) return;
    const pendingLine = getFirstPendingLine(selectedDocument);

    if (!pendingLine || !isCurrentApprovalLine(pendingLine)) {
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

  async function deleteSelectedDocument() {
    if (!selectedDocument || !isAdmin) return;
    if (!confirm("선택한 결재문서를 삭제할까요?")) return;

    setSaving(true);
    setMessage("");

    const storedAttachments = getDocumentAttachments(selectedDocument.id);
    if (storedAttachments.length > 0) {
      const { error: storageError } = await supabase.storage
        .from(APPROVAL_ATTACHMENT_BUCKET)
        .remove(storedAttachments.map((attachment) => attachment.storage_path));

      if (storageError) {
        setMessage(`문서의 첨부파일을 정리하지 못했습니다. ${getErrorMessage(storageError)}`);
        setSaving(false);
        return;
      }
    }

    await supabase
      .from("approval_notifications")
      .delete()
      .eq("document_id", selectedDocument.id);
    await supabase
      .from("approval_references")
      .delete()
      .eq("document_id", selectedDocument.id);
    await supabase
      .from("approval_lines")
      .delete()
      .eq("document_id", selectedDocument.id);
    if (selectedDocument.template_key === "manufacturing_request") {
      await supabase
        .from("equipment_orders")
        .delete()
        .eq("manufacturing_document_id", selectedDocument.id);
    } else {
      await supabase
        .from("equipment_orders")
        .update({ manufacturing_document_id: null, manufacturing_request_approved_on: null })
        .eq("manufacturing_document_id", selectedDocument.id);
    }
    await supabase
      .from("equipment_orders")
      .update({ purchase_document_id: null, purchase_request_approved_on: null })
      .eq("purchase_document_id", selectedDocument.id);
    await supabase
      .from("equipment_orders")
      .update({ outsourcing_document_id: null, outsourcing_request_approved_on: null })
      .eq("outsourcing_document_id", selectedDocument.id);
    await supabase
      .from("equipment_orders")
      .update({ qa_document_id: null, qa_approved_on: null })
      .eq("qa_document_id", selectedDocument.id);

    const { error } = await supabase
      .from("approval_documents")
      .delete()
      .eq("id", selectedDocument.id);

    if (error) {
      setMessage(`문서를 삭제하지 못했습니다. ${getErrorMessage(error)}`);
      setSaving(false);
      return;
    }

    setSelectedDocumentId(null);
    setMessage("결재문서가 삭제되었습니다.");
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

  function printApprovedDocument(document: ApprovalDocumentRow) {
    if (document.status !== "approved") {
      setMessage("승인 완료된 문서만 인쇄하거나 PDF로 저장할 수 있습니다.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=980,height=900");
    if (!printWindow) {
      setMessage("인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단 설정을 확인해 주세요.");
      return;
    }

    const template = templateMap[document.template_key];
    const documentAttachments = getDocumentAttachments(document.id);
    const references = getReferenceInfos(document.form_data);
    const printDate = new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date());
    const fieldsMarkup = (template?.fields || [])
      .map(
        (field) => `
          <div class="field ${field.span === 2 ? "wide" : ""}">
            <span>${escapePrintHtml(field.label)}</span>
            <strong>${escapePrintHtml(document.form_data[field.key])}</strong>
          </div>`
      )
      .join("");
    const approvalMarkup = (document.approval_lines || [])
      .map(
        (line) => `
          <div class="approval-cell">
            <span>${escapePrintHtml(line.role_label)}</span>
            <strong>${escapePrintHtml(line.approver_name)}</strong>
            <em>${escapePrintHtml(statusText(line.status))}</em>
            <small>${escapePrintHtml(formatDate(line.acted_at))}</small>
          </div>`
      )
      .join("");
    const referenceMarkup =
      references.length > 0
        ? references
            .map((reference) => `${escapePrintHtml(reference.name)} / ${escapePrintHtml(reference.team || "-")}`)
            .join(", ")
        : "-";
    const attachmentMarkup =
      documentAttachments.length > 0
        ? documentAttachments
            .map(
              (attachment) =>
                `<li><span>${escapePrintHtml(attachment.original_name)}</span><strong>${escapePrintHtml(formatFileSize(attachment.size_bytes))}</strong></li>`
            )
            .join("")
        : "<li class=\"empty\">등록된 첨부파일이 없습니다.</li>";
    const tablesMarkup = (template?.tables || [])
      .map((table) => {
        const rows = getRows(document.form_data[table.key]);
        if (rows.length === 0) return "";

        return `
          <section class="section keep-together">
            <h2>${escapePrintHtml(table.title)}</h2>
            <table>
              <thead>
                <tr>${table.columns.map((column) => `<th>${escapePrintHtml(column.label)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) =>
                      `<tr>${table.columns.map((column) => `<td>${escapePrintHtml(row[column.key])}</td>`).join("")}</tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </section>`;
      })
      .join("");

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>${escapePrintHtml(document.title)} - 인쇄</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #fff; color: #111827; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
            .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 17mm 16mm; }
            header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 14px; border-bottom: 2px solid #111827; }
            .brand { font-size: 19px; font-weight: 900; letter-spacing: 0.22em; }
            .heading { flex: 1; text-align: center; }
            .heading p { margin: 0 0 7px; color: #64748b; font-size: 12px; font-weight: 700; }
            .heading h1 { margin: 0; font-size: 25px; line-height: 1.35; }
            .status { border: 1px solid #86efac; border-radius: 999px; background: #ecfdf3; color: #047857; padding: 7px 11px; font-size: 12px; font-weight: 800; white-space: nowrap; }
            .meta { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 16px; border: 1.5px solid #334155; }
            .meta div { min-height: 54px; padding: 9px 10px; border-right: 1px solid #64748b; }
            .meta div:last-child { border-right: 0; }
            .meta span, .field span, .approval-cell span { display: block; margin-bottom: 5px; color: #64748b; font-size: 11px; font-weight: 700; }
            .meta strong, .field strong { font-size: 13px; font-weight: 700; white-space: pre-wrap; word-break: break-word; }
            .section { margin-top: 18px; }
            .section h2 { margin: 0 0 9px; font-size: 14px; font-weight: 900; }
            .approval { display: grid; grid-template-columns: repeat(${Math.max(document.approval_lines?.length || 1, 1)}, 1fr); border: 1.5px solid #334155; }
            .approval-cell { min-height: 75px; border-right: 1px solid #64748b; padding: 9px; text-align: center; }
            .approval-cell:last-child { border-right: 0; }
            .approval-cell strong { display: block; margin: 8px 0 7px; font-size: 13px; }
            .approval-cell em { display: inline-block; color: #047857; font-size: 11px; font-style: normal; font-weight: 800; }
            .approval-cell small { display: block; margin-top: 6px; color: #64748b; font-size: 10px; }
            .reference { border: 1px solid #475569; padding: 10px; font-size: 12px; }
            .fields { display: grid; grid-template-columns: repeat(2, 1fr); border-top: 1.5px solid #334155; border-left: 1.5px solid #334155; }
            .field { min-height: 58px; padding: 9px 10px; border-right: 1.5px solid #334155; border-bottom: 1.5px solid #334155; }
            .field.wide { grid-column: 1 / -1; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #f8fafc; font-weight: 800; }
            th, td { border: 1.5px solid #334155; padding: 8px; text-align: left; word-break: break-word; }
            .attachments { margin: 0; padding: 0; list-style: none; border: 1.5px solid #334155; }
            .attachments li { display: flex; justify-content: space-between; gap: 16px; padding: 9px 10px; border-bottom: 1px solid #64748b; font-size: 12px; }
            .attachments li:last-child { border-bottom: 0; }
            .attachments .empty { color: #64748b; }
            footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #64748b; color: #475569; font-size: 10px; }
            .keep-together { break-inside: avoid; page-break-inside: avoid; }
            @page { size: A4; margin: 0; }
            @media print { .page { margin: 0; } }
          </style>
        </head>
        <body>
          <main class="page">
            <header>
              <div class="brand">ZETA</div>
              <div class="heading">
                <p>${escapePrintHtml(document.template_title)}</p>
                <h1>${escapePrintHtml(document.title)}</h1>
              </div>
              <div class="status">승인 완료</div>
            </header>
            <section class="meta keep-together">
              <div><span>작성자</span><strong>${escapePrintHtml(document.requester_name)}</strong></div>
              <div><span>소속</span><strong>${escapePrintHtml(document.requester_team || "-")}</strong></div>
              <div><span>작성일</span><strong>${escapePrintHtml(formatDate(document.submitted_at))}</strong></div>
              <div><span>승인 완료일</span><strong>${escapePrintHtml(formatDate(document.completed_at))}</strong></div>
            </section>
            <section class="section keep-together">
              <h2>결재선</h2>
              <div class="approval">${approvalMarkup}</div>
            </section>
            <section class="section keep-together">
              <h2>참조</h2>
              <div class="reference">${referenceMarkup}</div>
            </section>
            <section class="section">
              <h2>문서 내용</h2>
              <div class="fields">${fieldsMarkup}</div>
            </section>
            ${tablesMarkup}
            <section class="section keep-together">
              <h2>첨부파일 목록</h2>
              <ul class="attachments">${attachmentMarkup}</ul>
            </section>
            <footer>출력일: ${escapePrintHtml(printDate)} / 본 출력물은 ZETA 업무통합시스템의 승인 완료 문서를 기준으로 생성되었습니다.</footer>
          </main>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  const currentPendingLine = selectedDocument ? getFirstPendingLine(selectedDocument) : null;
  const canAct =
    selectedDocument?.status === "pending" && isCurrentApprovalLine(currentPendingLine);
  const getDocumentRelationText = (document: ApprovalDocumentRow) => {
    if (isCurrentRequester(document)) return "작성 문서";
    if (isCurrentApprover(document)) return "결재 문서";
    if (isCurrentReference(document)) return "참조 문서";
    return "관리 열람";
  };
  const renderProgressNotice = (document: ApprovalDocumentRow) => {
    const pendingLine = getFirstPendingLine(document);
    const awaitingMyApproval = document.status === "pending" && isCurrentApprovalLine(pendingLine);
    const headline =
      document.status === "approved"
        ? "최종 승인이 완료된 문서입니다."
        : document.status === "rejected"
          ? "반려 처리된 문서입니다."
          : awaitingMyApproval
            ? "현재 내 결재 처리가 필요합니다."
            : pendingLine
              ? `현재 ${pendingLine.approver_name}님의 결재를 기다리고 있습니다.`
              : "결재가 진행 중인 문서입니다.";
    const description =
      document.status === "approved"
        ? "완료된 문서의 첨부파일은 추가하거나 변경할 수 없습니다."
        : document.status === "rejected"
          ? "반려된 문서는 첨부파일을 추가하거나 변경할 수 없습니다."
          : awaitingMyApproval
            ? `${pendingLine?.role_label || "결재"} 단계의 승인 또는 반려를 진행해 주세요.`
            : pendingLine
              ? `${pendingLine.role_label} 단계가 완료되면 다음 결재로 진행됩니다.`
              : "결재선 진행 상태를 확인해 주세요.";

    return (
      <div
        style={{
          ...styles.progressNotice,
          ...(document.status === "approved"
            ? styles.progressNoticeApproved
            : document.status === "rejected"
              ? styles.progressNoticeRejected
              : awaitingMyApproval
                ? styles.progressNoticeAction
                : {}),
        }}
      >
        <strong>{headline}</strong>
        <span>{description}</span>
      </div>
    );
  };
  const renderDocumentButton = (document: ApprovalDocumentRow) => {
    const active = selectedDocument?.id === document.id;
    const pendingLine = getFirstPendingLine(document);
    const awaitingMyApproval = document.status === "pending" && isCurrentApprovalLine(pendingLine);
    const approvalSteps = getSortedApprovalLines(document);

    return (
      <button
        key={document.id}
        type="button"
        style={{
          ...styles.documentButton,
          ...(active ? styles.documentButtonActive : {}),
        }}
        onClick={() => {
          setSelectedDocumentId(document.id);
          setDetailModalDocumentId(document.id);
        }}
      >
        <span style={styles.documentTagRow}>
          <small style={styles.relationBadge}>{getDocumentRelationText(document)}</small>
          {awaitingMyApproval && <small style={styles.actionBadge}>내 결재 필요</small>}
        </span>
        <span style={styles.documentTopLine}>
          <strong style={styles.documentTitleText}>{document.title}</strong>
          <em
            style={{
              ...styles.statusBadge,
              ...(document.status === "approved"
                ? styles.statusBadgeApproved
                : document.status === "rejected"
                  ? styles.statusBadgeRejected
                  : awaitingMyApproval
                    ? styles.statusBadgeAction
                    : {}),
            }}
          >
            {awaitingMyApproval ? "결재 필요" : statusText(document.status)}
          </em>
        </span>
        <span style={styles.documentMeta}>
          {document.requester_name} · {formatDate(document.submitted_at)}
        </span>
        <span style={styles.documentProgress}>
          {progressText(document)}
        </span>
        {approvalSteps.length > 0 && (
          <span style={styles.documentStepRow}>
            {approvalSteps.map((line) => (
              <small
                key={line.id}
                style={{
                  ...styles.documentStepBadge,
                  ...(line.status === "approved"
                    ? styles.documentStepBadgeApproved
                    : line.status === "rejected"
                      ? styles.documentStepBadgeRejected
                      : pendingLine?.id === line.id
                        ? styles.documentStepBadgeCurrent
                        : {}),
                }}
              >
                {line.role_label} · {statusText(line.status)}
              </small>
            ))}
          </span>
        )}
      </button>
    );
  };
  const renderAttachments = (document: ApprovalDocumentRow) => {
    const rows = getDocumentAttachments(document.id);
    const canAdd = document.status === "pending" && isCurrentRequester(document);
    const canRemove = canAdd;

    return (
      <section style={styles.attachmentDetailBox}>
        <div style={styles.attachmentHeader}>
          <strong>첨부파일</strong>
          <span>{rows.length}개</span>
        </div>
        {document.status !== "pending" && (
          <p style={styles.attachmentLockedNotice}>
            {document.status === "approved"
              ? "승인 완료 문서의 첨부파일은 추가하거나 변경할 수 없습니다."
              : "반려 문서의 첨부파일은 추가하거나 변경할 수 없습니다."}
          </p>
        )}
        {rows.length === 0 ? (
          <p style={styles.attachmentEmpty}>등록된 첨부파일이 없습니다.</p>
        ) : (
          <div style={styles.attachmentList}>
            {rows.map((attachment) => (
              <div key={attachment.id} style={styles.attachmentItem}>
                <div style={styles.attachmentFileInfo}>
                  <strong>{attachment.original_name}</strong>
                  <span>{formatFileSize(attachment.size_bytes)}</span>
                </div>
                <div style={styles.attachmentActions}>
                  <button
                    type="button"
                    style={styles.ghostButton}
                    disabled={attachmentBusy}
                    onClick={() => downloadAttachment(attachment)}
                  >
                    다운로드
                  </button>
                  {canRemove && (
                    <button
                      type="button"
                      style={styles.smallDangerButton}
                      disabled={attachmentBusy}
                      onClick={() => deleteAttachment(attachment)}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {canAdd && attachmentFeatureReady && rows.length < MAX_ATTACHMENT_COUNT && (
          <label style={styles.attachmentAddButton}>
            파일 추가
            <input
              type="file"
              multiple
              accept={APPROVAL_ATTACHMENT_ACCEPT}
              style={styles.hiddenFileInput}
              disabled={attachmentBusy}
              onChange={(event) => addFilesToExistingDocument(document, event)}
            />
          </label>
        )}
      </section>
    );
  };

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
            {completedForMe.length}건
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
            <div style={styles.templateRows}>
              {templateRows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  style={{
                    ...styles.templateRow,
                    ...(isMobile ? styles.templateRowMobile : {}),
                  }}
                >
                  {row.map((template, templateIndex) => {
                    const active = template.key === selectedTemplate.key;

                    return (
                      <button
                        key={template.key}
                        type="button"
                        style={{
                          ...styles.templateButton,
                          ...(isMobile ? styles.templateButtonMobile : {}),
                          ...(templateIndex === manufacturingTemplateKeys.length - 1
                            ? styles.templateGroupBreak
                            : {}),
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
              ))}
            </div>
          </section>

          {legacyTemplateKeys.includes(selectedTemplate.key) && (
            <section style={styles.inputModeBox}>
              <div>
                <h3 style={styles.sectionTitle}>
                  {selectedTemplate.key === "manufacturing_request" ? "현황판 자동 등록" : "입력 방식"}
                </h3>
                <p style={styles.panelSubText}>
                  {selectedTemplate.key === "manufacturing_request"
                    ? "제조요구서를 상신하면 입력한 수주 정보로 메인 현황판에 새 건이 자동 생성됩니다."
                    : "기존 엑셀 양식에 가까운 구형양식과 웹 입력 중심의 신규양식 중 선택합니다."}
                </p>
              </div>
              <div style={styles.inputModeActions}>
                {[
                  ["legacy", "구형양식 입력"],
                  ["modern", "신규양식 입력"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    style={{
                      ...styles.modeButton,
                      ...(inputMode === mode ? styles.modeButtonActive : {}),
                    }}
                    onClick={() => setInputMode(mode as InputMode)}
                  >
                    {label}
                  </button>
                ))}
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
                onChange={(event) => handleEquipmentOrderChange(event.target.value)}
              >
                <option value="">연결하지 않음</option>
                {linkableEquipmentOrders.map((order) => (
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
            <div
              style={{
                ...styles.approvalReferenceRow,
                ...(isMobile ? styles.approvalReferenceRowMobile : {}),
              }}
            >
              <div style={styles.approverCompactArea}>
                <div style={styles.approvalLineGrid}>
                  {approverSlots.map((slot, index) => (
                    <label key={`${slot.roleLabel}-${index}`} style={styles.approverSlot}>
                      <span style={styles.approverLabel}>{slot.roleLabel}</span>
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
              </div>

              <div style={styles.referenceCompactArea}>
                <div style={styles.referenceCompactHeader}>
                  <h3 style={styles.sectionTitle}>참조 인원</h3>
                  <button type="button" style={styles.ghostButton} onClick={addReference}>
                    참조 추가
                  </button>
                </div>

                {referenceIds.length === 0 ? (
                  <div style={styles.referenceEmpty}>참조 없음</div>
                ) : (
                  <div style={styles.referenceGridCompact}>
                    {referenceIds.map((profileId, index) => (
                      <label key={`reference-${index}`} style={styles.approverSlot}>
                        <span style={styles.approverLabel}>참조 {index + 1}</span>
                        <div style={styles.approverControl}>
                          <select
                            style={styles.input}
                            value={profileId}
                            onChange={(event) => selectReference(index, event.target.value)}
                          >
                            <option value="">참조자 선택</option>
                            {sortedProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name || "-"} / {getDisplayTeam(profile) || "-"}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            style={styles.removeLineButton}
                            onClick={() => removeReference(index)}
                            aria-label={`참조 ${index + 1} 삭제`}
                          >
                            삭제
                          </button>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {selectedTemplate.key === "manufacturing_request" && inputMode === "legacy" ? (
            <LegacyManufacturingForm
              data={formData}
              isMobile={isMobile}
              onFieldChange={updateField}
            />
          ) : (selectedTemplate.key === "purchase_request" || selectedTemplate.key === "outsourcing_request") &&
            inputMode === "legacy" &&
            selectedTemplate.tables[0] ? (
            <LegacyPurchaseOutsourcingForm
              templateKey={selectedTemplate.key}
              data={formData}
              table={selectedTemplate.tables[0]}
              isMobile={isMobile}
              onFieldChange={updateField}
              onTableCellChange={updateTableCell}
              onAddRow={addTableRow}
              onRemoveRow={removeTableRow}
            />
          ) : selectedTemplate.key === "inspection_request" && inputMode === "legacy" && selectedTemplate.tables[0] ? (
            <LegacyInspectionRequestForm
              data={formData}
              table={selectedTemplate.tables[0]}
              isMobile={isMobile}
              onFieldChange={updateField}
              onTableCellChange={updateTableCell}
              onAddRow={addTableRow}
              onRemoveRow={removeTableRow}
            />
          ) : (
            <>
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
                          list={field.key === "client" ? "approval-customer-options" : undefined}
                          readOnly={readOnlyField}
                          onChange={(event) => updateField(field.key, event.target.value)}
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <datalist id="approval-customer-options">
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.name} />
                ))}
              </datalist>

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
            </>
          )}

          <section style={styles.attachmentUploadBox}>
            <div style={styles.attachmentHeader}>
              <div>
                <h3 style={styles.sectionTitle}>파일 첨부</h3>
                <p style={styles.panelSubText}>엑셀, PDF, 이미지, DWG/DXF, ZIP 파일 · 파일당 최대 30MB · 최대 10개</p>
              </div>
              {attachmentFeatureReady && (
                <label style={styles.attachmentAddButton}>
                  파일 선택
                  <input
                    type="file"
                    multiple
                    accept={APPROVAL_ATTACHMENT_ACCEPT}
                    style={styles.hiddenFileInput}
                    disabled={saving}
                    onChange={handlePendingAttachmentChange}
                  />
                </label>
              )}
            </div>
            {!attachmentFeatureReady ? (
              <p style={styles.attachmentNotice}>
                파일 첨부 기능은 저장소 설정 SQL 적용 후 사용할 수 있습니다. 기존 결재 등록은 그대로 이용할 수 있습니다.
              </p>
            ) : pendingAttachmentFiles.length === 0 ? (
              <p style={styles.attachmentEmpty}>상신할 파일을 선택해 주세요.</p>
            ) : (
              <div style={styles.attachmentList}>
                {pendingAttachmentFiles.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} style={styles.attachmentItem}>
                    <div style={styles.attachmentFileInfo}>
                      <strong>{file.name}</strong>
                      <span>{formatFileSize(file.size)}</span>
                    </div>
                    <button
                      type="button"
                      style={styles.smallDangerButton}
                      onClick={() =>
                        setPendingAttachmentFiles((prev) =>
                          prev.filter((_, currentIndex) => currentIndex !== index)
                        )
                      }
                    >
                      제거
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

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
              { key: "mine", label: isAdmin ? "전체 문서" : "내 문서", count: myDocuments.length },
              { key: "pending", label: "결재 대기", count: pendingForMe.length },
              { key: "reference", label: "참조", count: referenceForMe.length },
              { key: "history", label: "완료", count: completedForMe.length },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                style={{
                  ...styles.filterButton,
                  ...(activeFilter === key ? styles.filterButtonActive : {}),
                }}
                onClick={() => setActiveFilter(key as typeof activeFilter)}
              >
                <span>{label}</span>
                <small>{count}</small>
              </button>
            ))}
          </div>

          <input
            type="search"
            value={documentSearchQuery}
            onChange={(event) => setDocumentSearchQuery(event.target.value)}
            placeholder="문서명, 작성자, 고객사, 장비명, S/N 검색"
            style={styles.documentSearchInput}
          />

          <button
            type="button"
            style={{
              ...styles.documentFilterToggle,
              ...(hasDetailedFilters ? styles.documentFilterToggleActive : {}),
            }}
            onClick={() => setShowDocumentFilters((prev) => !prev)}
          >
            <span>상세 필터 {hasDetailedFilters ? "적용 중" : ""}</span>
            <strong>{showDocumentFilters ? "접기" : "펼치기"}</strong>
          </button>

          {showDocumentFilters && <section style={styles.documentFilterPanel}>
            <div style={styles.documentFilterHeader}>
              <strong>상세 필터</strong>
              {hasDetailedFilters && (
                <button
                  type="button"
                  style={styles.filterResetButton}
                  onClick={() => {
                    setDocumentTemplateFilter("all");
                    setDocumentStatusFilter("all");
                    setDocumentRequesterFilter("all");
                    setDocumentDateFrom("");
                    setDocumentDateTo("");
                    setDocumentsWithAttachmentsOnly(false);
                  }}
                >
                  초기화
                </button>
              )}
            </div>
            <div style={styles.documentFilterGrid}>
              <label style={styles.documentFilterField}>
                <span>양식</span>
                <select
                  style={styles.documentFilterControl}
                  value={documentTemplateFilter}
                  onChange={(event) => setDocumentTemplateFilter(event.target.value)}
                >
                  <option value="all">전체</option>
                  {templates.map((template) => (
                    <option key={template.key} value={template.key}>{template.title}</option>
                  ))}
                </select>
              </label>
              <label style={styles.documentFilterField}>
                <span>상태</span>
                <select
                  style={styles.documentFilterControl}
                  value={documentStatusFilter}
                  onChange={(event) => setDocumentStatusFilter(event.target.value as DocumentStatusFilter)}
                >
                  <option value="all">전체</option>
                  <option value="pending">진행중</option>
                  <option value="approved">승인완료</option>
                  <option value="rejected">반려</option>
                </select>
              </label>
              <label style={{ ...styles.documentFilterField, ...styles.documentFilterFieldWide }}>
                <span>작성자</span>
                <select
                  style={styles.documentFilterControl}
                  value={documentRequesterFilter}
                  onChange={(event) => setDocumentRequesterFilter(event.target.value)}
                >
                  <option value="all">전체 작성자</option>
                  {requesterFilterOptions.map((requesterName) => (
                    <option key={requesterName} value={requesterName}>{requesterName}</option>
                  ))}
                </select>
              </label>
              <label style={styles.documentFilterField}>
                <span>작성일 시작</span>
                <input
                  style={styles.documentFilterControl}
                  type="date"
                  value={documentDateFrom}
                  onChange={(event) => setDocumentDateFrom(event.target.value)}
                />
              </label>
              <label style={styles.documentFilterField}>
                <span>작성일 종료</span>
                <input
                  style={styles.documentFilterControl}
                  type="date"
                  value={documentDateTo}
                  onChange={(event) => setDocumentDateTo(event.target.value)}
                />
              </label>
            </div>
            <label style={styles.attachmentOnlyFilter}>
              <input
                type="checkbox"
                checked={documentsWithAttachmentsOnly}
                onChange={(event) => setDocumentsWithAttachmentsOnly(event.target.checked)}
              />
              첨부파일이 있는 문서만 보기
            </label>
          </section>}

          <div
            style={{
              ...styles.documentList,
              ...(isMobile ? styles.documentListMobile : {}),
            }}
          >
            {filteredDocuments.length === 0 ? (
              <div style={styles.emptyBox}>표시할 문서가 없습니다.</div>
            ) : activeFilter === "history" ? (
              historyMonthGroups.map(({ monthKey, rows }) => {
                const expanded = expandedHistoryMonths.includes(monthKey);

                return (
                  <section key={monthKey} style={styles.historyMonthGroup}>
                    <button
                      type="button"
                      style={styles.historyMonthHeader}
                      onClick={() =>
                        setExpandedHistoryMonths((prev) =>
                          prev.includes(monthKey)
                            ? prev.filter((item) => item !== monthKey)
                            : [...prev, monthKey]
                        )
                      }
                    >
                      <span>{formatMonthLabel(monthKey)}</span>
                      <strong>{rows.length}건</strong>
                      <em>{expanded ? "접기" : "펼치기"}</em>
                    </button>

                    {expanded && (
                      <div style={styles.historyMonthList}>
                        {rows.map((document) => renderDocumentButton(document))}
                      </div>
                    )}
                  </section>
                );
              })
            ) : (
              filteredDocuments.map((document) => renderDocumentButton(document))
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

              {renderProgressNotice(selectedDocument)}

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

              {getReferenceInfos(selectedDocument.form_data).length > 0 && (
                <div style={styles.referenceDetailBox}>
                  <span style={styles.referenceDetailLabel}>참조</span>
                  <div style={styles.referenceChipRow}>
                    {getReferenceInfos(selectedDocument.form_data).map((reference) => (
                      <span key={reference.id} style={styles.referenceChip}>
                        {reference.name} / {reference.team || "-"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {renderAttachments(selectedDocument)}

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
              {isAdmin && (
                <div style={styles.actionRow}>
                  <button
                    type="button"
                    style={styles.dangerButton}
                    onClick={deleteSelectedDocument}
                    disabled={saving}
                  >
                    관리자 삭제
                  </button>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      {detailModalDocument && (
        <div style={styles.modalOverlay} onClick={() => setDetailModalDocumentId(null)}>
          <section
            style={{
              ...styles.modalPanel,
              ...(isMobile ? styles.modalPanelMobile : {}),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.templateCategory}>{detailModalDocument.template_title}</span>
                <h3 style={styles.detailTitle}>{detailModalDocument.title}</h3>
              </div>
              <div style={styles.modalHeaderActions}>
                {detailModalDocument.status === "approved" && (
                  <button
                    type="button"
                    style={styles.printButton}
                    onClick={() => printApprovedDocument(detailModalDocument)}
                  >
                    인쇄 / PDF 저장
                  </button>
                )}
                <button
                  type="button"
                  style={styles.ghostButton}
                  onClick={() => setDetailModalDocumentId(null)}
                >
                  닫기
                </button>
              </div>
            </div>

            <div style={{ ...styles.modalMetaGrid, ...(isMobile ? styles.modalMetaGridMobile : {}) }}>
              <div>
                <span>작성자</span>
                <strong>{detailModalDocument.requester_name}</strong>
              </div>
              <div>
                <span>작성일</span>
                <strong>{formatDate(detailModalDocument.submitted_at)}</strong>
              </div>
              <div>
                <span>상태</span>
                <strong>{statusText(detailModalDocument.status)}</strong>
              </div>
            </div>

            {renderProgressNotice(detailModalDocument)}

            <div style={styles.lineStatusList}>
              {(detailModalDocument.approval_lines || []).map((line) => (
                <div key={line.id} style={styles.lineStatusItem}>
                  <span>{line.role_label}</span>
                  <strong>{line.approver_name}</strong>
                  <em>{statusText(line.status)}</em>
                </div>
              ))}
            </div>

            <div style={{ ...styles.documentFieldGrid, ...(isMobile ? styles.documentFieldGridMobile : {}) }}>
              {(templateMap[detailModalDocument.template_key]?.fields || []).map((field) => (
                <div
                  key={field.key}
                  style={{
                    ...styles.documentFieldItem,
                    ...(field.span === 2 ? styles.documentFieldItemWide : {}),
                  }}
                >
                  <span>{field.label}</span>
                  <strong>{formatDocumentValue(detailModalDocument.form_data[field.key])}</strong>
                </div>
              ))}
            </div>

            {renderAttachments(detailModalDocument)}

            {(templateMap[detailModalDocument.template_key]?.tables || []).map((table) => {
              const rows = getRows(detailModalDocument.form_data[table.key]);
              if (rows.length === 0) return null;

              return (
                <div key={table.key} style={styles.documentTableBox}>
                  <h4 style={styles.documentTableTitle}>{table.title}</h4>
                  <div style={styles.documentTableWrap}>
                    <table style={styles.documentTable}>
                      <thead>
                        <tr>
                          {table.columns.map((column) => (
                            <th key={column.key}>{column.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {table.columns.map((column) => (
                              <td key={column.key}>{formatDocumentValue(row[column.key])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </section>
  );
}

type LegacyManufacturingFormProps = {
  data: Record<string, unknown>;
  isMobile: boolean;
  onFieldChange: (key: string, value: string) => void;
};

function LegacyManufacturingForm({
  data,
  isMobile,
  onFieldChange,
}: LegacyManufacturingFormProps) {
  const value = (key: string) => String(data[key] || "");
  const requestType = value("requestType") || "제조";

  return (
    <section style={styles.legacySheet}>
      <div style={styles.legacyTopNotice}>
        <label style={styles.legacyMiniField}>
          <span>현황 구분</span>
          <select
            style={styles.legacyInput}
            value={value("orderCategory")}
            onChange={(event) => onFieldChange("orderCategory", event.target.value)}
          >
            <option value="">선택</option>
            <option value="국내 장비">국내 장비</option>
            <option value="해외 장비">해외 장비</option>
            <option value="부품">부품</option>
          </select>
        </label>
        <label style={styles.legacyMiniField}>
          <span>국가/구분</span>
          <input
            style={styles.legacyInput}
            value={value("country")}
            onChange={(event) => onFieldChange("country", event.target.value)}
          />
        </label>
        <label style={styles.legacyMiniField}>
          <span>수주일</span>
          <input
            type="date"
            style={styles.legacyInput}
            value={value("orderDate")}
            onChange={(event) => onFieldChange("orderDate", event.target.value)}
          />
        </label>
      </div>

      <div style={{ ...styles.legacyPaper, ...(isMobile ? styles.legacyPaperMobile : {}) }}>
        <div style={styles.legacyHeaderSingle}>
          <div style={styles.legacyDocTitle}>
            {[
              ["제조", "제조"],
              ["협조", "협조"],
            ].map(([type, label]) => (
              <button
                key={type}
                type="button"
                style={styles.legacyCheckButton}
                onClick={() => onFieldChange("requestType", type)}
                aria-pressed={requestType === type}
              >
                <span
                  style={{
                    ...styles.legacyCheckBox,
                    ...(requestType === type ? styles.legacyCheckBoxActive : {}),
                  }}
                />
                {label}
              </button>
            ))}
            <span>요구서</span>
          </div>
        </div>

        <div style={styles.legacyCopyLabel}>( 영업부 보관용 )</div>

        <div style={styles.legacyGrid}>
          <label style={styles.legacyCell}>
            <span>제품명</span>
            <input
              style={styles.legacyInput}
              value={value("productName")}
              onChange={(event) => onFieldChange("productName", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>수 량</span>
            <input
              style={styles.legacyInput}
              value={value("qty")}
              onChange={(event) => onFieldChange("qty", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>작성일</span>
            <input
              type="date"
              style={styles.legacyInput}
              value={value("createdDate")}
              onChange={(event) => onFieldChange("createdDate", event.target.value)}
            />
          </label>
          <label style={{ ...styles.legacyCell, gridColumn: "span 2" }}>
            <span>발주처</span>
            <input
              style={styles.legacyInput}
              value={value("client")}
              onChange={(event) => onFieldChange("client", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>납 기(내)</span>
            <input
              type="date"
              style={styles.legacyInput}
              value={value("deliveryDate")}
              onChange={(event) => onFieldChange("deliveryDate", event.target.value)}
            />
          </label>
          <label style={{ ...styles.legacyCell, gridColumn: "span 2" }}>
            <span>문서 NO</span>
            <input
              style={styles.legacyInput}
              value={value("documentNo")}
              onChange={(event) => onFieldChange("documentNo", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>Serial No</span>
            <input
              style={styles.legacyInput}
              value={value("serialNo")}
              onChange={(event) => onFieldChange("serialNo", event.target.value)}
            />
          </label>
        </div>

        <div style={styles.legacySpecTitle}>S P E C I F I C A T I O N</div>
        <div style={styles.legacySpecRows}>
          <label style={styles.legacyWideRow}>
            <span>전 원</span>
            <input
              style={styles.legacyInput}
              value={value("power")}
              onChange={(event) => onFieldChange("power", event.target.value)}
            />
          </label>
          <label style={styles.legacyWideRow}>
            <span>제품규격</span>
            <textarea
              style={{ ...styles.legacyTextarea, ...styles.legacyProductSpecTextarea }}
              value={value("productSpec")}
              onChange={(event) => onFieldChange("productSpec", event.target.value)}
            />
          </label>
          <label style={styles.legacyWideRow}>
            <span>추가사항</span>
            <textarea
              style={styles.legacyTextarea}
              value={value("additional")}
              onChange={(event) => onFieldChange("additional", event.target.value)}
            />
          </label>
          <label style={styles.legacyWideRow}>
            <span>참고사항</span>
            <textarea
              style={styles.legacyTextarea}
              value={value("reference")}
              onChange={(event) => onFieldChange("reference", event.target.value)}
            />
          </label>
          <label style={styles.legacyWideRow}>
            <span>첨부 메모(기존)</span>
            <input
              style={styles.legacyInput}
              value={value("attachment")}
              onChange={(event) => onFieldChange("attachment", event.target.value)}
            />
          </label>
        </div>
      </div>
    </section>
  );
}

type LegacyPurchaseOutsourcingFormProps = {
  templateKey: string;
  data: Record<string, unknown>;
  table: TableDef;
  isMobile: boolean;
  onFieldChange: (key: string, value: string) => void;
  onTableCellChange: (table: TableDef, rowIndex: number, columnKey: string, value: string) => void;
  onAddRow: (table: TableDef) => void;
  onRemoveRow: (table: TableDef, rowIndex: number) => void;
};

function LegacyPurchaseOutsourcingForm({
  templateKey,
  data,
  table,
  isMobile,
  onFieldChange,
  onTableCellChange,
  onAddRow,
  onRemoveRow,
}: LegacyPurchaseOutsourcingFormProps) {
  const value = (key: string) => String(data[key] || "");
  const isOutsourcing = templateKey === "outsourcing_request";
  const specColumn = isOutsourcing ? "drawingNo" : "spec";
  const specLabel = isOutsourcing ? "도면번호" : "규격";
  const title = isOutsourcing ? "외주의뢰서" : "구매의뢰서";
  const rows = getRows(data[table.key]);
  const columns = [
    { key: "name", label: "품명" },
    { key: specColumn, label: specLabel },
    { key: "unit", label: "단위" },
    { key: "qty", label: "수량" },
    { key: "memo", label: "비고" },
  ];

  return (
    <section style={styles.legacySheet}>
      <div style={{ ...styles.legacyPaper, ...(isMobile ? styles.legacyPaperMobile : {}) }}>
        <div style={styles.legacyHeaderSingle}>
          <div style={styles.legacyDocTitle}>{title}</div>
        </div>

        <div style={styles.legacyGrid}>
          <label style={{ ...styles.legacyCell, gridColumn: "span 2" }}>
            <span>부서 관리 번호</span>
            <input
              style={styles.legacyInput}
              value={value("controlNo")}
              onChange={(event) => onFieldChange("controlNo", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>의뢰인</span>
            <input
              style={styles.legacyInput}
              value={value("requester")}
              onChange={(event) => onFieldChange("requester", event.target.value)}
            />
          </label>
          <label style={{ ...styles.legacyCell, gridColumn: "span 2" }}>
            <span>수주처</span>
            <input
              style={styles.legacyInput}
              value={value("client")}
              onChange={(event) => onFieldChange("client", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>입고장소</span>
            <input
              style={styles.legacyInput}
              value={value("deliveryPlace")}
              onChange={(event) => onFieldChange("deliveryPlace", event.target.value)}
            />
          </label>
          <label style={{ ...styles.legacyCell, gridColumn: "span 2" }}>
            <span>장비명</span>
            <input
              style={styles.legacyInput}
              value={value("equipment")}
              onChange={(event) => onFieldChange("equipment", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>S/N</span>
            <input
              style={styles.legacyInput}
              value={value("serialNo")}
              onChange={(event) => onFieldChange("serialNo", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>의뢰일</span>
            <input
              type="date"
              style={styles.legacyInput}
              value={value("requestDate")}
              onChange={(event) => onFieldChange("requestDate", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>입고요청일</span>
            <input
              type="date"
              style={styles.legacyInput}
              value={value("dueDate")}
              onChange={(event) => onFieldChange("dueDate", event.target.value)}
            />
          </label>
          <label style={styles.legacyCell}>
            <span>사용구분</span>
            <select
              style={styles.legacyInput}
              value={value("usageType")}
              onChange={(event) => onFieldChange("usageType", event.target.value)}
            >
              <option value="">선택</option>
              {["원자재", "재공품", "공용품", "판매", "무상", "사무용품", "기타"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...styles.legacyCell, gridColumn: "span 3" }}>
            <span>비교자료</span>
            <input
              style={styles.legacyInput}
              value={value("reference")}
              onChange={(event) => onFieldChange("reference", event.target.value)}
            />
          </label>
        </div>

        <div style={styles.legacySpecTitle}>I T E M&nbsp;&nbsp; L I S T</div>
        <table style={styles.legacyItemTable}>
          <thead>
            <tr>
              <th style={{ ...styles.legacyItemTh, width: "52px" }}>No</th>
              {columns.map((column) => (
                <th key={column.key} style={styles.legacyItemTh}>
                  {column.label}
                </th>
              ))}
              <th style={{ ...styles.legacyItemTh, width: "64px" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td style={styles.legacyItemTd}>{rowIndex + 1}</td>
                {columns.map((column) => (
                  <td key={column.key} style={styles.legacyItemTd}>
                    <input
                      style={styles.legacyItemInput}
                      value={row[column.key] || ""}
                      onChange={(event) =>
                        onTableCellChange(table, rowIndex, column.key, event.target.value)
                      }
                    />
                  </td>
                ))}
                <td style={styles.legacyItemTd}>
                  <button
                    type="button"
                    style={styles.smallDangerButton}
                    onClick={() => onRemoveRow(table, rowIndex)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={styles.legacyItemActions}>
          <button type="button" style={styles.ghostButton} onClick={() => onAddRow(table)}>
            행 추가
          </button>
        </div>
      </div>
    </section>
  );
}

type LegacyInspectionRequestFormProps = {
  data: Record<string, unknown>;
  table: TableDef;
  isMobile: boolean;
  onFieldChange: (key: string, value: string) => void;
  onTableCellChange: (table: TableDef, rowIndex: number, columnKey: string, value: string) => void;
  onAddRow: (table: TableDef) => void;
  onRemoveRow: (table: TableDef, rowIndex: number) => void;
};

function LegacyInspectionRequestForm({
  data,
  table,
  isMobile,
  onFieldChange,
  onTableCellChange,
  onAddRow,
  onRemoveRow,
}: LegacyInspectionRequestFormProps) {
  const value = (key: string) => String(data[key] || "");
  const rows = getRows(data[table.key]);
  const columns = [
    { key: "productName", label: "제품명", width: "19%" },
    { key: "modelName", label: "모델명", width: "15%" },
    { key: "serialNo", label: "S/N", width: "15%" },
    { key: "spec", label: "제품 규격", width: "51%" },
  ];

  return (
    <section style={styles.legacySheet}>
      <div style={{ ...styles.legacyPaper, ...(isMobile ? styles.legacyPaperMobile : {}) }}>
        <div style={styles.legacyInspectionHeader}>
          <div style={styles.legacyInspectionTitleBlock}>
            <strong>제 품 검 사 요 청 서</strong>
            <label style={styles.legacyInspectionDateLine}>
              <span>작성일</span>
              <input
                type="date"
                style={styles.legacyInspectionInlineInput}
                value={value("requestDate")}
                onChange={(event) => onFieldChange("requestDate", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div style={styles.legacyInspectionInfoGrid}>
          <label style={styles.legacyInspectionInfoCell}>
            <span>발 주 처</span>
            <input
              style={styles.legacyInput}
              value={value("client")}
              onChange={(event) => onFieldChange("client", event.target.value)}
            />
          </label>
          <label style={styles.legacyInspectionInfoCell}>
            <span>담 당 자</span>
            <input
              style={styles.legacyInput}
              value={value("contact")}
              onChange={(event) => onFieldChange("contact", event.target.value)}
            />
          </label>
          <label style={styles.legacyInspectionInfoCell}>
            <span>제조완료일</span>
            <input
              type="date"
              style={styles.legacyInput}
              value={value("manufacturedDate")}
              onChange={(event) => onFieldChange("manufacturedDate", event.target.value)}
            />
          </label>
          <label style={styles.legacyInspectionInfoCell}>
            <span>검수 요청일</span>
            <input
              type="date"
              style={styles.legacyInput}
              value={value("inspectionDate")}
              onChange={(event) => onFieldChange("inspectionDate", event.target.value)}
            />
          </label>
        </div>

        <div style={styles.legacySpecTitle}>S P E C I F I C A T I O N</div>
        <table style={styles.legacyItemTable}>
          <thead>
            <tr>
              <th style={{ ...styles.legacyItemTh, width: "52px" }}>No</th>
              {columns.map((column) => (
                <th key={column.key} style={{ ...styles.legacyItemTh, width: column.width }}>
                  {column.label}
                </th>
              ))}
              <th style={{ ...styles.legacyItemTh, width: "64px" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td style={styles.legacyItemTd}>{rowIndex + 1}</td>
                {columns.map((column) => (
                  <td key={column.key} style={styles.legacyItemTd}>
                    <input
                      style={styles.legacyItemInput}
                      value={row[column.key] || ""}
                      onChange={(event) =>
                        onTableCellChange(table, rowIndex, column.key, event.target.value)
                      }
                    />
                  </td>
                ))}
                <td style={styles.legacyItemTd}>
                  <button
                    type="button"
                    style={styles.smallDangerButton}
                    onClick={() => onRemoveRow(table, rowIndex)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={styles.legacyItemActions}>
          <button type="button" style={styles.ghostButton} onClick={() => onAddRow(table)}>
            행 추가
          </button>
        </div>

        <div style={styles.legacyInspectionQaTitle}>Q A팀 접 수 확 인</div>
        <div style={styles.legacyInspectionQaGrid}>
          <label style={styles.legacyInspectionQaCell}>
            <span>접 수 일</span>
            <input
              type="date"
              style={styles.legacyInput}
              value={value("qaReceivedDate")}
              onChange={(event) => onFieldChange("qaReceivedDate", event.target.value)}
            />
          </label>
          <label style={styles.legacyInspectionQaCell}>
            <span>QA담당자</span>
            <input
              style={styles.legacyInput}
              value={value("qaOwner")}
              onChange={(event) => onFieldChange("qaOwner", event.target.value)}
            />
          </label>
          <label style={{ ...styles.legacyInspectionQaCell, gridColumn: "span 2" }}>
            <span>접수 메모</span>
            <input
              style={styles.legacyInput}
              value={value("qaMemo")}
              onChange={(event) => onFieldChange("qaMemo", event.target.value)}
            />
          </label>
        </div>
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
    gap: "10px",
    marginBottom: "14px",
  },
  summaryGridMobile: {
    gridTemplateColumns: "repeat(3, minmax(86px, 1fr))",
    gap: "8px",
    marginBottom: "12px",
    overflowX: "auto",
  },
  summaryCard: {
    minHeight: "72px",
    border: "1px solid #e3e7ed",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "13px 14px",
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
    marginTop: "7px",
    color: "#111820",
    fontSize: "24px",
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
    gridTemplateColumns: "minmax(640px, 1fr) 360px",
    gap: "16px",
    alignItems: "start",
  },
  layoutMobile: {
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "12px",
  },
  formPanel: {
    border: "1px solid #e1e5ea",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "18px 20px",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
  },
  documentPanel: {
    position: "sticky",
    top: "94px",
    border: "1px solid #e1e5ea",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "14px",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
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
    fontSize: "18px",
    fontWeight: 850,
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
    padding: "13px 0",
    marginBottom: "14px",
  },
  templateRows: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  templateRow: {
    display: "flex",
    flexWrap: "nowrap",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "2px",
  },
  templateRowMobile: {
    display: "flex",
    flexWrap: "nowrap",
    gap: "7px",
    overflowX: "auto",
    scrollSnapType: "x proximity",
  },
  templateButton: {
    flex: "0 0 128px",
    minWidth: "128px",
    minHeight: "50px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: "4px",
    border: "1px solid #e1e5ea",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    padding: "8px 12px",
    textAlign: "left",
    cursor: "pointer",
    fontSize: "13px",
  },
  templateButtonMobile: {
    flexBasis: "118px",
    minWidth: "118px",
    minHeight: "50px",
    padding: "8px 10px",
    fontSize: "12px",
    scrollSnapAlign: "start",
  },
  templateGroupBreak: {
    marginRight: "18px",
  },
  templateButtonActive: {
    borderColor: "#0f8a56",
    background: "#eef6f1",
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
    height: "38px",
    border: "1px solid #cfd6df",
    borderRadius: "6px",
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
    borderRadius: "6px",
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
    border: "1px solid #0f8a56",
    borderRadius: "8px",
    background: "#0f8a56",
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
    height: "32px",
    border: "1px solid #cfd6df",
    borderRadius: "6px",
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
  attachmentUploadBox: {
    marginTop: "18px",
    border: "1px solid #e1e5ea",
    borderRadius: "8px",
    background: "#fbfcfd",
    padding: "14px",
  },
  attachmentDetailBox: {
    marginTop: "14px",
    border: "1px solid #edf0f3",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "10px",
  },
  attachmentHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    color: "#344054",
    fontSize: "12px",
    fontWeight: 800,
    marginBottom: "9px",
  },
  attachmentNotice: {
    margin: 0,
    borderRadius: "7px",
    background: "#fffbeb",
    color: "#92400e",
    padding: "10px",
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1.5,
  },
  attachmentLockedNotice: {
    margin: "0 0 9px",
    borderRadius: "7px",
    background: "#f8fafc",
    color: "#475467",
    padding: "8px 9px",
    fontSize: "11px",
    fontWeight: 700,
    lineHeight: 1.45,
  },
  attachmentEmpty: {
    margin: 0,
    color: "#667085",
    fontSize: "12px",
    fontWeight: 600,
  },
  attachmentList: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  },
  attachmentItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    border: "1px solid #edf0f3",
    borderRadius: "7px",
    background: "#ffffff",
    padding: "8px",
  },
  attachmentFileInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: 0,
    color: "#111827",
    fontSize: "12px",
    wordBreak: "break-all",
  },
  attachmentActions: {
    display: "flex",
    gap: "5px",
    flexShrink: 0,
  },
  attachmentAddButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "72px",
    height: "32px",
    border: "1px solid #0f8a56",
    borderRadius: "7px",
    background: "#ffffff",
    color: "#0f8a56",
    padding: "0 10px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  hiddenFileInput: {
    display: "none",
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
  legacySheet: {
    marginTop: "16px",
    borderTop: "1px solid #edf0f3",
    paddingTop: "16px",
    width: "100%",
    maxWidth: "100%",
    overflowX: "auto",
    overflowY: "visible",
    WebkitOverflowScrolling: "touch",
    overscrollBehaviorX: "contain",
    paddingBottom: "8px",
  },
  legacyTopNotice: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "12px",
  },
  legacyMiniField: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    color: "#475467",
    fontSize: "11px",
    fontWeight: 800,
  },
  legacyPaper: {
    minWidth: "820px",
    border: "1px solid #d8dee7",
    borderRadius: "4px",
    background: "#ffffff",
    padding: "16px",
    overflowX: "auto",
  },
  legacyPaperMobile: {
    minWidth: "760px",
  },
  legacyHeaderGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 360px",
    alignItems: "stretch",
    gap: "12px",
    marginBottom: "8px",
  },
  legacyHeaderSingle: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    marginBottom: "8px",
  },
  legacyDocTitle: {
    minHeight: "56px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    flexWrap: "wrap",
    border: "1px solid #2d3748",
    color: "#0f172a",
    fontSize: "22px",
    fontWeight: 850,
    letterSpacing: "0",
  },
  legacyCheckButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    border: 0,
    background: "transparent",
    color: "inherit",
    padding: "0 1px",
    font: "inherit",
    fontWeight: 850,
    letterSpacing: "0",
    cursor: "pointer",
  },
  legacyCheckBox: {
    width: "13px",
    height: "13px",
    display: "inline-block",
    border: "2px solid #0f172a",
    borderRadius: "2px",
    background: "#ffffff",
    boxSizing: "border-box",
  },
  legacyCheckBoxActive: {
    background: "#0f172a",
  },
  legacyApprovalBox: {
    display: "grid",
    gridTemplateColumns: "44px repeat(5, 1fr)",
    borderTop: "1px solid #2d3748",
    borderLeft: "1px solid #2d3748",
  },
  legacyApprovalTitle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRight: "1px solid #2d3748",
    borderBottom: "1px solid #2d3748",
    color: "#0f172a",
    fontSize: "12px",
    fontWeight: 800,
    writingMode: "vertical-rl",
  },
  legacyApprovalCell: {
    minHeight: "56px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    borderRight: "1px solid #2d3748",
    borderBottom: "1px solid #2d3748",
    color: "#0f172a",
    paddingTop: "7px",
    fontSize: "12px",
    fontWeight: 800,
  },
  legacyCopyLabel: {
    color: "#334155",
    fontSize: "12.5px",
    fontWeight: 800,
    margin: "8px 0 10px",
  },
  legacyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    borderTop: "1px solid #2d3748",
    borderLeft: "1px solid #2d3748",
  },
  legacyCell: {
    minHeight: "60px",
    display: "grid",
    gridTemplateColumns: "92px minmax(0, 1fr)",
    alignItems: "center",
    gap: "10px",
    borderRight: "1px solid #2d3748",
    borderBottom: "1px solid #2d3748",
    color: "#0f172a",
    padding: "9px 10px",
    fontSize: "13px",
    fontWeight: 850,
  },
  legacySpecTitle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "36px",
    borderLeft: "1px solid #2d3748",
    borderRight: "1px solid #2d3748",
    borderBottom: "1px solid #2d3748",
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "15px",
    fontWeight: 850,
    letterSpacing: "0.18em",
  },
  legacySpecRows: {
    borderLeft: "1px solid #2d3748",
    borderRight: "1px solid #2d3748",
  },
  legacyWideRow: {
    minHeight: "46px",
    display: "grid",
    gridTemplateColumns: "118px minmax(0, 1fr)",
    alignItems: "stretch",
    borderBottom: "1px solid #2d3748",
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: 850,
  },
  legacyInput: {
    width: "100%",
    minWidth: 0,
    height: "36px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    background: "#ffffff",
    color: "#0f172a",
    padding: "0 11px",
    fontSize: "14px",
    fontWeight: 600,
    boxSizing: "border-box",
  },
  legacyTextarea: {
    width: "100%",
    minHeight: "78px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    background: "#ffffff",
    color: "#0f172a",
    padding: "10px 11px",
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: 1.45,
    resize: "vertical",
    boxSizing: "border-box",
  },
  legacyProductSpecTextarea: {
    minHeight: "180px",
  },
  legacyItemTable: {
    width: "100%",
    borderCollapse: "collapse",
    borderLeft: "1px solid #2d3748",
    borderRight: "1px solid #2d3748",
    color: "#0f172a",
  },
  legacyItemTh: {
    height: "38px",
    borderBottom: "1px solid #2d3748",
    borderRight: "1px solid #2d3748",
    background: "#f8fafc",
    color: "#0f172a",
    padding: "7px",
    fontSize: "13px",
    fontWeight: 850,
    textAlign: "center",
  },
  legacyItemTd: {
    borderBottom: "1px solid #2d3748",
    borderRight: "1px solid #2d3748",
    padding: "6px",
    fontSize: "13px",
    fontWeight: 750,
    textAlign: "center",
  },
  legacyItemInput: {
    width: "100%",
    minWidth: 0,
    height: "34px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    background: "#ffffff",
    color: "#0f172a",
    padding: "0 9px",
    fontSize: "14px",
    fontWeight: 600,
    boxSizing: "border-box",
  },
  legacyItemActions: {
    display: "flex",
    justifyContent: "flex-end",
    borderLeft: "1px solid #2d3748",
    borderRight: "1px solid #2d3748",
    borderBottom: "1px solid #2d3748",
    padding: "8px",
    marginBottom: "0",
  },
  legacyInspectionHeader: {
    border: "1px solid #2d3748",
    borderBottom: 0,
    background: "#ffffff",
  },
  legacyInspectionTitleBlock: {
    minHeight: "86px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    color: "#0f172a",
    fontSize: "24px",
    fontWeight: 850,
    letterSpacing: "0.08em",
  },
  legacyInspectionDateLine: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    color: "#334155",
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: "0",
  },
  legacyInspectionInlineInput: {
    height: "32px",
    width: "160px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    background: "#ffffff",
    color: "#0f172a",
    padding: "0 9px",
    fontSize: "13px",
    fontWeight: 700,
    boxSizing: "border-box",
  },
  legacyInspectionInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    borderTop: "1px solid #2d3748",
    borderLeft: "1px solid #2d3748",
  },
  legacyInspectionInfoCell: {
    minHeight: "56px",
    display: "grid",
    gridTemplateColumns: "132px minmax(0, 1fr)",
    alignItems: "center",
    gap: "10px",
    borderRight: "1px solid #2d3748",
    borderBottom: "1px solid #2d3748",
    color: "#0f172a",
    padding: "8px 10px",
    fontSize: "13px",
    fontWeight: 850,
  },
  legacyInspectionQaTitle: {
    minHeight: "38px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderLeft: "1px solid #2d3748",
    borderRight: "1px solid #2d3748",
    borderBottom: "1px solid #2d3748",
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "15px",
    fontWeight: 850,
    letterSpacing: "0.12em",
  },
  legacyInspectionQaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    borderLeft: "1px solid #2d3748",
    borderBottom: "1px solid #2d3748",
  },
  legacyInspectionQaCell: {
    minHeight: "54px",
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 1fr)",
    alignItems: "center",
    gap: "8px",
    borderRight: "1px solid #2d3748",
    color: "#0f172a",
    padding: "8px",
    fontSize: "13px",
    fontWeight: 850,
  },
  approvalLineBox: {
    marginTop: "20px",
    borderTop: "1px solid #edf0f3",
    paddingTop: "16px",
  },
  approvalLineBoxTop: {
    border: "1px solid #e1e5ea",
    borderRadius: "8px",
    background: "#f8fafc",
    padding: "13px",
    marginBottom: "14px",
  },
  approvalReferenceRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 340px)",
    gap: "10px",
    alignItems: "start",
  },
  approvalReferenceRowMobile: {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  approverCompactArea: {
    minWidth: 0,
  },
  orderReferenceBox: {
    border: "1px solid #e1e5ea",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "14px",
    marginBottom: "16px",
  },
  inputModeBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    border: "1px solid #e1e5ea",
    borderRadius: "8px",
    background: "#fbfcfd",
    padding: "14px",
    marginBottom: "16px",
  },
  inputModeActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  modeButton: {
    height: "36px",
    border: "1px solid #cfd6df",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 13px",
    fontSize: "12px",
    fontWeight: 850,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  modeButtonActive: {
    borderColor: "#0f8a56",
    background: "#eef6f1",
    color: "#0b6b43",
  },
  referenceLineBox: {
    border: "1px solid #e1e5ea",
    borderRadius: "8px",
    background: "#ffffff",
    padding: "14px",
    marginBottom: "16px",
  },
  referenceInsideBox: {
    marginTop: "14px",
    borderTop: "1px solid #e1e5ea",
    paddingTop: "14px",
  },
  referenceCompactArea: {
    minWidth: 0,
    borderLeft: "1px solid #e1e5ea",
    paddingLeft: "10px",
  },
  referenceCompactHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    marginBottom: "8px",
  },
  referenceEmpty: {
    border: "1px dashed #cfd6df",
    borderRadius: "8px",
    color: "#667085",
    padding: "9px",
    fontSize: "12px",
    fontWeight: 700,
    textAlign: "center",
  },
  referenceGridCompact: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "8px",
  },
  approvalLineGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "8px",
    marginTop: "8px",
  },
  approverSlot: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 700,
  },
  approverLabel: {
    color: "#475467",
    fontSize: "11px",
    fontWeight: 800,
    lineHeight: 1.2,
  },
  approverControl: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "5px",
  },
  removeLineButton: {
    width: "42px",
    height: "38px",
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
    marginBottom: "8px",
  },
  filterTabsMobile: {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  filterButton: {
    minHeight: "38px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "1px",
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
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
  documentFilterToggle: {
    width: "100%",
    minHeight: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#667085",
    padding: "0 10px",
    marginBottom: "10px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  documentFilterToggleActive: {
    borderColor: "#a7f3d0",
    background: "#ecfdf3",
    color: "#047857",
  },
  documentFilterPanel: {
    marginBottom: "12px",
    border: "1px solid #e6eaf0",
    borderRadius: "8px",
    background: "#f8fafc",
    padding: "10px",
  },
  documentFilterHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    marginBottom: "9px",
    color: "#344054",
    fontSize: "12px",
  },
  filterResetButton: {
    border: 0,
    background: "transparent",
    color: "#0f8a56",
    padding: 0,
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },
  documentFilterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
  },
  documentFilterField: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    color: "#667085",
    fontSize: "11px",
    fontWeight: 800,
  },
  documentFilterFieldWide: {
    gridColumn: "1 / -1",
  },
  documentFilterControl: {
    width: "100%",
    minWidth: 0,
    height: "32px",
    border: "1px solid #d0d5dd",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 7px",
    fontSize: "11px",
    fontWeight: 700,
  },
  attachmentOnlyFilter: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "10px",
    color: "#344054",
    fontSize: "12px",
    fontWeight: 700,
  },
  documentSearchInput: {
    width: "100%",
    height: "36px",
    border: "1px solid #d0d5dd",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 700,
    padding: "0 10px",
    marginBottom: "8px",
    outline: "none",
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
    gap: "8px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    padding: "12px",
    textAlign: "left",
    cursor: "pointer",
  },
  documentButtonActive: {
    borderColor: "#0f8a56",
    background: "#f6fbf8",
    boxShadow: "0 0 0 1px rgba(15, 138, 86, 0.08)",
  },
  documentTagRow: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    flexWrap: "wrap",
  },
  relationBadge: {
    display: "inline-flex",
    borderRadius: "999px",
    background: "#eef2f6",
    color: "#475467",
    padding: "3px 7px",
    fontSize: "10px",
    fontWeight: 800,
  },
  actionBadge: {
    display: "inline-flex",
    borderRadius: "999px",
    background: "#ecfdf3",
    color: "#047857",
    padding: "3px 7px",
    fontSize: "10px",
    fontWeight: 850,
  },
  historyMonthGroup: {
    display: "grid",
    gap: "8px",
  },
  historyMonthHeader: {
    width: "100%",
    minHeight: "38px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #d0d5dd",
    borderRadius: "8px",
    background: "#f8fafc",
    color: "#111827",
    padding: "0 10px",
    textAlign: "left",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 900,
  },
  historyMonthList: {
    display: "grid",
    gap: "8px",
    paddingLeft: "8px",
    borderLeft: "2px solid #e5e7eb",
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
  documentTitleText: {
    flex: 1,
    minWidth: 0,
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  documentMeta: {
    color: "#667085",
    fontSize: "12px",
    fontWeight: 500,
  },
  documentProgress: {
    borderRadius: "9px",
    background: "#f8fafc",
    color: "#344054",
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1.35,
    padding: "8px 9px",
  },
  documentStepRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
  },
  documentStepBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    background: "#f1f5f9",
    color: "#64748b",
    padding: "4px 7px",
    fontSize: "10px",
    fontWeight: 850,
  },
  documentStepBadgeApproved: {
    background: "#ecfdf3",
    color: "#047857",
  },
  documentStepBadgeRejected: {
    background: "#fff1f2",
    color: "#dc2626",
  },
  documentStepBadgeCurrent: {
    background: "#fff7ed",
    color: "#c2410c",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
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
  statusBadgeApproved: {
    background: "#ecfdf3",
    color: "#047857",
  },
  statusBadgeRejected: {
    background: "#fff1f2",
    color: "#dc2626",
  },
  statusBadgeAction: {
    background: "#ecfdf3",
    color: "#047857",
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
  progressNotice: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginTop: "12px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    background: "#f8fafc",
    color: "#344054",
    padding: "10px",
    fontSize: "12px",
    lineHeight: 1.45,
  },
  progressNoticeApproved: {
    borderColor: "#a7f3d0",
    background: "#ecfdf3",
    color: "#047857",
  },
  progressNoticeRejected: {
    borderColor: "#fecdd3",
    background: "#fff1f2",
    color: "#be123c",
  },
  progressNoticeAction: {
    borderColor: "#86efac",
    background: "#f0fdf4",
    color: "#047857",
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
  referenceDetailBox: {
    marginTop: "14px",
    border: "1px solid #edf0f3",
    borderRadius: "8px",
    padding: "10px",
  },
  referenceDetailLabel: {
    display: "block",
    color: "#667085",
    fontSize: "11px",
    fontWeight: 800,
    marginBottom: "8px",
  },
  referenceChipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  referenceChip: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "24px",
    borderRadius: "999px",
    background: "#f3f4f6",
    color: "#344054",
    padding: "0 8px",
    fontSize: "11px",
    fontWeight: 800,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(17, 24, 39, 0.42)",
    padding: "24px",
  },
  modalPanel: {
    width: "min(920px, 100%)",
    maxHeight: "88vh",
    overflowY: "auto",
    borderRadius: "14px",
    border: "1px solid #dfe3e8",
    background: "#ffffff",
    padding: "22px",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.18)",
  },
  modalPanelMobile: {
    maxHeight: "92vh",
    padding: "16px",
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "14px",
    marginBottom: "14px",
  },
  modalHeaderActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
  },
  printButton: {
    height: "36px",
    border: "1px solid #0f8a56",
    borderRadius: "8px",
    background: "#0f8a56",
    color: "#ffffff",
    padding: "0 13px",
    fontSize: "12px",
    fontWeight: 850,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  modalMetaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "8px",
    marginBottom: "12px",
  },
  modalMetaGridMobile: {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  documentFieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
    marginTop: "14px",
  },
  documentFieldGridMobile: {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  documentFieldItem: {
    minHeight: "58px",
    border: "1px solid #edf0f3",
    borderRadius: "8px",
    background: "#fbfcfd",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  documentFieldItemWide: {
    gridColumn: "1 / -1",
  },
  documentTableBox: {
    marginTop: "14px",
  },
  documentTableTitle: {
    margin: "0 0 8px",
    color: "#111820",
    fontSize: "13px",
    fontWeight: 850,
  },
  documentTableWrap: {
    overflowX: "auto",
    border: "1px solid #edf0f3",
    borderRadius: "8px",
  },
  documentTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "12px",
  },
  actionRow: {
    display: "flex",
    gap: "8px",
    marginTop: "14px",
  },
};
