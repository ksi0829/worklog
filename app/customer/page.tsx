"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { styles } from "@/app/_modules/customer/styles";

type Customer = {
  id: number;
  name: string;
  phone: string;
  address: string;
  memo: string;
  updatedAt: string;
};

type Contact = {
  id: number;
  customerId: number;
  name: string;
  department: string;
  position: string;
  phone: string;
  email: string;
  memo: string;
};

type CustomerForm = {
  name: string;
  phone: string;
  address: string;
  memo: string;
};

type ContactForm = {
  name: string;
  department: string;
  position: string;
  phone: string;
  email: string;
  memo: string;
};

type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  memo: string | null;
  updated_at: string | null;
};

type ContactRow = {
  id: number;
  customer_id: number;
  name: string;
  department: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  memo: string | null;
};

const today = new Date().toISOString().slice(0, 10);
const supabase = createSupabaseBrowser();

const emptyCustomerForm: CustomerForm = {
  name: "",
  phone: "",
  address: "",
  memo: "",
};

const emptyContactForm: ContactForm = {
  name: "",
  department: "",
  position: "",
  phone: "",
  email: "",
  memo: "",
};

export default function CustomerPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [customerForm, setCustomerForm] =
    useState<CustomerForm>(emptyCustomerForm);
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContactForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const currentName =
    typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
  const currentTeam =
    typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
  const currentRole =
    typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";

  const selectedCustomer =
    customers.find((customer) => customer.id === selectedCustomerId) || null;

  const customerList = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return customers
      .filter((customer) => {
        if (!normalized) return true;

        const customerContacts = contacts.filter(
          (contact) => contact.customerId === customer.id
        );
        const text = [
          customer.name,
          customer.phone,
          customer.address,
          customer.memo,
          ...customerContacts.flatMap((contact) => [
            contact.name,
            contact.department,
            contact.position,
            contact.phone,
            contact.email,
            contact.memo,
          ]),
        ]
          .join(" ")
          .toLowerCase();

        return text.includes(normalized);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [contacts, customers, query]);

  const selectedContacts = useMemo(() => {
    if (!selectedCustomer) return [];

    return contacts
      .filter((contact) => contact.customerId === selectedCustomer.id)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [contacts, selectedCustomer]);

  const selectedContact =
    selectedContacts.find((contact) => contact.id === selectedContactId) || null;

  async function loadCustomerData() {
    setLoading(true);
    setLoadError("");

    const { data: customerRows, error: customerError } = await supabase
      .from("customers")
      .select("id,name,phone,address,memo,updated_at")
      .order("name", { ascending: true });

    if (customerError) {
      setLoadError(
        "고객사 DB 테이블을 확인해주세요. project-docs/supabase-shared-modules.sql 적용 후 다시 열면 됩니다."
      );
      setLoading(false);
      return;
    }

    const { data: contactRows, error: contactError } = await supabase
      .from("customer_contacts")
      .select("id,customer_id,name,department,position,phone,email,memo")
      .order("name", { ascending: true });

    if (contactError) {
      setLoadError("담당자 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const mappedCustomers = ((customerRows || []) as CustomerRow[]).map(
      (customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone || "",
        address: customer.address || "",
        memo: customer.memo || "",
        updatedAt: (customer.updated_at || today).slice(0, 10),
      })
    );

    setCustomers(mappedCustomers);
    setContacts(
      ((contactRows || []) as ContactRow[]).map((contact) => ({
        id: contact.id,
        customerId: contact.customer_id,
        name: contact.name,
        department: contact.department || "",
        position: contact.position || "",
        phone: contact.phone || "",
        email: contact.email || "",
        memo: contact.memo || "",
      }))
    );
    setSelectedCustomerId((current) => {
      if (current && mappedCustomers.some((customer) => customer.id === current)) {
        return current;
      }
      return mappedCustomers[0]?.id || null;
    });
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadCustomerData());
  }, []);

  function updateCustomer<K extends keyof CustomerForm>(
    key: K,
    value: CustomerForm[K]
  ) {
    setCustomerForm((current) => ({ ...current, [key]: value }));
  }

  function updateContact<K extends keyof ContactForm>(
    key: K,
    value: ContactForm[K]
  ) {
    setContactForm((current) => ({ ...current, [key]: value }));
  }

  async function addCustomer() {
    const name = customerForm.name.trim();

    if (!name) {
      alert("업체명은 필수입니다.");
      return;
    }

    const duplicate = customers.some(
      (customer) => customer.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      alert("이미 등록된 업체명입니다.");
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({
        name,
        phone: customerForm.phone.trim(),
        address: customerForm.address.trim(),
        memo: customerForm.memo.trim(),
      })
      .select("id,name,phone,address,memo,updated_at")
      .single();

    if (error || !data) {
      alert(error?.message || "업체 등록에 실패했습니다.");
      return;
    }

    const row = data as CustomerRow;
    const nextCustomer: Customer = {
      id: row.id,
      name: row.name,
      phone: row.phone || "",
      address: row.address || "",
      memo: row.memo || "",
      updatedAt: (row.updated_at || today).slice(0, 10),
    };

    setCustomers((current) => [...current, nextCustomer]);
    setSelectedCustomerId(nextCustomer.id);
    setCustomerForm(emptyCustomerForm);
    setCustomerModalOpen(false);
  }

  async function addContact() {
    if (!selectedCustomer) {
      alert("먼저 업체를 선택해주세요.");
      return;
    }

    const name = contactForm.name.trim();

    if (!name) {
      alert("담당자명은 필수입니다.");
      return;
    }

    const { data, error } = await supabase
      .from("customer_contacts")
      .insert({
        customer_id: selectedCustomer.id,
        name,
        department: contactForm.department.trim(),
        position: contactForm.position.trim(),
        phone: contactForm.phone.trim(),
        email: contactForm.email.trim(),
        memo: contactForm.memo.trim(),
      })
      .select("id,customer_id,name,department,position,phone,email,memo")
      .single();

    if (error || !data) {
      alert(error?.message || "담당자 등록에 실패했습니다.");
      return;
    }

    await supabase
      .from("customers")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selectedCustomer.id);

    const row = data as ContactRow;
    const nextContact: Contact = {
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      department: row.department || "",
      position: row.position || "",
      phone: row.phone || "",
      email: row.email || "",
      memo: row.memo || "",
    };

    setContacts((current) => [...current, nextContact]);
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === selectedCustomer.id
          ? { ...customer, updatedAt: today }
          : customer
      )
    );
    setContactForm(emptyContactForm);
    setContactModalOpen(false);
  }

  async function deleteCustomer() {
    if (!selectedCustomer) return;
    if (!confirm("선택한 업체와 담당자를 삭제할까요?")) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", selectedCustomer.id);

    if (error) {
      alert(error.message);
      return;
    }

    setCustomers((current) =>
      current.filter((customer) => customer.id !== selectedCustomer.id)
    );
    setContacts((current) =>
      current.filter((contact) => contact.customerId !== selectedCustomer.id)
    );
    setSelectedCustomerId(null);
    setContactModalOpen(false);
    setSelectedContactId(null);
  }

  async function deleteContact(contactId: number) {
    if (!confirm("담당자를 삭제할까요?")) return;
    const { error } = await supabase
      .from("customer_contacts")
      .delete()
      .eq("id", contactId);

    if (error) {
      alert(error.message);
      return;
    }

    setContacts((current) => current.filter((contact) => contact.id !== contactId));
    setSelectedContactId(null);
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.logo}>ZETA</div>
            <h1 style={styles.title}>고객사 DB</h1>
          </div>

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
        {loading && <div style={styles.empty}>고객사 목록을 불러오는 중입니다.</div>}

        <section style={styles.summaryGrid}>
          <SummaryCard label="등록 업체" value={`${customers.length}개`} />
          <SummaryCard label="담당자" value={`${contacts.length}명`} />
          <SummaryCard
            label="선택 업체"
            value={selectedCustomer ? selectedCustomer.name : "-"}
          />
        </section>

        <section style={styles.layout}>
          <div style={styles.leftColumn}>
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <h2 style={styles.panelTitle}>업체 목록</h2>
                <button
                  style={styles.smallPrimaryButton}
                  onClick={() => setCustomerModalOpen(true)}
                >
                  업체 등록
                </button>
              </div>

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="업체명 / 담당자 / 연락처 검색"
                style={{ ...styles.input, marginBottom: 12 }}
              />

              <div style={styles.customerList}>
                {customerList.length === 0 ? (
                  <div style={styles.empty}>등록된 업체가 없습니다.</div>
                ) : (
                  customerList.map((customer) => {
                    const contactCount = contacts.filter(
                      (contact) => contact.customerId === customer.id
                    ).length;

                    return (
                      <button
                        key={customer.id}
                        style={
                          selectedCustomer?.id === customer.id
                            ? styles.selectedCustomerCard
                            : styles.customerCard
                        }
                        onClick={() => setSelectedCustomerId(customer.id)}
                      >
                        <span style={styles.customerName}>{customer.name}</span>
                        <span style={styles.customerMeta}>
                          담당자 {contactCount}명
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div style={styles.panel}>
            {!selectedCustomer ? (
              <div style={styles.empty}>
                업체를 선택하면 담당자 목록과 등록 폼이 열립니다.
              </div>
            ) : (
              <>
                <div style={styles.detailHeader}>
                  <div>
                    <div style={styles.detailMeta}>선택 업체</div>
                    <h2 style={styles.detailTitle}>{selectedCustomer.name}</h2>
                  </div>
                  <button style={styles.deleteButton} onClick={deleteCustomer}>
                    업체 삭제
                  </button>
                </div>

                <div style={styles.infoGrid}>
                  <InfoBox label="대표 연락처" value={selectedCustomer.phone || "-"} />
                  <InfoBox label="주소" value={selectedCustomer.address || "-"} />
                  <InfoBox label="최근 업데이트" value={selectedCustomer.updatedAt} />
                </div>

                {selectedCustomer.memo && (
                  <div style={styles.memoBox}>{selectedCustomer.memo}</div>
                )}

                <div style={styles.contactList}>
                  <div style={styles.sectionHeader}>
                    <h3 style={styles.sectionTitle}>담당자 목록</h3>
                    <button
                      type="button"
                      style={styles.smallPrimaryButton}
                      onClick={() => setContactModalOpen(true)}
                    >
                      담당자 등록
                    </button>
                  </div>

                  {selectedContacts.length === 0 ? (
                    <div style={styles.empty}>등록된 담당자가 없습니다.</div>
                  ) : (
                    selectedContacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        style={styles.contactRow}
                        onClick={() => setSelectedContactId(contact.id)}
                      >
                        <span style={styles.contactRowName}>{contact.name}</span>
                        <span style={styles.contactRowMeta}>
                          {contact.position || "-"}
                        </span>
                        <span style={styles.contactRowPhone}>
                          {contact.phone || "연락처 없음"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {customerModalOpen && (
          <div style={styles.modalBackdrop}>
            <div style={styles.modal}>
              <div style={styles.modalHeader}>
                <h2 style={styles.panelTitle}>업체 등록</h2>
                <button
                  style={styles.closeButton}
                  onClick={() => {
                    setCustomerModalOpen(false);
                    setCustomerForm(emptyCustomerForm);
                  }}
                >
                  닫기
                </button>
              </div>

              <Field label="업체명">
                <input
                  value={customerForm.name}
                  onChange={(event) => updateCustomer("name", event.target.value)}
                  placeholder="업체명"
                  style={styles.input}
                />
              </Field>

              <Field label="대표 연락처">
                <input
                  value={customerForm.phone}
                  onChange={(event) => updateCustomer("phone", event.target.value)}
                  placeholder="대표번호"
                  style={styles.input}
                />
              </Field>

              <Field label="주소">
                <input
                  value={customerForm.address}
                  onChange={(event) => updateCustomer("address", event.target.value)}
                  placeholder="주소"
                  style={styles.input}
                />
              </Field>

              <Field label="메모">
                <textarea
                  value={customerForm.memo}
                  onChange={(event) => updateCustomer("memo", event.target.value)}
                  placeholder="거래 특이사항, 방문 참고사항"
                  style={{ ...styles.input, ...styles.textarea }}
                />
              </Field>

              <button style={styles.primaryButton} onClick={addCustomer}>
                업체 등록
              </button>
            </div>
          </div>
        )}

        {contactModalOpen && selectedCustomer && (
          <div style={styles.modalBackdrop}>
            <div style={styles.modal}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.detailMeta}>{selectedCustomer.name}</div>
                  <h2 style={styles.panelTitle}>담당자 등록</h2>
                </div>
                <button
                  style={styles.closeButton}
                  onClick={() => {
                    setContactModalOpen(false);
                    setContactForm(emptyContactForm);
                  }}
                >
                  닫기
                </button>
              </div>

              <div style={styles.formGrid}>
                <Field label="담당자">
                  <input
                    value={contactForm.name}
                    onChange={(event) => updateContact("name", event.target.value)}
                    placeholder="이름"
                    style={styles.input}
                  />
                </Field>

                <Field label="부서">
                  <input
                    value={contactForm.department}
                    onChange={(event) =>
                      updateContact("department", event.target.value)
                    }
                    placeholder="부서"
                    style={styles.input}
                  />
                </Field>
              </div>

              <div style={styles.formGrid}>
                <Field label="직함">
                  <input
                    value={contactForm.position}
                    onChange={(event) =>
                      updateContact("position", event.target.value)
                    }
                    placeholder="직함"
                    style={styles.input}
                  />
                </Field>

                <Field label="연락처">
                  <input
                    value={contactForm.phone}
                    onChange={(event) => updateContact("phone", event.target.value)}
                    placeholder="휴대폰 또는 내선"
                    style={styles.input}
                  />
                </Field>
              </div>

              <Field label="이메일">
                <input
                  value={contactForm.email}
                  onChange={(event) => updateContact("email", event.target.value)}
                  placeholder="email@example.com"
                  style={styles.input}
                />
              </Field>

              <Field label="메모">
                <input
                  value={contactForm.memo}
                  onChange={(event) => updateContact("memo", event.target.value)}
                  placeholder="담당 업무, 선호 연락 방식 등"
                  style={styles.input}
                />
              </Field>

              <button style={styles.primaryButton} onClick={addContact}>
                담당자 등록
              </button>
            </div>
          </div>
        )}

        {selectedContact && (
          <div style={styles.modalBackdrop}>
            <div style={styles.modal}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.detailMeta}>담당자 상세</div>
                  <h2 style={styles.panelTitle}>{selectedContact.name}</h2>
                </div>
                <button
                  style={styles.closeButton}
                  onClick={() => setSelectedContactId(null)}
                >
                  닫기
                </button>
              </div>

              <div style={styles.detailGrid}>
                <InfoBox label="직함" value={selectedContact.position || "-"} />
                <InfoBox label="부서" value={selectedContact.department || "-"} />
                <InfoBox label="연락처" value={selectedContact.phone || "-"} />
                <InfoBox label="이메일" value={selectedContact.email || "-"} />
              </div>

              {selectedContact.memo && (
                <div style={styles.modalMemo}>{selectedContact.memo}</div>
              )}

              <button
                style={styles.modalDeleteButton}
                onClick={() => deleteContact(selectedContact.id)}
              >
                담당자 삭제
              </button>
            </div>
          </div>
        )}
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoBox}>
      <span style={styles.infoLabel}>{label}</span>
      <strong style={styles.infoValue}>{value}</strong>
    </div>
  );
}

