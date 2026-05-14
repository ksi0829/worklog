"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { styles } from "@/app/_modules/sales/styles";

type SalesDivision = "domestic" | "overseas";
type Stage = "LEAD" | "MEETING" | "QUOTE" | "NEGOTIATION" | "WON" | "LOST";
type ActivityType = "방문" | "전화" | "메일" | "견적" | "제안" | "후속";

type Opportunity = {
  id: number;
  division: SalesDivision;
  company: string;
  contact: string;
  item: string;
  amount: number;
  stage: Stage;
  nextAction: string;
  dueDate: string;
  createdAt: string;
};

type Activity = {
  id: number;
  opportunityId: number;
  type: ActivityType;
  title: string;
  memo: string;
  date: string;
};

type OpportunityForm = {
  company: string;
  contact: string;
  item: string;
  amount: string;
  stage: Stage;
  nextAction: string;
  dueDate: string;
};

type ActivityForm = {
  type: ActivityType;
  title: string;
  memo: string;
  date: string;
};

type OpportunityRow = {
  id: number;
  division: SalesDivision;
  company: string;
  contact: string | null;
  item: string;
  amount: number | string | null;
  stage: Stage;
  next_action: string | null;
  due_date: string | null;
  created_at: string | null;
};

type ActivityRow = {
  id: number;
  opportunity_id: number;
  type: ActivityType;
  title: string;
  memo: string | null;
  date: string | null;
};

type CustomerOption = {
  id: number;
  name: string;
};

type ContactOption = {
  id: number;
  customer_id: number;
  name: string;
  department: string | null;
  position: string | null;
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

const emptyOpportunityForm: OpportunityForm = {
  company: "",
  contact: "",
  item: "",
  amount: "",
  stage: "LEAD",
  nextAction: "",
  dueDate: "",
};

const today = new Date().toISOString().slice(0, 10);
const supabase = createSupabaseBrowser();

const emptyActivityForm: ActivityForm = {
  type: "후속",
  title: "",
  memo: "",
  date: today,
};

export default function SalesPage() {
  const router = useRouter();

  const [division, setDivision] = useState<SalesDivision>("domestic");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [opportunityForm, setOpportunityForm] =
    useState<OpportunityForm>(emptyOpportunityForm);
  const [activityForm, setActivityForm] =
    useState<ActivityForm>(emptyActivityForm);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const currentOpportunities = useMemo(
    () => opportunities.filter((item) => item.division === division),
    [division, opportunities]
  );

  const selectedOpportunity =
    opportunities.find((item) => item.id === selectedId) || null;

  const selectedActivities = useMemo(() => {
    if (!selectedOpportunity) return [];
    return activities.filter((item) => item.opportunityId === selectedOpportunity.id);
  }, [activities, selectedOpportunity]);

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

  const loadSalesData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const { data: opportunityRows, error: opportunityError } = await supabase
      .from("sales_opportunities")
      .select("id,division,company,contact,item,amount,stage,next_action,due_date,created_at")
      .order("created_at", { ascending: false });

    if (opportunityError) {
      setLoadError("영업관리 저장 테이블을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: activityRows, error: activityError } = await supabase
      .from("sales_activities")
      .select("id,opportunity_id,type,title,memo,date")
      .order("date", { ascending: false });

    if (activityError) {
      setLoadError("영업 활동 이력을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: customerRows } = await supabase
      .from("customers")
      .select("id,name")
      .order("name", { ascending: true });

    const { data: contactRows } = await supabase
      .from("customer_contacts")
      .select("id,customer_id,name,department,position")
      .order("name", { ascending: true });

    const mappedOpportunities = ((opportunityRows || []) as OpportunityRow[]).map(
      (item) => ({
        id: item.id,
        division: item.division,
        company: item.company,
        contact: item.contact || "",
        item: item.item,
        amount: Number(item.amount || 0),
        stage: item.stage,
        nextAction: item.next_action || "",
        dueDate: item.due_date || "",
        createdAt: (item.created_at || today).slice(0, 10),
      })
    );

    setOpportunities(mappedOpportunities);
    setActivities(
      ((activityRows || []) as ActivityRow[]).map((item) => ({
        id: item.id,
        opportunityId: item.opportunity_id,
        type: item.type,
        title: item.title,
        memo: item.memo || "",
        date: item.date || today,
      }))
    );
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

  function updateActivity<K extends keyof ActivityForm>(
    key: K,
    value: ActivityForm[K]
  ) {
    setActivityForm((current) => ({ ...current, [key]: value }));
  }

  function changeDivision(nextDivision: SalesDivision) {
    setDivision(nextDivision);
    setSelectedId(null);
    setOpportunityForm(emptyOpportunityForm);
    setActivityForm(emptyActivityForm);
  }

  async function addOpportunity() {
    const company = opportunityForm.company.trim();
    const contact = opportunityForm.contact.trim();
    const item = opportunityForm.item.trim();
    const amount = Number(opportunityForm.amount.replaceAll(",", ""));
    const nextAction = opportunityForm.nextAction.trim();

    if (!company || !item || !nextAction) {
      alert("고객사, 품목/내용, 다음 액션은 필수입니다.");
      return;
    }

    if (opportunityForm.amount && Number.isNaN(amount)) {
      alert("예상 금액은 숫자로 입력해주세요.");
      return;
    }

    const matchedCustomer =
      customerOptions.find((customer) => customer.name.trim() === company) || null;
    const { data, error } = await supabase
      .from("sales_opportunities")
      .insert({
        division,
        customer_id: matchedCustomer?.id || null,
        company,
        contact,
        item,
        amount: amount || 0,
        stage: opportunityForm.stage,
        next_action: nextAction,
        due_date: opportunityForm.dueDate || null,
      })
      .select("id,division,company,contact,item,amount,stage,next_action,due_date,created_at")
      .single();

    if (error || !data) {
      alert(error?.message || "영업기회 등록에 실패했습니다.");
      return;
    }

    const row = data as OpportunityRow;
    const nextOpportunity: Opportunity = {
      id: row.id,
      division: row.division,
      company: row.company,
      contact: row.contact || "",
      item: row.item,
      amount: Number(row.amount || 0),
      stage: row.stage,
      nextAction: row.next_action || "",
      dueDate: row.due_date || "",
      createdAt: (row.created_at || today).slice(0, 10),
    };

    setOpportunities((current) => [nextOpportunity, ...current]);
    setSelectedId(nextOpportunity.id);
    setOpportunityForm(emptyOpportunityForm);
  }

  async function addActivity() {
    if (!selectedOpportunity) {
      alert("먼저 영업기회를 선택해주세요.");
      return;
    }

    const title = activityForm.title.trim();

    if (!title) {
      alert("활동 제목은 필수입니다.");
      return;
    }

    const { data, error } = await supabase
      .from("sales_activities")
      .insert({
        opportunity_id: selectedOpportunity.id,
        type: activityForm.type,
        title,
        memo: activityForm.memo.trim(),
        date: activityForm.date || today,
      })
      .select("id,opportunity_id,type,title,memo,date")
      .single();

    if (error || !data) {
      alert(error?.message || "활동 기록 추가에 실패했습니다.");
      return;
    }

    const row = data as ActivityRow;
    const nextActivity: Activity = {
      id: row.id,
      opportunityId: row.opportunity_id,
      type: row.type,
      title: row.title,
      memo: row.memo || "",
      date: row.date || today,
    };

    setActivities((current) => [nextActivity, ...current]);
    setActivityForm(emptyActivityForm);
  }

  async function changeStage(nextStage: Stage) {
    if (!selectedOpportunity) return;

    const { error } = await supabase
      .from("sales_opportunities")
      .update({ stage: nextStage, updated_at: today })
      .eq("id", selectedOpportunity.id);

    if (error) {
      alert(error.message);
      return;
    }

    setOpportunities((current) =>
      current.map((item) =>
        item.id === selectedOpportunity.id ? { ...item, stage: nextStage } : item
      )
    );
  }

  async function removeOpportunity() {
    if (!selectedOpportunity) return;
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
    setActivities((current) =>
      current.filter((item) => item.opportunityId !== selectedOpportunity.id)
    );
    setSelectedId(null);
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
          <SummaryCard label="예상 금액" value={formatWon(totalAmount)} />
        </section>

        <section style={styles.layout}>
          <div style={styles.panel}>
            <h2 style={styles.panelTitle}>영업기회 등록</h2>
            <p style={styles.panelHint}>
              {divisionLabel[division]} 전용 목록에 새 영업 건을 등록합니다.
            </p>

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
              <Field label="예상 금액">
                <input
                  value={opportunityForm.amount}
                  onChange={(event) =>
                    updateOpportunity("amount", event.target.value)
                  }
                  placeholder="숫자만 입력"
                  inputMode="numeric"
                  style={styles.input}
                />
              </Field>

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
              영업기회 등록
            </button>
          </div>

          <div style={styles.panel}>
            <h2 style={styles.panelTitle}>{divisionLabel[division]} 목록</h2>
            <p style={styles.panelHint}>업체명과 담당자만 빠르게 확인하고, 클릭하면 상세가 열립니다.</p>

            <div style={styles.list}>
              {currentOpportunities.length === 0 ? (
                <div style={styles.empty}>아직 등록된 영업기회가 없습니다.</div>
              ) : (
                currentOpportunities.map((item) => (
                  <button
                    key={item.id}
                    style={
                      selectedOpportunity?.id === item.id
                        ? styles.selectedCard
                        : styles.card
                    }
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div style={styles.simpleCardRow}>
                      <span style={styles.company}>{item.company}</span>
                      <span style={styles.contact}>{item.contact || "담당자 미입력"}</span>
                    </div>
                  </button>
                ))
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
                </div>

                <button style={styles.deleteButton} onClick={removeOpportunity}>
                  삭제
                </button>
              </div>

              <div style={styles.detailGrid}>
                <div style={styles.detailBox}>
                  <span style={styles.detailLabel}>담당자</span>
                  <strong>{selectedOpportunity.contact || "-"}</strong>
                </div>
                <div style={styles.detailBox}>
                  <span style={styles.detailLabel}>예상 금액</span>
                  <strong>{formatWon(selectedOpportunity.amount)}</strong>
                </div>
                <div style={styles.detailBox}>
                  <span style={styles.detailLabel}>다음 액션</span>
                  <strong>{selectedOpportunity.nextAction}</strong>
                </div>
                <div style={styles.detailBox}>
                  <span style={styles.detailLabel}>예정일</span>
                  <strong>{selectedOpportunity.dueDate || "-"}</strong>
                </div>
              </div>

              <div style={styles.stageBox}>
                <span style={styles.label}>단계 변경</span>
                <div style={styles.stageButtons}>
                  {stageOptions.map((stage) => (
                    <button
                      key={stage}
                      style={
                        selectedOpportunity.stage === stage
                          ? styles.activeStageButton
                          : styles.stageButton
                      }
                      onClick={() => changeStage(stage)}
                    >
                      {stageLabel[stage]}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.activityForm}>
                <h3 style={styles.sectionTitle}>영업 활동 기록</h3>
                <div style={styles.formGrid}>
                  <Field label="구분">
                    <select
                      value={activityForm.type}
                      onChange={(event) =>
                        updateActivity("type", event.target.value as ActivityType)
                      }
                      style={styles.input}
                    >
                      {(["방문", "전화", "메일", "견적", "제안", "후속"] as ActivityType[]).map(
                        (type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        )
                      )}
                    </select>
                  </Field>

                  <Field label="일자">
                    <input
                      type="date"
                      value={activityForm.date}
                      onChange={(event) => updateActivity("date", event.target.value)}
                      style={styles.input}
                    />
                  </Field>
                </div>

                <Field label="활동 제목">
                  <input
                    value={activityForm.title}
                    onChange={(event) => updateActivity("title", event.target.value)}
                    placeholder="예: 견적서 발송, 방문 미팅, 회신 요청"
                    style={styles.input}
                  />
                </Field>

                <Field label="메모">
                  <textarea
                    value={activityForm.memo}
                    onChange={(event) => updateActivity("memo", event.target.value)}
                    placeholder="미팅 내용, 고객 요청사항, 다음 확인 사항"
                    style={{ ...styles.input, ...styles.textarea }}
                  />
                </Field>

                <button style={styles.primaryButton} onClick={addActivity}>
                  활동 기록 추가
                </button>
              </div>

              <div style={styles.activityList}>
                <h3 style={styles.sectionTitle}>활동 이력</h3>
                {selectedActivities.length === 0 ? (
                  <div style={styles.empty}>아직 기록된 활동이 없습니다.</div>
                ) : (
                  selectedActivities.map((activity) => (
                    <article key={activity.id} style={styles.activityItem}>
                      <div style={styles.activityTop}>
                        <span style={styles.activityType}>{activity.type}</span>
                        <span style={styles.activityDate}>{activity.date}</span>
                      </div>
                      <div style={styles.activityTitle}>{activity.title}</div>
                      {activity.memo && (
                        <div style={styles.activityMemo}>{activity.memo}</div>
                      )}
                    </article>
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

