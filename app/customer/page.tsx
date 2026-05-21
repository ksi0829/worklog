"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { styles } from "@/app/_modules/customer/styles";

type CustomerCategory = "customer" | "partner" | "other";

type Customer = {
  id: number;
  name: string;
  category: CustomerCategory;
  phone: string;
  address: string;
  memo: string;
  updatedAt: string;
  createdBy: string | null;
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
  createdBy: string | null;
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

type AsHistoryLog = {
  id: number;
  workOrderId: number;
  seq: number;
  action: string;
  part: string;
  memo: string;
  createdAt: string;
};

type AsHistoryOrder = {
  id: number;
  woNo: string;
  equipmentOrderId: number | null;
  serialNo: string;
  customer: string;
  model: string;
  title: string;
  status: string;
  createdAt: string;
  logs: AsHistoryLog[];
};

type CustomerForm = {
  name: string;
  category: CustomerCategory;
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

type EquipmentForm = {
  model: string;
  serialNo: string;
  deliveredOn: string;
  location: string;
  contactName: string;
  contactPhone: string;
  memo: string;
};

type CustomerRow = {
  id: number;
  name: string;
  category?: string | null;
  phone: string | null;
  address: string | null;
  memo: string | null;
  updated_at: string | null;
  created_by: string | null;
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
  created_by: string | null;
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
  created_by: string | null;
};

type AsWorkOrderRow = {
  id: number;
  wo_no: string;
  customer_equipment_id?: number | null;
  serial_no?: string | null;
  customer: string | null;
  model: string | null;
  title: string;
  status: string;
  created_at: string | null;
};

type AsServiceLogRow = {
  id: number;
  work_order_id: number;
  seq: number;
  action: string;
  part: string | null;
  memo: string | null;
  created_at: string | null;
};

const today = new Date().toISOString().slice(0, 10);
const supabase = createSupabaseBrowser();
const customerCategories: { key: CustomerCategory; label: string }[] = [
  { key: "customer", label: "고객사" },
  { key: "partner", label: "협력사" },
  { key: "other", label: "기타" },
];
const categoryLabel = Object.fromEntries(
  customerCategories.map((item) => [item.key, item.label])
) as Record<CustomerCategory, string>;

function normalizeCustomerCategory(value?: string | null): CustomerCategory {
  if (value === "customer") return "customer";
  if (value === "partner" || value === "processing" || value === "postprocess") {
    return "partner";
  }

  return "other";
}

const emptyCustomerForm: CustomerForm = {
  name: "",
  category: "customer",
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

const emptyEquipmentForm: EquipmentForm = {
  model: "",
  serialNo: "",
  deliveredOn: "",
  location: "",
  contactName: "",
  contactPhone: "",
  memo: "",
};

export default function CustomerPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [equipmentOrders, setEquipmentOrders] = useState<CustomerEquipment[]>([]);
  const [asHistoryOrders, setAsHistoryOrders] = useState<AsHistoryOrder[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerEditModalOpen, setCustomerEditModalOpen] = useState(false);
  const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
  const [equipmentEditModalOpen, setEquipmentEditModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<
    Record<CustomerCategory, boolean>
  >({
    customer: false,
    partner: false,
    other: false,
  });
  const [customerForm, setCustomerForm] =
    useState<CustomerForm>(emptyCustomerForm);
  const [customerEditForm, setCustomerEditForm] =
    useState<CustomerForm>(emptyCustomerForm);
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContactForm);
  const [equipmentForm, setEquipmentForm] =
    useState<EquipmentForm>(emptyEquipmentForm);
  const [equipmentEditForm, setEquipmentEditForm] =
    useState<EquipmentForm>(emptyEquipmentForm);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  const currentName =
    typeof window !== "undefined" ? localStorage.getItem("name") || "" : "";
  const currentTeam =
    typeof window !== "undefined" ? localStorage.getItem("team") || "" : "";
  const currentRole =
    typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
  const isAdmin = currentRole === "admin";

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
        const customerEquipment = equipmentOrders.filter(
          (equipment) =>
            equipment.customerId === customer.id || equipment.customer === customer.name
        );
        const text = [
          customer.name,
          categoryLabel[customer.category],
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
          ...customerEquipment.flatMap((equipment) => [
            equipment.model,
            equipment.serialNo,
            equipment.location,
            equipment.contactName,
            equipment.contactPhone,
            equipment.note,
          ]),
        ]
          .join(" ")
          .toLowerCase();

        return text.includes(normalized);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [contacts, customers, equipmentOrders, query]);

  const groupedCustomers = useMemo(() => {
    const groups: Record<CustomerCategory, Customer[]> = {
      customer: [],
      partner: [],
      other: [],
    };

    customerList.forEach((customer) => {
      groups[customer.category].push(customer);
    });

    return groups;
  }, [customerList]);

  const selectedContacts = useMemo(() => {
    if (!selectedCustomer) return [];

    return contacts
      .filter((contact) => contact.customerId === selectedCustomer.id)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [contacts, selectedCustomer]);

  const selectedContact =
    selectedContacts.find((contact) => contact.id === selectedContactId) || null;
  const selectedCustomerEquipment = useMemo(() => {
    if (!selectedCustomer) return [];

    return equipmentOrders.filter(
      (equipment) =>
        equipment.customerId === selectedCustomer.id ||
        equipment.customer === selectedCustomer.name
    );
  }, [equipmentOrders, selectedCustomer]);
  const selectedEquipment =
    equipmentOrders.find((equipment) => equipment.id === selectedEquipmentId) || null;
  const selectedEquipmentHistory = selectedEquipment
    ? asHistoryOrders.filter((order) => {
        const orderSerial = order.serialNo.trim().toLowerCase();
        const equipmentSerial = selectedEquipment.serialNo.trim().toLowerCase();

        return (
          order.equipmentOrderId === selectedEquipment.id ||
          Boolean(orderSerial && equipmentSerial && orderSerial === equipmentSerial)
        );
      })
    : [];
  const canManageSelectedCustomer = Boolean(
    selectedCustomer && (isAdmin || selectedCustomer.createdBy === currentUserId)
  );
  const canEditSelectedCustomer = Boolean(selectedCustomer && isAdmin);
  const canManageSelectedContact = Boolean(
    selectedContact && (isAdmin || selectedContact.createdBy === currentUserId)
  );

  function toggleCategory(category: CustomerCategory) {
    setExpandedCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
  }

  async function loadCustomerData() {
    setLoading(true);
    setLoadError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || "");

    const primaryCustomers = await supabase
      .from("customers")
      .select("id,name,category,phone,address,memo,updated_at,created_by")
      .order("name", { ascending: true });
    let customerRows = primaryCustomers.data as CustomerRow[] | null;
    let customerError = primaryCustomers.error;

    if (customerError?.message?.includes("category")) {
      const fallback = await supabase
        .from("customers")
        .select("id,name,phone,address,memo,updated_at,created_by")
        .order("name", { ascending: true });

      customerRows = fallback.data as CustomerRow[] | null;
      customerError = fallback.error;
    }

    if (customerError) {
      setLoadError(
        "고객사 DB 테이블을 확인해주세요. project-docs/supabase-shared-modules.sql 적용 후 다시 열면 됩니다."
      );
      setLoading(false);
      return;
    }

    const { data: contactRows, error: contactError } = await supabase
      .from("customer_contacts")
      .select("id,customer_id,name,department,position,phone,email,memo,created_by")
      .order("name", { ascending: true });

    if (contactError) {
      setLoadError("담당자 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

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
          "created_by",
        ].join(",")
      )
      .order("customer_name", { ascending: true })
      .order("model", { ascending: true })
      .limit(300);

    const asSelectBase =
      "id,wo_no,customer,model,title,status,created_at";
    const asSelectWithEquipment = `${asSelectBase},customer_equipment_id,serial_no`;
    const primaryAsOrders = await supabase
      .from("as_work_orders")
      .select(asSelectWithEquipment)
      .order("created_at", { ascending: false });
    let asRows = primaryAsOrders.data as AsWorkOrderRow[] | null;

    if (primaryAsOrders.error) {
      const fallbackAsOrders = await supabase
        .from("as_work_orders")
        .select(asSelectBase)
        .order("created_at", { ascending: false });
      asRows = fallbackAsOrders.data as AsWorkOrderRow[] | null;
    }

    const { data: serviceLogRows } = await supabase
      .from("as_service_logs")
      .select("id,work_order_id,seq,action,part,memo,created_at")
      .order("seq", { ascending: false });

    const logsByOrder = new Map<number, AsHistoryLog[]>();
    ((serviceLogRows || []) as AsServiceLogRow[]).forEach((log) => {
      const nextLog: AsHistoryLog = {
        id: log.id,
        workOrderId: log.work_order_id,
        seq: log.seq,
        action: log.action,
        part: log.part || "",
        memo: log.memo || "",
        createdAt: (log.created_at || today).slice(0, 10),
      };
      logsByOrder.set(log.work_order_id, [
        nextLog,
        ...(logsByOrder.get(log.work_order_id) || []),
      ]);
    });

    const mappedCustomers = ((customerRows || []) as CustomerRow[]).map(
      (customer) => ({
        id: customer.id,
        name: customer.name,
        category: normalizeCustomerCategory(customer.category ?? "customer"),
        phone: customer.phone || "",
        address: customer.address || "",
        memo: customer.memo || "",
        updatedAt: (customer.updated_at || today).slice(0, 10),
        createdBy: customer.created_by,
      })
    );
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
    const mappedAsOrders = ((asRows || []) as AsWorkOrderRow[]).map((order) => ({
      id: order.id,
      woNo: order.wo_no,
      equipmentOrderId: order.customer_equipment_id || null,
      serialNo: order.serial_no || "",
      customer: order.customer || "",
      model: order.model || "",
      title: order.title,
      status: order.status,
      createdAt: (order.created_at || today).slice(0, 10),
      logs: logsByOrder.get(order.id) || [],
    }));

    setCustomers(mappedCustomers);
    setEquipmentOrders(mappedEquipmentOrders);
    setAsHistoryOrders(mappedAsOrders);
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
        createdBy: contact.created_by,
      }))
    );
    setSelectedCustomerId((current) => {
      if (current && mappedCustomers.some((customer) => customer.id === current)) {
        return current;
      }
      return mappedCustomers[0]?.id || null;
    });
    setSelectedEquipmentId((current) => {
      if (current && mappedEquipmentOrders.some((order) => order.id === current)) {
        return current;
      }
      return null;
    });
    setLoading(false);
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateViewport = () => setIsMobile(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    void Promise.resolve().then(() => loadCustomerData());

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  function updateCustomer<K extends keyof CustomerForm>(
    key: K,
    value: CustomerForm[K]
  ) {
    setCustomerForm((current) => ({ ...current, [key]: value }));
  }

  function updateCustomerEdit<K extends keyof CustomerForm>(
    key: K,
    value: CustomerForm[K]
  ) {
    setCustomerEditForm((current) => ({ ...current, [key]: value }));
  }

  function openCustomerEdit() {
    if (!selectedCustomer) return;
    if (!isAdmin) {
      alert("관리자만 업체 정보를 수정할 수 있습니다.");
      return;
    }

    setCustomerEditForm({
      name: selectedCustomer.name,
      category: selectedCustomer.category,
      phone: selectedCustomer.phone,
      address: selectedCustomer.address,
      memo: selectedCustomer.memo,
    });
    setCustomerEditModalOpen(true);
  }

  function updateContact<K extends keyof ContactForm>(
    key: K,
    value: ContactForm[K]
  ) {
    setContactForm((current) => ({ ...current, [key]: value }));
  }

  function updateEquipment<K extends keyof EquipmentForm>(
    key: K,
    value: EquipmentForm[K]
  ) {
    setEquipmentForm((current) => ({ ...current, [key]: value }));
  }

  function updateEquipmentEdit<K extends keyof EquipmentForm>(
    key: K,
    value: EquipmentForm[K]
  ) {
    setEquipmentEditForm((current) => ({ ...current, [key]: value }));
  }

  function openEquipmentEdit() {
    if (!selectedEquipment) return;
    if (!isAdmin) {
      alert("관리자만 장비 정보를 수정할 수 있습니다.");
      return;
    }

    setEquipmentEditForm({
      model: selectedEquipment.model,
      serialNo: selectedEquipment.serialNo,
      deliveredOn: selectedEquipment.deliveredOn,
      location: selectedEquipment.location,
      contactName: selectedEquipment.contactName,
      contactPhone: selectedEquipment.contactPhone,
      memo: selectedEquipment.note,
    });
    setEquipmentEditModalOpen(true);
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
        category: customerForm.category,
        phone: customerForm.phone.trim(),
        address: customerForm.address.trim(),
        memo: customerForm.memo.trim(),
      })
      .select("id,name,category,phone,address,memo,updated_at,created_by")
      .single();

    if (error || !data) {
      if (error?.message?.includes("category")) {
        alert("고객사 분류 컬럼이 아직 없습니다. project-docs/supabase-customer-category-three.sql을 먼저 실행해 주세요.");
      } else {
        alert(error?.message || "업체 등록에 실패했습니다.");
      }
      return;
    }

    const row = data as CustomerRow;
    const nextCustomer: Customer = {
      id: row.id,
      name: row.name,
      category: normalizeCustomerCategory(row.category ?? customerForm.category),
      phone: row.phone || "",
      address: row.address || "",
      memo: row.memo || "",
      updatedAt: (row.updated_at || today).slice(0, 10),
      createdBy: row.created_by,
    };

    setCustomers((current) => [...current, nextCustomer]);
    setSelectedCustomerId(nextCustomer.id);
    setCustomerForm(emptyCustomerForm);
    setCustomerModalOpen(false);
  }

  async function updateSelectedCustomer() {
    if (!selectedCustomer) return;
    if (!isAdmin) {
      alert("관리자만 업체 정보를 수정할 수 있습니다.");
      return;
    }

    const name = customerEditForm.name.trim();

    if (!name) {
      alert("업체명은 필수입니다.");
      return;
    }

    const duplicate = customers.some(
      (customer) =>
        customer.id !== selectedCustomer.id &&
        customer.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      alert("이미 등록된 업체명입니다.");
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .update({
        name,
        category: customerEditForm.category,
        phone: customerEditForm.phone.trim(),
        address: customerEditForm.address.trim(),
        memo: customerEditForm.memo.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedCustomer.id)
      .select("id,name,category,phone,address,memo,updated_at,created_by")
      .single();

    if (error || !data) {
      if (error?.message?.includes("category")) {
        alert("고객사 분류 컬럼이 아직 없습니다. project-docs/supabase-customer-category-three.sql을 먼저 실행해 주세요.");
      } else {
        alert(error?.message || "업체 정보 수정에 실패했습니다.");
      }
      return;
    }

    const row = data as CustomerRow;
    const nextCustomer: Customer = {
      id: row.id,
      name: row.name,
      category: normalizeCustomerCategory(row.category ?? customerEditForm.category),
      phone: row.phone || "",
      address: row.address || "",
      memo: row.memo || "",
      updatedAt: (row.updated_at || today).slice(0, 10),
      createdBy: row.created_by,
    };

    setCustomers((current) =>
      current.map((customer) =>
        customer.id === nextCustomer.id ? nextCustomer : customer
      )
    );
    setCustomerEditForm(emptyCustomerForm);
    setCustomerEditModalOpen(false);
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
      .select("id,customer_id,name,department,position,phone,email,memo,created_by")
      .single();

    if (error || !data) {
      alert(error?.message || "담당자 등록에 실패했습니다.");
      return;
    }

    if (canManageSelectedCustomer) {
      await supabase
        .from("customers")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", selectedCustomer.id);
    }

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
      createdBy: row.created_by,
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

  async function addEquipment() {
    if (!selectedCustomer) {
      alert("먼저 업체를 선택해주세요.");
      return;
    }
    if (!isAdmin) {
      alert("관리자만 납품 장비를 등록할 수 있습니다.");
      return;
    }

    const model = equipmentForm.model.trim();

    if (!model) {
      alert("장비명/모델은 필수입니다.");
      return;
    }

    const { data, error } = await supabase
      .from("customer_equipments")
      .insert({
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        model,
        serial_no: equipmentForm.serialNo.trim(),
        delivered_on: equipmentForm.deliveredOn || null,
        location: equipmentForm.location.trim(),
        contact_name: equipmentForm.contactName.trim(),
        contact_phone: equipmentForm.contactPhone.trim(),
        note: equipmentForm.memo.trim(),
      })
      .select("id,customer_id,customer_name,model,serial_no,delivered_on,location,contact_name,contact_phone,note,created_by")
      .single();

    if (error || !data) {
      alert(error?.message || "납품 장비 등록에 실패했습니다.");
      return;
    }

    const row = data as CustomerEquipmentRow;
    const nextEquipment: CustomerEquipment = {
      id: row.id,
      customerId: row.customer_id || selectedCustomer.id,
      customer: row.customer_name || selectedCustomer.name,
      model: row.model || "",
      serialNo: row.serial_no || "",
      deliveredOn: (row.delivered_on || "").slice(0, 10),
      location: row.location || "",
      contactName: row.contact_name || "",
      contactPhone: row.contact_phone || "",
      note: row.note || "",
    };

    setEquipmentOrders((current) => [...current, nextEquipment]);
    setSelectedEquipmentId(nextEquipment.id);
    setEquipmentForm(emptyEquipmentForm);
    setEquipmentModalOpen(false);
  }

  async function updateSelectedEquipment() {
    if (!selectedEquipment) return;
    if (!isAdmin) {
      alert("관리자만 장비 정보를 수정할 수 있습니다.");
      return;
    }

    const model = equipmentEditForm.model.trim();
    if (!model) {
      alert("장비명/모델은 필수입니다.");
      return;
    }

    const { data, error } = await supabase
      .from("customer_equipments")
      .update({
        model,
        serial_no: equipmentEditForm.serialNo.trim(),
        delivered_on: equipmentEditForm.deliveredOn || null,
        location: equipmentEditForm.location.trim(),
        contact_name: equipmentEditForm.contactName.trim(),
        contact_phone: equipmentEditForm.contactPhone.trim(),
        note: equipmentEditForm.memo.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedEquipment.id)
      .select("id,customer_id,customer_name,model,serial_no,delivered_on,location,contact_name,contact_phone,note,created_by")
      .single();

    if (error || !data) {
      alert(error?.message || "납품 장비 수정에 실패했습니다.");
      return;
    }

    const row = data as CustomerEquipmentRow;
    const nextEquipment: CustomerEquipment = {
      id: row.id,
      customerId: row.customer_id || selectedEquipment.customerId,
      customer: row.customer_name || selectedEquipment.customer,
      model: row.model || "",
      serialNo: row.serial_no || "",
      deliveredOn: (row.delivered_on || "").slice(0, 10),
      location: row.location || "",
      contactName: row.contact_name || "",
      contactPhone: row.contact_phone || "",
      note: row.note || "",
    };

    setEquipmentOrders((current) =>
      current.map((equipment) =>
        equipment.id === nextEquipment.id ? nextEquipment : equipment
      )
    );
    setEquipmentEditModalOpen(false);
  }

  async function deleteEquipment() {
    if (!selectedEquipment) return;
    if (!isAdmin) {
      alert("관리자만 납품 장비를 삭제할 수 있습니다.");
      return;
    }
    if (!confirm("선택한 납품 장비를 삭제할까요?")) return;

    const { error } = await supabase
      .from("customer_equipments")
      .delete()
      .eq("id", selectedEquipment.id);

    if (error) {
      alert(error.message);
      return;
    }

    setEquipmentOrders((current) =>
      current.filter((equipment) => equipment.id !== selectedEquipment.id)
    );
    setSelectedEquipmentId(null);
    setEquipmentEditModalOpen(false);
  }

  async function deleteCustomer() {
    if (!selectedCustomer) return;
    if (!canManageSelectedCustomer) {
      alert("작성자 또는 관리자만 업체를 삭제할 수 있습니다.");
      return;
    }
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
    setEquipmentOrders((current) =>
      current.filter((equipment) => equipment.customerId !== selectedCustomer.id)
    );
    setSelectedCustomerId(null);
    setContactModalOpen(false);
    setCustomerEditModalOpen(false);
    setEquipmentModalOpen(false);
    setEquipmentEditModalOpen(false);
    setSelectedContactId(null);
    setSelectedEquipmentId(null);
  }

  async function deleteContact(contactId: number) {
    const contact = contacts.find((item) => item.id === contactId);
    if (!contact || (!isAdmin && contact.createdBy !== currentUserId)) {
      alert("작성자 또는 관리자만 담당자를 삭제할 수 있습니다.");
      return;
    }
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
    <main style={{ ...styles.page, ...(isMobile ? styles.pageMobile : {}) }}>
      <section style={{ ...styles.container, ...(isMobile ? styles.containerMobile : {}) }}>
        <header style={styles.header}>
          <BrandLogo
            subtitle="고객사 DB"
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
        {loading && <div style={styles.empty}>고객사 목록을 불러오는 중입니다.</div>}

        <section style={{ ...styles.summaryGrid, ...(isMobile ? styles.summaryGridMobile : {}) }}>
          <SummaryCard label="등록 업체" value={`${customers.length}개`} />
          <SummaryCard label="담당자" value={`${contacts.length}명`} />
          <SummaryCard
            label="선택 업체"
            value={selectedCustomer ? selectedCustomer.name : "-"}
          />
        </section>

        <section style={{ ...styles.layout, ...(isMobile ? styles.layoutMobile : {}) }}>
          <div style={styles.leftColumn}>
            <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
              <div style={{ ...styles.panelHeader, ...(isMobile ? styles.panelHeaderMobile : {}) }}>
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
                  customerCategories.map((category) => {
                    const items = groupedCustomers[category.key];
                    const expanded = expandedCategories[category.key];

                    return (
                      <section key={category.key} style={styles.categorySection}>
                        <button
                          type="button"
                          style={styles.categoryHeader}
                          onClick={() => toggleCategory(category.key)}
                        >
                          <span>{category.label}</span>
                          <strong>{items.length}개</strong>
                          <span
                            style={{
                              ...styles.categoryArrow,
                              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                            }}
                          >
                            ›
                          </span>
                        </button>

                        {expanded && (
                          <div style={styles.categoryBody}>
                            {items.length === 0 ? (
                              <div style={styles.categoryEmpty}>
                                등록된 업체가 없습니다.
                              </div>
                            ) : (
                              items.map((customer) => {
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
                                    <span style={styles.customerName}>
                                      {customer.name}
                                    </span>
                                    <span style={styles.customerMeta}>
                                      담당자 {contactCount}명
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
            {!selectedCustomer ? (
              <div style={styles.empty}>
                업체를 선택하면 담당자 목록과 등록 폼이 열립니다.
              </div>
            ) : (
              <>
                <div style={{ ...styles.detailHeader, ...(isMobile ? styles.detailHeaderMobile : {}) }}>
                  <div>
                    <div style={styles.detailMeta}>선택 업체</div>
                    <h2 style={styles.detailTitle}>{selectedCustomer.name}</h2>
                    <div style={styles.categoryPill}>
                      {categoryLabel[selectedCustomer.category]}
                    </div>
                  </div>
                  {(canEditSelectedCustomer || canManageSelectedCustomer) && (
                    <div style={{ ...styles.detailActions, ...(isMobile ? styles.detailActionsMobile : {}) }}>
                      {canEditSelectedCustomer && (
                        <button style={styles.editButton} onClick={openCustomerEdit}>
                          정보 수정
                        </button>
                      )}
                      {canManageSelectedCustomer && (
                        <button style={styles.deleteButton} onClick={deleteCustomer}>
                          업체 삭제
                        </button>
                      )}
                    </div>
                  )}
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
                        style={{ ...styles.contactRow, ...(isMobile ? styles.contactRowMobile : {}) }}
                        onClick={() => setSelectedContactId(contact.id)}
                      >
                        <span style={styles.contactRowName}>{contact.name}</span>
                        <span style={styles.contactRowMeta}>
                          {contact.position || "-"}
                        </span>
                        <span style={{ ...styles.contactRowPhone, ...(isMobile ? styles.contactRowPhoneMobile : {}) }}>
                          {contact.phone || "연락처 없음"}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                <div style={styles.equipmentSection}>
                  <div style={styles.sectionHeader}>
                    <div>
                      <h3 style={styles.sectionTitle}>납품 장비</h3>
                      <div style={styles.detailMeta}>
                        고객사에 실제 납품된 장비 원장입니다.
                      </div>
                    </div>
                    {isAdmin ? (
                      <button
                        type="button"
                        style={styles.smallPrimaryButton}
                        onClick={() => setEquipmentModalOpen(true)}
                      >
                        장비 등록
                      </button>
                    ) : (
                      <span style={styles.customerMeta}>
                        {selectedCustomerEquipment.length}건
                      </span>
                    )}
                  </div>

                  {selectedCustomerEquipment.length === 0 ? (
                    <div style={styles.empty}>
                      연결된 납품 또는 진행 장비가 없습니다.
                    </div>
                  ) : (
                    <div style={styles.equipmentList}>
                      {selectedCustomerEquipment.map((equipment) => (
                        <button
                          key={equipment.id}
                          type="button"
                          style={styles.equipmentCard}
                          onClick={() => setSelectedEquipmentId(equipment.id)}
                        >
                          <span style={styles.equipmentCardTitle}>
                            {equipment.model || "모델 미입력"}
                          </span>
                          <span style={styles.equipmentCardMeta}>
                            {[equipment.serialNo, equipment.location]
                              .filter(Boolean)
                              .join(" · ") || "-"}
                          </span>
                          <span style={styles.equipmentCardBadge}>
                            A/S {asHistoryOrders.filter((order) => order.equipmentOrderId === equipment.id).length}건
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {customerModalOpen && (
          <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modal, ...(isMobile ? styles.modalMobile : {}) }}>
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

              <Field label="분류">
                <select
                  value={customerForm.category}
                  onChange={(event) =>
                    updateCustomer("category", event.target.value as CustomerCategory)
                  }
                  style={styles.input}
                >
                  {customerCategories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </select>
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

        {customerEditModalOpen && selectedCustomer && (
          <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modal, ...(isMobile ? styles.modalMobile : {}) }}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.detailMeta}>선택 업체</div>
                  <h2 style={styles.panelTitle}>업체 정보 수정</h2>
                </div>
                <button
                  style={styles.closeButton}
                  onClick={() => {
                    setCustomerEditModalOpen(false);
                    setCustomerEditForm(emptyCustomerForm);
                  }}
                >
                  닫기
                </button>
              </div>

              <Field label="업체명">
                <input
                  value={customerEditForm.name}
                  onChange={(event) =>
                    updateCustomerEdit("name", event.target.value)
                  }
                  placeholder="업체명"
                  style={styles.input}
                />
              </Field>

              <Field label="분류">
                <select
                  value={customerEditForm.category}
                  onChange={(event) =>
                    updateCustomerEdit(
                      "category",
                      event.target.value as CustomerCategory
                    )
                  }
                  style={styles.input}
                >
                  {customerCategories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="대표 연락처">
                <input
                  value={customerEditForm.phone}
                  onChange={(event) =>
                    updateCustomerEdit("phone", event.target.value)
                  }
                  placeholder="대표번호"
                  style={styles.input}
                />
              </Field>

              <Field label="주소">
                <input
                  value={customerEditForm.address}
                  onChange={(event) =>
                    updateCustomerEdit("address", event.target.value)
                  }
                  placeholder="주소"
                  style={styles.input}
                />
              </Field>

              <Field label="메모">
                <textarea
                  value={customerEditForm.memo}
                  onChange={(event) =>
                    updateCustomerEdit("memo", event.target.value)
                  }
                  placeholder="거래 특이사항, 방문 참고사항"
                  style={{ ...styles.input, ...styles.textarea }}
                />
              </Field>

              <button style={styles.primaryButton} onClick={updateSelectedCustomer}>
                정보 저장
              </button>
            </div>
          </div>
        )}

        {equipmentModalOpen && selectedCustomer && (
          <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modal, ...(isMobile ? styles.modalMobile : {}) }}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.detailMeta}>{selectedCustomer.name}</div>
                  <h2 style={styles.panelTitle}>납품 장비 등록</h2>
                </div>
                <button
                  style={styles.closeButton}
                  onClick={() => {
                    setEquipmentModalOpen(false);
                    setEquipmentForm(emptyEquipmentForm);
                  }}
                >
                  닫기
                </button>
              </div>

              <EquipmentFields
                form={equipmentForm}
                isMobile={isMobile}
                contacts={selectedContacts}
                onChange={updateEquipment}
              />

              <button style={styles.primaryButton} onClick={addEquipment}>
                장비 등록
              </button>
            </div>
          </div>
        )}

        {equipmentEditModalOpen && selectedEquipment && (
          <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modal, ...(isMobile ? styles.modalMobile : {}) }}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.detailMeta}>{selectedEquipment.customer}</div>
                  <h2 style={styles.panelTitle}>납품 장비 수정</h2>
                </div>
                <button
                  style={styles.closeButton}
                  onClick={() => {
                    setEquipmentEditModalOpen(false);
                    setEquipmentEditForm(emptyEquipmentForm);
                  }}
                >
                  닫기
                </button>
              </div>

              <EquipmentFields
                form={equipmentEditForm}
                isMobile={isMobile}
                contacts={selectedContacts}
                onChange={updateEquipmentEdit}
              />

              <button style={styles.primaryButton} onClick={updateSelectedEquipment}>
                정보 저장
              </button>
            </div>
          </div>
        )}

        {contactModalOpen && selectedCustomer && (
          <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modal, ...(isMobile ? styles.modalMobile : {}) }}>
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

              <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
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

              <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
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

        {selectedEquipment && (
          <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modal, ...(isMobile ? styles.modalMobile : {}) }}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.detailMeta}>납품 장비 상세</div>
                  <h2 style={styles.panelTitle}>
                    {selectedEquipment.customer} /{" "}
                    {selectedEquipment.model || "모델 미입력"}
                  </h2>
                </div>
                <div style={styles.modalHeaderActions}>
                  {isAdmin && (
                    <>
                      <button style={styles.editButton} onClick={openEquipmentEdit}>
                        수정
                      </button>
                      <button style={styles.modalDeleteButton} onClick={deleteEquipment}>
                        삭제
                      </button>
                    </>
                  )}
                  <button
                    style={styles.closeButton}
                    onClick={() => setSelectedEquipmentId(null)}
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div style={styles.detailGrid}>
                <InfoBox label="Serial No" value={selectedEquipment.serialNo || "-"} />
                <InfoBox label="납품일" value={selectedEquipment.deliveredOn || "-"} />
                <InfoBox label="담당자" value={selectedEquipment.contactName || "-"} />
                <InfoBox label="연락처" value={selectedEquipment.contactPhone || "-"} />
              </div>

              {(selectedEquipment.location || selectedEquipment.note) && (
                <div style={styles.modalMemo}>
                  {[selectedEquipment.location, selectedEquipment.note]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}

              <div style={styles.equipmentHistory}>
                <h3 style={styles.sectionTitle}>A/S 이력</h3>
                {selectedEquipmentHistory.length === 0 ? (
                  <div style={styles.empty}>이 장비에 연결된 A/S 이력이 없습니다.</div>
                ) : (
                  selectedEquipmentHistory.map((order) => (
                    <div key={order.id} style={styles.historyBlock}>
                      <div style={styles.historyTitle}>
                        {order.woNo} · {order.title}
                      </div>
                      <div style={styles.equipmentCardMeta}>
                        {order.createdAt} · {order.status}
                      </div>
                      {order.logs.length === 0 ? (
                        <div style={styles.historyEmpty}>처리내역 없음</div>
                      ) : (
                        <div style={styles.historyList}>
                          {order.logs.map((log) => (
                            <div key={log.id} style={styles.historyItem}>
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
            </div>
          </div>
        )}

        {selectedContact && (
          <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modal, ...(isMobile ? styles.modalMobile : {}) }}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.detailMeta}>담당자 상세</div>
                  <h2 style={styles.panelTitle}>{selectedContact.name}</h2>
                </div>
                <div style={styles.modalHeaderActions}>
                  {canManageSelectedContact && (
                    <button
                      style={styles.modalDeleteButton}
                      onClick={() => deleteContact(selectedContact.id)}
                    >
                      삭제
                    </button>
                  )}
                  <button
                    style={styles.closeButton}
                    onClick={() => setSelectedContactId(null)}
                  >
                    닫기
                  </button>
                </div>
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

function EquipmentFields({
  form,
  isMobile,
  contacts,
  onChange,
}: {
  form: EquipmentForm;
  isMobile: boolean;
  contacts: Contact[];
  onChange: <K extends keyof EquipmentForm>(key: K, value: EquipmentForm[K]) => void;
}) {
  function handleContactSelect(value: string) {
    const contact = contacts.find((item) => String(item.id) === value);
    onChange("contactName", contact?.name || "");
    onChange("contactPhone", contact?.phone || "");
  }

  return (
    <>
      <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
        <Field label="장비명/모델">
          <input
            value={form.model}
            onChange={(event) => onChange("model", event.target.value)}
            placeholder="예: RCI-300"
            style={styles.input}
          />
        </Field>

        <Field label="Serial No">
          <input
            value={form.serialNo}
            onChange={(event) => onChange("serialNo", event.target.value)}
            placeholder="시리얼 번호"
            style={styles.input}
          />
        </Field>
      </div>

      <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
        <Field label="납품일">
          <input
            value={form.deliveredOn}
            onChange={(event) => onChange("deliveredOn", event.target.value)}
            placeholder=""
            style={styles.input}
          />
        </Field>

        <Field label="담당자">
          <select
            value={
              contacts.find(
                (contact) =>
                  contact.name === form.contactName &&
                  (contact.phone || "") === (form.contactPhone || "")
              )?.id || ""
            }
            onChange={(event) => handleContactSelect(event.target.value)}
            style={styles.input}
          >
            <option value="">담당자 선택</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {[contact.name, contact.position, contact.phone]
                  .filter(Boolean)
                  .join(" / ")}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>

        <Field label="연락처">
          <input
            value={form.contactPhone}
            onChange={(event) => onChange("contactPhone", event.target.value)}
            placeholder="휴대폰 또는 내선"
            style={styles.input}
          />
        </Field>
      </div>

      <Field label="메모">
        <textarea
          value={form.memo}
          onChange={(event) => onChange("memo", event.target.value)}
          placeholder="장비 특이사항, 계약/설치 참고사항"
          style={{ ...styles.input, ...styles.textarea }}
        />
      </Field>
    </>
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

