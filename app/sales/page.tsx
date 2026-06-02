"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { canAccessSales, getCurrentOrgTeam } from "@/app/_lib/currentOrg";
import {
  type ExcelSheet,
  exportDateStamp,
  exportExcelWorkbook,
} from "@/app/_lib/excelExport";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { styles } from "@/app/_modules/sales/styles";

type SalesDivision = "domestic" | "overseas";
type SalesCurrency = "KRW" | "USD" | "EUR" | "JPY" | "CNY";
type Stage = "LEAD" | "MEETING" | "QUOTE" | "NEGOTIATION" | "WON" | "LOST";

type Opportunity = {
  id: number;
  division: SalesDivision;
  customerId: number | null;
  parentId: number | null;
  company: string;
  contact: string;
  item: string;
  amount: number;
  currency: SalesCurrency;
  stage: Stage;
  nextAction: string;
  dueDate: string;
  createdAt: string;
  createdBy: string | null;
};

type OpportunityForm = {
  parentId: string;
  company: string;
  contact: string;
  item: string;
  amount: string;
  currency: SalesCurrency;
  stage: Stage;
  nextAction: string;
  dueDate: string;
};

type OpportunityRow = {
  id: number;
  division: SalesDivision;
  customer_id: number | null;
  parent_id?: number | null;
  company: string;
  contact: string | null;
  item: string;
  amount: number | string | null;
  currency: SalesCurrency | null;
  stage: Stage;
  next_action: string | null;
  due_date: string | null;
  created_at: string | null;
  created_by: string | null;
};

type CustomerOption = {
  id: number;
  name: string;
  category?: string | null;
};

type ContactOption = {
  id: number;
  customer_id: number;
  name: string;
  department: string | null;
  position: string | null;
};

type CustomerInsertRow = {
  id: number;
  name: string;
  category?: string | null;
};

type ContactInsertRow = {
  id: number;
  customer_id: number;
  name: string;
  department: string | null;
  position: string | null;
};

type SalesInsertResult = {
  data: unknown;
  error: { message?: string } | null;
};

type SalesInsertClient = {
  insert: (row: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => Promise<SalesInsertResult>;
    };
  };
};

type ScheduleSyncClient = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      limit: (count: number) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
    };
  };
  insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
};

const divisionLabel: Record<SalesDivision, string> = {
  domestic: "국내영업",
  overseas: "해외영업",
};

const stageLabel: Record<Stage, string> = {
  LEAD: "문의",
  MEETING: "미팅",
  QUOTE: "견적",
  NEGOTIATION: "협의",
  WON: "수주",
  LOST: "보류",
};

const stageOptions: Stage[] = [
  "LEAD",
  "MEETING",
  "QUOTE",
  "NEGOTIATION",
  "WON",
  "LOST",
];
const currencyOptions: SalesCurrency[] = ["KRW", "USD", "EUR", "JPY", "CNY"];

const emptyOpportunityForm: OpportunityForm = {
  parentId: "",
  company: "",
  contact: "",
  item: "",
  amount: "",
  currency: "KRW",
  stage: "LEAD",
  nextAction: "",
  dueDate: "",
};

const today = new Date().toISOString().slice(0, 10);
const supabase = createSupabaseBrowser();

const positionKeywords = [
  "회장",
  "대표",
  "대표이사",
  "이사",
  "상무",
  "전무",
  "부장",
  "차장",
  "과장",
  "대리",
  "주임",
  "사원",
  "실장",
  "팀장",
  "소장",
  "공장장",
  "본부장",
  "매니저",
];

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseContactInput(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return { name: "", position: "" };
  }

  const parts = normalized.split(" ");
  const lastPart = parts[parts.length - 1];

  if (parts.length > 1 && positionKeywords.includes(lastPart)) {
    return {
      name: parts.slice(0, -1).join(" "),
      position: lastPart,
    };
  }

  return { name: normalized, position: "" };
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatReportDate(value: string) {
  if (!value) return "-";
  return value.replaceAll("-", ". ");
}

function createSalesSummarySheet(
  opportunities: Opportunity[],
  canViewAmount: boolean
): ExcelSheet {
  const amountColumn = canViewAmount ? ["예상금액"] : [];

  return {
    name: "영업관리 히스토리",
    widths: [95, 100, 160, 120, 220, 100, 120, 100, 220],
    rows: [
      ["영업관리 히스토리"],
      [""],
      [
        "등록일",
        "구분",
        "고객사",
        "담당자",
        "품목/내용",
        ...amountColumn,
        "단계",
        "예정일",
        "다음 액션",
      ],
      ...opportunities.map((item) => [
        item.createdAt,
        divisionLabel[item.division],
        item.company,
        item.contact,
        item.item,
        ...(canViewAmount ? [formatAmount(item.amount, item.currency)] : []),
        stageLabel[item.stage],
        item.dueDate,
        item.nextAction,
      ]),
    ],
  };
}

export default function SalesPage() {
  const router = useRouter();

  const [division, setDivision] = useState<SalesDivision>("domestic");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedCustomerKeys, setExpandedCustomerKeys] = useState<string[]>([]);
  const [opportunityForm, setOpportunityForm] =
    useState<OpportunityForm>(emptyOpportunityForm);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const currentOpportunities = useMemo(
    () => opportunities.filter((item) => item.division === division),
    [division, opportunities]
  );

  const linkableOpportunities = useMemo(
    () =>
      currentOpportunities
        .filter((item) => !item.parentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    [currentOpportunities]
  );

  const filteredLinkableOpportunities = useMemo(() => {
    const companyFilter = normalizeText(opportunityForm.company);

    if (!companyFilter) return linkableOpportunities;

    return linkableOpportunities.filter(
      (item) => normalizeText(item.company) === companyFilter
    );
  }, [linkableOpportunities, opportunityForm.company]);

  const customerGroups = useMemo(() => {
    const groupMap = new Map<
      string,
      { key: string; company: string; contact: string; opportunities: Opportunity[] }
    >();

    currentOpportunities.forEach((item) => {
      const key = normalizeText(item.company);
      const current = groupMap.get(key);

      if (current) {
        current.opportunities.push(item);
        if (!current.contact && item.contact) current.contact = item.contact;
        return;
      }

      groupMap.set(key, {
        key,
        company: item.company,
        contact: item.contact,
        opportunities: [item],
      });
    });

    return Array.from(groupMap.values()).map((group) => {
      const parentIds = new Set(group.opportunities.map((item) => item.id));
      return {
        ...group,
        opportunities: group.opportunities.sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id
        ),
        rootOpportunities: group.opportunities.filter(
          (item) => !item.parentId || !parentIds.has(item.parentId)
        ),
      };
    });
  }, [currentOpportunities]);

  const selectedOpportunity =
    opportunities.find((item) => item.id === selectedId) || null;

  const selectedParentOpportunity =
    selectedOpportunity?.parentId
      ? opportunities.find((item) => item.id === selectedOpportunity.parentId) || null
      : null;

  const selectedCustomerOption = useMemo(
    () =>
      customerOptions.find(
        (customer) => customer.name.trim() === opportunityForm.company.trim()
      ) || null,
    [customerOptions, opportunityForm.company]
  );

  const currentContactOptions = useMemo(() => {
    if (!selectedCustomerOption) return [];
    return contactOptions.filter(
      (contact) => contact.customer_id === selectedCustomerOption.id
    );
  }, [contactOptions, selectedCustomerOption]);

  const activeCount = currentOpportunities.filter(
    (item) => item.stage !== "WON" && item.stage !== "LOST"
  ).length;

  const totalAmount = currentOpportunities.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const currentName =
    typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
  const currentTeam =
    typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
  const currentRole =
    typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
  const currentOrgTeam = getCurrentOrgTeam(currentName, currentTeam);
  const canViewAmount = canAccessSales(currentName, currentTeam);
  const canSyncCustomerDb =
    currentOrgTeam === "국내영업부" || currentOrgTeam === "해외영업부";
  const isAdmin = currentRole === "admin";
  const canManageSelectedOpportunity = Boolean(
    selectedOpportunity && (isAdmin || selectedOpportunity.createdBy === currentUserId)
  );

  const loadSalesData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || "");

    const opportunityResult = await supabase
      .from("sales_opportunities")
      .select("id,division,customer_id,parent_id,company,contact,item,amount,currency,stage,next_action,due_date,created_at,created_by")
      .order("created_at", { ascending: false });

    let opportunityRows = opportunityResult.data as OpportunityRow[] | null;
    let opportunityError = opportunityResult.error;

    if (
      opportunityError?.message?.includes("currency") ||
      opportunityError?.message?.includes("parent_id")
    ) {
      const fallback = await supabase
        .from("sales_opportunities")
        .select("id,division,customer_id,company,contact,item,amount,stage,next_action,due_date,created_at,created_by")
        .order("created_at", { ascending: false });

      opportunityRows = fallback.data as OpportunityRow[] | null;
      opportunityError = fallback.error;
    }

    if (opportunityError) {
      setLoadError("영업관리 저장 테이블을 불러오지 못했습니다.");
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
      .select("id,customer_id,name,department,position")
      .order("name", { ascending: true });

    const mappedOpportunities = ((opportunityRows || []) as OpportunityRow[]).map(
      (item) => ({
        id: item.id,
        division: item.division,
        customerId: item.customer_id || null,
        parentId: item.parent_id || null,
        company: item.company,
        contact: item.contact || "",
        item: item.item,
        amount: Number(item.amount || 0),
        currency: item.currency || "KRW",
        stage: item.stage,
        nextAction: item.next_action || "",
        dueDate: item.due_date || "",
        createdAt: (item.created_at || today).slice(0, 10),
        createdBy: item.created_by,
      })
    );

    setOpportunities(mappedOpportunities);
    setCustomerOptions(((customerRows || []) as CustomerOption[]));
    setContactOptions(((contactRows || []) as ContactOption[]));
    setSelectedId((current) => {
      if (current && mappedOpportunities.some((item) => item.id === current)) {
        return current;
      }
      return mappedOpportunities.find((item) => item.division === division)?.id || null;
    });
    setLoading(false);
  }, [division]);

  useEffect(() => {
    void Promise.resolve().then(() => loadSalesData());
  }, [loadSalesData]);

  function updateOpportunity<K extends keyof OpportunityForm>(
    key: K,
    value: OpportunityForm[K]
  ) {
    setOpportunityForm((current) => ({ ...current, [key]: value }));
  }

  function selectParentOpportunity(parentId: string) {
    if (!parentId) {
      setOpportunityForm((current) => ({ ...current, parentId: "" }));
      return;
    }

    const parent = currentOpportunities.find(
      (item) => item.id === Number(parentId)
    );

    setOpportunityForm((current) => ({
      ...current,
      parentId,
      company: parent?.company || current.company,
      contact: parent?.contact || current.contact,
      currency: parent?.currency || current.currency,
    }));
  }

  function changeDivision(nextDivision: SalesDivision) {
    setDivision(nextDivision);
    setSelectedId(null);
    setExpandedCustomerKeys([]);
    setOpportunityForm({
      ...emptyOpportunityForm,
      currency: nextDivision === "overseas" ? "USD" : "KRW",
    });
  }

  function toggleCustomerGroup(customerKey: string) {
    setExpandedCustomerKeys((current) =>
      current.includes(customerKey)
        ? current.filter((key) => key !== customerKey)
        : [...current, customerKey]
    );
  }

  async function ensureCustomerDbLink(company: string, contact: string) {
    const matchedCustomer =
      customerOptions.find(
        (customer) => normalizeText(customer.name) === normalizeText(company)
      ) || null;

    let customerId = matchedCustomer?.id || null;

    if (!matchedCustomer) {
      if (!canSyncCustomerDb) {
        alert("신규 고객사 DB 등록은 영업본부 소속 인원만 가능합니다.");
        return null;
      }

      const shouldCreate = confirm(
        `"${company}" 업체가 고객사 DB에 없습니다.\n신규 고객사로 등록하고 영업 건을 저장할까요?`
      );

      if (!shouldCreate) return null;

      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: company,
          category: "customer",
          phone: "",
          address: "",
          memo: "영업관리에서 자동 등록된 고객사입니다.",
        })
        .select("id,name,category")
        .single();

      if (error || !data) {
        const { data: existingRows } = await supabase
          .from("customers")
          .select("id,name,category")
          .ilike("name", company)
          .limit(1);

        const existingCustomer = (existingRows?.[0] || null) as CustomerInsertRow | null;

        if (!existingCustomer) {
          alert(error?.message || "고객사 DB 자동 등록에 실패했습니다.");
          return null;
        }

        customerId = existingCustomer.id;
        setCustomerOptions((current) => [
          ...current,
          {
            id: existingCustomer.id,
            name: existingCustomer.name,
            category: existingCustomer.category || "customer",
          },
        ]);
      } else {
        const row = data as CustomerInsertRow;
        customerId = row.id;
        setCustomerOptions((current) => [
          ...current,
          {
            id: row.id,
            name: row.name,
            category: row.category || "customer",
          },
        ]);
      }
    }

    if (!customerId || !contact.trim()) return customerId;

    const parsedContact = parseContactInput(contact);

    if (!parsedContact.name) return customerId;

    const duplicateContact = contactOptions.some(
      (item) =>
        item.customer_id === customerId &&
        normalizeText(item.name) === normalizeText(parsedContact.name)
    );

    if (duplicateContact) return customerId;

    const { data: contactData, error: contactError } = await supabase
      .from("customer_contacts")
      .insert({
        customer_id: customerId,
        name: parsedContact.name,
        department: "",
        position: parsedContact.position,
        phone: "",
        email: "",
        memo: "영업관리에서 자동 등록된 담당자입니다.",
      })
      .select("id,customer_id,name,department,position")
      .single();

    if (contactError || !contactData) {
      alert(contactError?.message || "담당자 DB 자동 등록에 실패했습니다.");
      return customerId;
    }

    const contactRow = contactData as ContactInsertRow;
    setContactOptions((current) => [
      ...current,
      {
        id: contactRow.id,
        customer_id: contactRow.customer_id,
        name: contactRow.name,
        department: contactRow.department,
        position: contactRow.position,
      },
    ]);

    return customerId;
  }

  async function linkSelectedOpportunityToCustomerDb() {
    if (!selectedOpportunity) return;
    if (!canManageSelectedOpportunity) {
      alert("작성자 또는 관리자만 고객사 DB에 연결할 수 있습니다.");
      return;
    }
    if (!canSyncCustomerDb) {
      alert("고객사 DB 연결은 영업본부 소속 인원만 가능합니다.");
      return;
    }

    const customerId = await ensureCustomerDbLink(
      selectedOpportunity.company,
      selectedOpportunity.contact
    );

    if (!customerId) return;

    const { error } = await supabase
      .from("sales_opportunities")
      .update({ customer_id: customerId, updated_at: today })
      .eq("id", selectedOpportunity.id);

    if (error) {
      alert(error.message || "영업 건 고객사 연결에 실패했습니다.");
      return;
    }

    setOpportunities((current) =>
      current.map((item) =>
        item.id === selectedOpportunity.id
          ? { ...item, customerId }
          : item
      )
    );
    alert("고객사 DB에 저장/연결되었습니다.");
  }

  async function syncSalesSchedule(opportunity: Opportunity) {
    if (!opportunity.dueDate || !currentName) {
      return { synced: false, skipped: true, error: "" };
    }

    const tripId = `sales_${opportunity.id}`;
    const scheduleClient = supabase.from("schedules") as unknown as ScheduleSyncClient;
    const existing = await scheduleClient
      .select("id")
      .eq("trip_id", tripId)
      .limit(1);

    if (existing.error) {
      return {
        synced: false,
        skipped: false,
        error: existing.error.message || "일정 중복 확인 실패",
      };
    }

    if (existing.data && existing.data.length > 0) {
      return { synced: false, skipped: true, error: "" };
    }

    const { error } = await scheduleClient.insert({
      date: opportunity.dueDate,
      time: "",
      type: "영업",
      company: opportunity.company,
      title: `[영업] ${opportunity.company} - ${opportunity.nextAction}`,
      writer: currentName,
      team: currentOrgTeam || currentTeam,
      trip_id: tripId,
    });

    return {
      synced: !error,
      skipped: false,
      error: error?.message || "",
    };
  }

  async function syncMissingSalesSchedules() {
    const candidates = currentOpportunities.filter((item) => item.dueDate);

    if (candidates.length === 0) {
      alert("예정일이 등록된 영업 건이 없습니다.");
      return;
    }

    let syncedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const opportunity of candidates) {
      const result = await syncSalesSchedule(opportunity);

      if (result.error) {
        errors.push(`${opportunity.company} / ${opportunity.item}: ${result.error}`);
        continue;
      }

      if (result.synced) {
        syncedCount += 1;
      } else if (result.skipped) {
        skippedCount += 1;
      }
    }

    if (errors.length > 0) {
      alert(
        `누락 일정 ${syncedCount}건을 반영했습니다.\n이미 반영된 ${skippedCount}건은 건너뛰었습니다.\n\n오류 ${errors.length}건:\n${errors.slice(0, 3).join("\n")}`
      );
      return;
    }

    alert(
      `누락 일정 ${syncedCount}건을 개인 일정에 반영했습니다.\n이미 반영된 ${skippedCount}건은 건너뛰었습니다.`
    );
  }

  async function addOpportunity() {
    const parentOpportunity =
      opportunityForm.parentId
        ? currentOpportunities.find(
            (item) => item.id === Number(opportunityForm.parentId)
          ) || null
        : null;
    const company = (parentOpportunity?.company || opportunityForm.company).trim();
    const contact = (parentOpportunity?.contact || opportunityForm.contact).trim();
    const item = opportunityForm.item.trim();
    const amount = Number(opportunityForm.amount.replaceAll(",", ""));
    const nextAction = opportunityForm.nextAction.trim();

    if (!company || !item || !nextAction) {
      alert("고객사, 품목/내용, 다음 액션은 필수입니다.");
      return;
    }

    if (canViewAmount && opportunityForm.amount && Number.isNaN(amount)) {
      alert("예상 금액은 숫자로 입력해주세요.");
      return;
    }

    const customerId = await ensureCustomerDbLink(company, contact);

    if (!customerId) return;

    const insertRow: Record<string, unknown> = {
      division,
      customer_id: customerId,
      company,
      contact,
      item,
      amount: canViewAmount ? amount || 0 : 0,
      currency: canViewAmount ? opportunityForm.currency : "KRW",
      stage: opportunityForm.stage,
      next_action: nextAction,
      due_date: opportunityForm.dueDate || null,
    };

    if (parentOpportunity) {
      insertRow.parent_id = parentOpportunity.id;
    }

    const selectFields = parentOpportunity
      ? "id,division,customer_id,parent_id,company,contact,item,amount,currency,stage,next_action,due_date,created_at,created_by"
      : "id,division,customer_id,company,contact,item,amount,currency,stage,next_action,due_date,created_at,created_by";

    const salesInsertClient = supabase.from(
      "sales_opportunities"
    ) as unknown as SalesInsertClient;
    const { data, error } = await salesInsertClient
      .insert(insertRow)
      .select(selectFields)
      .single();

    if (error || !data) {
      if (
        parentOpportunity &&
        error?.message?.includes("parent_id")
      ) {
        alert(
          "기존 영업 건 연결용 DB 컬럼이 아직 반영되지 않았습니다.\nSupabase SQL 실행 후 잠시 뒤 다시 등록해주세요."
        );
        return;
      }

      alert(error?.message || "영업기회 등록에 실패했습니다.");
      return;
    }

    const row = data as OpportunityRow;
    const nextOpportunity: Opportunity = {
      id: row.id,
      division: row.division,
      customerId,
      parentId: row.parent_id || parentOpportunity?.id || null,
      company: row.company,
      contact: row.contact || "",
      item: row.item,
      amount: Number(row.amount || 0),
      currency: row.currency || "KRW",
      stage: row.stage,
      nextAction: row.next_action || "",
      dueDate: row.due_date || "",
      createdAt: (row.created_at || today).slice(0, 10),
      createdBy: row.created_by,
    };

    setOpportunities((current) => [nextOpportunity, ...current]);
    setSelectedId(nextOpportunity.id);
    setOpportunityForm(emptyOpportunityForm);
    const scheduleSync = await syncSalesSchedule(nextOpportunity);

    if (scheduleSync.error) {
      alert(
        `영업 건은 등록됐지만 일정관리 자동 반영에 실패했습니다.\n${scheduleSync.error}`
      );
      return;
    }

    alert(
      scheduleSync.synced
        ? "영업 건이 등록되고 개인 일정에 반영되었습니다."
        : customerId
          ? "영업 건이 등록되고 고객사 DB에 연결되었습니다."
          : "영업 건이 등록되었습니다."
    );
  }

  async function removeOpportunity() {
    if (!selectedOpportunity) return;
    if (!canManageSelectedOpportunity) {
      alert("작성자 또는 관리자만 삭제할 수 있습니다.");
      return;
    }
    if (!confirm("선택한 영업기회를 삭제할까요?")) return;

    const { error } = await supabase
      .from("sales_opportunities")
      .delete()
      .eq("id", selectedOpportunity.id);

    if (error) {
      alert(error.message);
      return;
    }

    setOpportunities((current) =>
      current.filter((item) => item.id !== selectedOpportunity.id)
    );
    setSelectedId(null);
  }

  function exportCurrentSales() {
    if (currentOpportunities.length === 0) {
      alert("다운로드할 영업 내역이 없습니다.");
      return;
    }

    exportExcelWorkbook(`${divisionLabel[division]}_${exportDateStamp()}.xls`, [
      createSalesSummarySheet(currentOpportunities, canViewAmount),
    ]);
  }

  function printSelectedSalesReport() {
    if (!selectedOpportunity) {
      alert("보고서를 만들 영업 건을 선택해주세요.");
      return;
    }

    const reportWindow = window.open("", "zeta-sales-report", "width=900,height=900");

    if (!reportWindow) {
      alert("팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.");
      return;
    }

    const reportTitle = selectedOpportunity.item;
    const reportDate = selectedOpportunity.dueDate;
    const reportType = stageLabel[selectedOpportunity.stage];
    const currentStageIndex = stageOptions.indexOf(selectedOpportunity.stage);
    const stageProgressItems = stageOptions
      .filter((stage) => stage !== "LOST")
      .map((stage) => {
        const stageIndex = stageOptions.indexOf(stage);
        const className =
          selectedOpportunity.stage === "LOST"
            ? "step muted"
            : stageIndex < currentStageIndex
              ? "step done"
              : stageIndex === currentStageIndex
                ? "step current"
                : "step";

        return `
          <div class="${className}">
            <span>${escapeHtml(stageLabel[stage])}</span>
          </div>
        `;
      })
      .join("");
    const amountText = canViewAmount
      ? formatAmount(selectedOpportunity.amount, selectedOpportunity.currency)
      : "권한 제한";

    reportWindow.document.open();
    reportWindow.document.write(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>영업 보고 - ${escapeHtml(selectedOpportunity.company)}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              background: #eef2f7;
              color: #111827;
              font-family: "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif;
              line-height: 1.55;
            }
            .page {
              width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              background: #fff;
              padding: 17mm;
            }
            .top {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 18px;
              border-bottom: 3px solid #111827;
              padding-bottom: 16px;
              margin-bottom: 16px;
            }
            .kicker {
              color: #0f8a56;
              font-size: 12px;
              font-weight: 900;
              letter-spacing: .04em;
            }
            h1 {
              margin: 4px 0 0;
              font-size: 25px;
              line-height: 1.25;
            }
            .meta {
              color: #475569;
              font-size: 12px;
              font-weight: 700;
              text-align: right;
              white-space: nowrap;
            }
            .status-ribbon {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              margin-top: 8px;
              border-radius: 999px;
              background: #111827;
              color: #fff;
              padding: 6px 10px;
              font-size: 12px;
              font-weight: 900;
            }
            .status-ribbon span {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: #22c55e;
            }
            .summary {
              display: flex;
              flex-direction: column;
              gap: 6px;
              margin-bottom: 14px;
              width: 100%;
            }
            .box {
              display: grid;
              grid-template-columns: 88px 1fr;
              align-items: center;
              border: 1px solid #d9e0ea;
              border-radius: 8px;
              background: #f8fafc;
              padding: 6px 9px;
              min-height: 34px;
            }
            .box.strong {
              border-color: #c7d2fe;
              background: #f5f7ff;
            }
            .label {
              display: block;
              color: #64748b;
              font-size: 10.5px;
              font-weight: 800;
              margin-bottom: 0;
            }
            .value {
              color: #111827;
              font-size: 13px;
              font-weight: 900;
              word-break: keep-all;
            }
            .notice {
              border: 2px solid #111827;
              border-radius: 16px;
              background: linear-gradient(135deg, #f8fafc 0%, #ecfdf5 100%);
              padding: 16px;
              margin-bottom: 14px;
            }
            .notice strong {
              display: block;
              color: #0f8a56;
              font-size: 13px;
              margin-bottom: 8px;
            }
            .notice .main {
              font-size: 17px;
              font-weight: 900;
              margin-bottom: 8px;
              word-break: keep-all;
            }
            .notice .sub {
              color: #334155;
              font-size: 13px;
              font-weight: 700;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 6px 14px;
            }
            .progress {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 8px;
              margin: 12px 0 14px;
            }
            .step {
              position: relative;
              border: 1px solid #d9e0ea;
              border-radius: 999px;
              background: #f8fafc;
              color: #64748b;
              padding: 7px 8px;
              text-align: center;
              font-size: 12px;
              font-weight: 900;
            }
            .step.done {
              border-color: #86efac;
              background: #ecfdf5;
              color: #047857;
            }
            .step.current {
              border-color: #111827;
              background: #111827;
              color: #fff;
              box-shadow: 0 6px 14px rgba(15, 23, 42, .16);
            }
            .step.muted {
              opacity: .55;
            }
            .section {
              margin-top: 16px;
            }
            h2 {
              margin: 0 0 8px;
              color: #111827;
              font-size: 15px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #cbd5e1;
            }
            th, td {
              border: 1px solid #dce3ec;
              padding: 8px 9px;
              vertical-align: top;
              font-size: 12px;
            }
            th {
              background: #eef2f7;
              color: #334155;
              font-weight: 900;
              text-align: left;
            }
            td p {
              margin: 4px 0 0;
              color: #475569;
              font-size: 11.5px;
              white-space: pre-wrap;
            }
            .empty-panel {
              border: 1px dashed #cbd5e1;
              border-radius: 10px;
              color: #64748b;
              background: #f8fafc;
              text-align: center;
              padding: 22px 18px;
              font-size: 12px;
              font-weight: 700;
            }
            .footer {
              margin-top: 18px;
              border-top: 1px solid #d9e0ea;
              padding-top: 10px;
              color: #64748b;
              font-size: 11px;
              display: flex;
              justify-content: flex-start;
            }
            .actions {
              position: sticky;
              bottom: 0;
              display: flex;
              justify-content: flex-end;
              gap: 8px;
              width: 210mm;
              margin: 0 auto;
              padding: 10px 0;
              background: #f3f4f6;
            }
            button {
              height: 36px;
              border-radius: 8px;
              border: 1px solid #cbd5e1;
              background: #fff;
              color: #111827;
              padding: 0 14px;
              font-weight: 800;
              cursor: pointer;
            }
            .primary {
              border-color: #111827;
              background: #111827;
              color: #fff;
            }
            @media print {
              body { background: #fff; }
              .page { width: auto; min-height: auto; margin: 0; padding: 0; }
              .actions { display: none; }
              @page { size: A4; margin: 15mm; }
            }
          </style>
        </head>
        <body>
          <main class="page">
            <header class="top">
              <div>
                <div class="kicker">ZETA SALES REPORT</div>
                <h1>${escapeHtml(selectedOpportunity.company)} 영업 보고</h1>
                <div class="status-ribbon"><span></span>${escapeHtml(stageLabel[selectedOpportunity.stage])} 단계 진행중</div>
              </div>
              <div class="meta">
                보고일 ${escapeHtml(formatReportDate(today))}<br />
                작성 ${escapeHtml(currentName || "-")} / ${escapeHtml(currentOrgTeam || currentTeam || "-")}
              </div>
            </header>

            <section class="notice">
              <strong>보고 요약</strong>
              <div class="main">${escapeHtml(reportTitle)}</div>
              <div class="sub">
                <span>보고 구분: ${escapeHtml(reportType)}</span>
                <span>다음 액션: ${escapeHtml(selectedOpportunity.nextAction || "-")}</span>
                <span>담당자: ${escapeHtml(selectedOpportunity.contact || "-")}</span>
                <span>보고/예정일: ${escapeHtml(formatReportDate(reportDate))}</span>
              </div>
            </section>

            <section class="progress" aria-label="영업 단계">
              ${stageProgressItems}
            </section>

            <section class="summary">
              <div class="box strong">
                <span class="label">고객사</span>
                <span class="value">${escapeHtml(selectedOpportunity.company)}</span>
              </div>
              <div class="box strong">
                <span class="label">구분</span>
                <span class="value">${escapeHtml(divisionLabel[selectedOpportunity.division])}</span>
              </div>
              <div class="box strong">
                <span class="label">예상 금액</span>
                <span class="value">${escapeHtml(amountText)}</span>
              </div>
              <div class="box">
                <span class="label">보고 건</span>
                <span class="value">${escapeHtml(reportTitle)}</span>
              </div>
            </section>

            <footer class="footer">
              <span>ZETA 업무통합시스템 영업관리</span>
            </footer>
          </main>
          <div class="actions">
            <button type="button" onclick="window.close()">닫기</button>
            <button type="button" class="primary" onclick="window.print()">PDF 저장 / 인쇄</button>
          </div>
        </body>
      </html>
    `);
    reportWindow.document.close();
    reportWindow.focus();
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <BrandLogo
            subtitle="영업관리"
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
        {loading && <div style={styles.empty}>영업기회를 불러오는 중입니다.</div>}

        <section style={styles.segment}>
          <button
            style={division === "domestic" ? styles.activeSegmentButton : styles.segmentButton}
            onClick={() => changeDivision("domestic")}
          >
            국내영업
          </button>
          <button
            style={division === "overseas" ? styles.activeSegmentButton : styles.segmentButton}
            onClick={() => changeDivision("overseas")}
          >
            해외영업
          </button>
        </section>

        <section style={styles.summaryGrid}>
          <SummaryCard label="구분" value={divisionLabel[division]} />
          <SummaryCard label="진행 건" value={`${activeCount}건`} />
          {canViewAmount && (
            <SummaryCard
              label="예상 금액"
              value={formatAmount(totalAmount, division === "overseas" ? "USD" : "KRW")}
            />
          )}
        </section>

        <section style={styles.layout}>
          <div style={styles.panel}>
            <h2 style={styles.panelTitle}>영업 건 등록</h2>
            <p style={styles.panelHint}>
              신규 업체명은 확인 후 고객사 DB에 자동 등록되고, 담당자도 함께 연결됩니다.
            </p>

            <Field label="기존 영업 건 연결">
              <select
                value={opportunityForm.parentId}
                onChange={(event) => selectParentOpportunity(event.target.value)}
                style={styles.input}
              >
                <option value="">새 영업 건으로 등록</option>
                {filteredLinkableOpportunities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.company} / {item.item}
                  </option>
                ))}
              </select>
            </Field>

            <div style={styles.formGrid}>
              <Field label="고객사">
                <input
                  value={opportunityForm.company}
                  onChange={(event) =>
                    updateOpportunity("company", event.target.value)
                  }
                  placeholder="고객사명"
                  list="sales-customer-options"
                  style={styles.input}
                />
              </Field>

              <Field label="담당자">
                <input
                  value={opportunityForm.contact}
                  onChange={(event) =>
                    updateOpportunity("contact", event.target.value)
                  }
                  placeholder="담당자/부서"
                  list="sales-contact-options"
                  style={styles.input}
                />
              </Field>
            </div>

            <datalist id="sales-customer-options">
              {customerOptions.map((customer) => (
                <option key={customer.id} value={customer.name} />
              ))}
            </datalist>

            <datalist id="sales-contact-options">
              {currentContactOptions.map((contact) => (
                <option
                  key={contact.id}
                  value={contact.name}
                  label={[contact.department, contact.position]
                    .filter(Boolean)
                    .join(" / ")}
                />
              ))}
            </datalist>

            <Field label="품목/내용">
              <input
                value={opportunityForm.item}
                onChange={(event) => updateOpportunity("item", event.target.value)}
                placeholder="예: 신규 장비 문의, 증설 검토, 정기 계약"
                style={styles.input}
              />
            </Field>

            <div style={styles.formGrid}>
              {canViewAmount && (
                <Field label="예상 금액">
                  <div style={{ display: "flex", gap: "8px" }}>
                    {division === "overseas" && (
                      <select
                        value={opportunityForm.currency}
                        onChange={(event) =>
                          updateOpportunity("currency", event.target.value as SalesCurrency)
                        }
                        style={{ ...styles.input, width: "96px", flex: "0 0 auto" }}
                      >
                        {currencyOptions.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      value={opportunityForm.amount}
                      onChange={(event) =>
                        updateOpportunity("amount", event.target.value)
                      }
                      placeholder="숫자만 입력"
                      inputMode="numeric"
                      style={styles.input}
                    />
                  </div>
                </Field>
              )}
              <Field label="단계">
                <select
                  value={opportunityForm.stage}
                  onChange={(event) =>
                    updateOpportunity("stage", event.target.value as Stage)
                  }
                  style={styles.input}
                >
                  {stageOptions.map((stage) => (
                    <option key={stage} value={stage}>
                      {stageLabel[stage]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={styles.formGrid}>
              <Field label="다음 액션">
                <input
                  value={opportunityForm.nextAction}
                  onChange={(event) =>
                    updateOpportunity("nextAction", event.target.value)
                  }
                  placeholder="예: 방문 일정 확정, 견적서 발송"
                  style={styles.input}
                />
              </Field>

              <Field label="예정일">
                <input
                  type="date"
                  value={opportunityForm.dueDate}
                  onChange={(event) =>
                    updateOpportunity("dueDate", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>
            </div>

            <button style={styles.primaryButton} onClick={addOpportunity}>
              영업 건 등록
            </button>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTopRow}>
              <h2 style={styles.panelTitle}>{divisionLabel[division]} 목록</h2>
              <div style={styles.panelActions}>
                <button style={styles.exportButton} onClick={syncMissingSalesSchedules}>
                  누락 일정 반영
                </button>
                <button style={styles.exportButton} onClick={exportCurrentSales}>
                  엑셀
                </button>
              </div>
            </div>
            <p style={styles.panelHint}>고객사를 펼치면 해당 업체의 영업 건이 가지 형태로 표시됩니다.</p>

            <div style={styles.list}>
              {customerGroups.length === 0 ? (
                <div style={styles.empty}>아직 등록된 영업기회가 없습니다.</div>
              ) : (
                customerGroups.map((group) => {
                  const selectedInGroup = group.opportunities.some(
                    (item) => item.id === selectedOpportunity?.id
                  );
                  const isExpanded =
                    expandedCustomerKeys.includes(group.key) || selectedInGroup;
                  const representativeStage =
                    group.rootOpportunities[0]?.stage || group.opportunities[0]?.stage;

                  return (
                    <div key={group.key} style={styles.customerGroup}>
                      <button
                        style={
                          selectedInGroup
                            ? styles.selectedCustomerHeader
                            : styles.customerHeader
                        }
                        onClick={() => toggleCustomerGroup(group.key)}
                      >
                        <div>
                          <div style={styles.customerHeaderName}>{group.company}</div>
                          <div style={styles.customerHeaderMeta}>
                            담당 {group.contact || "미입력"} · 영업 건 {group.opportunities.length}건
                          </div>
                        </div>
                        <div style={styles.customerHeaderRight}>
                          <span style={styles.customerHeaderStage}>
                            {representativeStage
                              ? stageLabel[representativeStage]
                              : "-"}
                          </span>
                          <span>{isExpanded ? "접기" : "펼치기"}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div style={styles.opportunityBranchList}>
                          {group.rootOpportunities.map((item) => {
                            const childOpportunities = group.opportunities.filter(
                              (child) => child.parentId === item.id
                            );

                            return (
                              <div key={item.id} style={styles.branchGroup}>
                                <button
                                  style={
                                    selectedOpportunity?.id === item.id
                                      ? styles.selectedOpportunityBranch
                                      : styles.opportunityBranch
                                  }
                                  onClick={() => setSelectedId(item.id)}
                                >
                                  <span style={styles.branchLine} />
                                  <div style={styles.branchContent}>
                                    <div style={styles.branchTitle}>{item.item}</div>
                                    <div style={styles.branchMeta}>
                                      {stageLabel[item.stage]} · 다음 액션 {item.nextAction || "-"}
                                    </div>
                                  </div>
                                  <span style={styles.branchAmount}>
                                    {canViewAmount
                                      ? formatAmount(item.amount, item.currency)
                                      : "권한 제한"}
                                  </span>
                                </button>

                                {childOpportunities.length > 0 && (
                                  <div style={styles.childBranchList}>
                                    {childOpportunities.map((child) => (
                                      <button
                                        key={child.id}
                                        style={
                                          selectedOpportunity?.id === child.id
                                            ? styles.selectedChildBranch
                                            : styles.childBranch
                                        }
                                        onClick={() => setSelectedId(child.id)}
                                      >
                                        <span style={styles.childBranchMark}>└</span>
                                        <div style={styles.branchContent}>
                                          <div style={styles.branchTitle}>{child.item}</div>
                                          <div style={styles.branchMeta}>
                                            {stageLabel[child.stage]} · 다음 액션 {child.nextAction || "-"}
                                          </div>
                                        </div>
                                        <span style={styles.branchAmount}>
                                          {canViewAmount
                                            ? formatAmount(child.amount, child.currency)
                                            : "권한 제한"}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section style={styles.detailPanel}>
          {!selectedOpportunity ? (
            <div style={styles.empty}>목록에서 영업기회를 선택하면 상세 관리가 열립니다.</div>
          ) : (
            <>
              <div style={styles.detailHeader}>
                <div>
                  <div style={styles.detailMeta}>
                    {divisionLabel[selectedOpportunity.division]} / {selectedOpportunity.company}
                  </div>
                  <h2 style={styles.detailTitle}>{selectedOpportunity.item}</h2>
                  {selectedParentOpportunity && (
                    <div style={styles.linkedParentInfo}>
                      연결 원건: {selectedParentOpportunity.item}
                    </div>
                  )}
                </div>

                {canManageSelectedOpportunity && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      style={styles.exportButton}
                      onClick={printSelectedSalesReport}
                    >
                      보고 PDF
                    </button>
                    {canSyncCustomerDb && (
                      <button
                        style={styles.exportButton}
                        onClick={linkSelectedOpportunityToCustomerDb}
                      >
                        {selectedOpportunity.customerId
                          ? "고객사 DB 확인"
                          : "고객사 DB 연결"}
                      </button>
                    )}
                    <button style={styles.deleteButton} onClick={removeOpportunity}>
                      삭제
                    </button>
                  </div>
                )}
              </div>

              <div style={styles.detailGrid}>
                <div style={styles.detailBox}>
                  <span style={styles.detailLabel}>담당자</span>
                  <strong>{selectedOpportunity.contact || "-"}</strong>
                </div>
                {canViewAmount && (
                  <div style={styles.detailBox}>
                    <span style={styles.detailLabel}>예상 금액</span>
                    <strong>{formatAmount(selectedOpportunity.amount, selectedOpportunity.currency)}</strong>
                  </div>
                )}
                <div style={styles.detailBox}>
                  <span style={styles.detailLabel}>다음 액션</span>
                  <strong>{selectedOpportunity.nextAction}</strong>
                </div>
                <div style={styles.detailBox}>
                  <span style={styles.detailLabel}>예정일</span>
                  <strong>{selectedOpportunity.dueDate || "-"}</strong>
                </div>
              </div>

            </>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
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

function formatWon(value: number) {
  if (!value) return "0원";
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1).replace(".0", "")}억`;
  }
  return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
}

function formatAmount(value: number, currency: SalesCurrency) {
  if (currency === "KRW") return formatWon(value);
  return `${currency} ${Number(value || 0).toLocaleString("ko-KR")}`;
}

