import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutDashboard, Users, PackagePlus, Wallet, Receipt, ScrollText,
  TrendingUp, FileBarChart, Settings, LogOut, Plus, Search, Pencil,
  Trash2, X, Printer, Download, Sun, Moon, ChevronLeft, ArrowUpRight,
  ArrowDownRight, CircleDollarSign, ShieldCheck, Menu, Building2, Truck, CreditCard, Banknote,
  Plug, UserCog, Boxes,
} from "lucide-react";

const CUR = "BDT";
const TABLE_KEYS = ["customers", "sales", "payments", "expenses", "suppliers", "purchases", "supplierPayments"];
const MP_TABLE_KEYS = ["mpCustomers", "mpSuppliers", "mpSalesmen", "mpProducts", "mpPurchases", "mpSales", "mpPayments", "mpSupplierPayments"];
const ALL_TABLE_KEYS = [...TABLE_KEYS, ...MP_TABLE_KEYS];
// Maps a JS state key to its real Supabase table name (Multi Plug tables use an mp_ prefix in the DB).
const TABLE_NAME = {
  mpCustomers: "mp_customers", mpSuppliers: "mp_suppliers", mpSalesmen: "mp_salesmen",
  mpProducts: "mp_products", mpPurchases: "mp_purchases", mpSales: "mp_sales",
  mpPayments: "mp_payments", mpSupplierPayments: "mp_supplier_payments",
};
const tableNameFor = (key) => TABLE_NAME[key] || key;

const TOKENS = {
  ink: "#16283D",
  inkSoft: "#22384F",
  paper: "#F7F4EA",
  paperCard: "#FFFFFF",
  rule: "#B23A2E",
  green: "#2F6B4F",
  gold: "#B8912F",
  slate: "#5B6472",
  slateLight: "#8B92A0",
  line: "#E4DFD1",
  dangerBg: "#FBEAE8",
  greenBg: "#E9F2ED",
};

const DARK = {
  ink: "#0E1A28",
  inkSoft: "#16283D",
  paper: "#1B2632",
  paperCard: "#22303F",
  rule: "#E27A6C",
  green: "#63B892",
  gold: "#E0B85B",
  slate: "#AAB3BF",
  slateLight: "#7C8794",
  line: "#33414F",
  dangerBg: "#3A2320",
  greenBg: "#1C332A",
};

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateDMY(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// recharts is a heavy library — only fetch it once a page that actually needs
// a chart is opened, instead of bundling it into the initial page load.
function useRecharts() {
  const [mod, setMod] = useState(null);
  useEffect(() => {
    let alive = true;
    import("recharts").then((m) => { if (alive) setMod(m); });
    return () => { alive = false; };
  }, []);
  return mod;
}

function ChartLoading({ T, height = 230 }) {
  return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: T.slateLight, fontSize: 12.5 }}>
      Loading chart…
    </div>
  );
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function ARLogo({ size = 34 }) {
  return (
    <img
      src="/arham-shield-logo.jpg"
      alt="Arham Traders"
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.35))" }}
    />
  );
}

function monthKey(iso) {
  return iso ? iso.slice(0, 7) : "";
}

const emptyDB = () => ({
  customers: [],
  sales: [],
  payments: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  supplierPayments: [],
  settings: { companyName: "Amber Trading Co.", openingCash: 50000, invoiceSeq: 1, purchaseInvoiceSeq: 1 },
  mpCustomers: [],
  mpSuppliers: [],
  mpSalesmen: [],
  mpProducts: [],
  mpPurchases: [],
  mpSales: [],
  mpPayments: [],
  mpSupplierPayments: [],
  mpSettings: { openingCash: 0, purchaseInvoiceSeq: 1, saleInvoiceSeq: 1, marginPercent: 40 },
});

async function fetchAllTables() {
  const results = await Promise.all(ALL_TABLE_KEYS.map((t) => supabase.from(tableNameFor(t)).select("*")));
  const errors = results.map((r) => r.error).filter(Boolean);
  if (errors.length) throw errors[0];
  const next = emptyDB();
  ALL_TABLE_KEYS.forEach((key, i) => { next[key] = results[i].data || []; });
  const settingsRes = await supabase.from("settings").select("*").eq("id", 1).single();
  if (settingsRes.data) {
    const { id, ...rest } = settingsRes.data;
    next.settings = { ...next.settings, ...rest };
  }
  const mpSettingsRes = await supabase.from("mp_settings").select("*").eq("id", 1).single();
  if (mpSettingsRes.data) {
    const { id, ...rest } = mpSettingsRes.data;
    next.mpSettings = { ...next.mpSettings, ...rest };
  }
  return next;
}

// Diffs prev vs next for each table and only pushes what actually changed to Supabase,
// instead of re-uploading the entire database on every save.
async function syncToSupabase(prev, next) {
  const jobs = [];
  for (const key of ALL_TABLE_KEYS) {
    const prevRows = prev[key] || [];
    const nextRows = next[key] || [];
    if (prevRows === nextRows) continue;
    const nextIds = new Set(nextRows.map((r) => r.id));
    const toDelete = prevRows.filter((r) => !nextIds.has(r.id)).map((r) => r.id);
    const toUpsert = nextRows.filter((r) => {
      const old = prevRows.find((p) => p.id === r.id);
      return !old || JSON.stringify(old) !== JSON.stringify(r);
    });
    const tableName = tableNameFor(key);
    if (toDelete.length) jobs.push(supabase.from(tableName).delete().in("id", toDelete));
    if (toUpsert.length) jobs.push(supabase.from(tableName).upsert(toUpsert));
  }
  if (prev.settings !== next.settings) {
    jobs.push(supabase.from("settings").upsert({ id: 1, ...next.settings }));
  }
  if (prev.mpSettings !== next.mpSettings) {
    jobs.push(supabase.from("mp_settings").upsert({ id: 1, ...next.mpSettings }));
  }
  const results = await Promise.all(jobs);
  const failed = results.find((r) => r && r.error);
  if (failed) throw failed.error;
}

function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [dark, setDark] = useState(false);
  const T = dark ? DARK : TOKENS;
  const [loaded, setLoaded] = useState(false);
  const [db, setDb] = useState(emptyDB());
  const [role, setRole] = useState(null); // 'admin' | 'customer'
  const [customerId, setCustomerId] = useState(null);
  const [view, setView] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const notify = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  };

  // On first load, if an admin session already exists (e.g. after a page refresh), restore it.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          const fullDb = await fetchAllTables();
          setDb(fullDb);
          setRole("admin");
        }
      } catch (e) {
        console.error("session restore failed", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (nextDb, prevDb) => {
    setSyncing(true);
    try {
      await syncToSupabase(prevDb, nextDb);
    } catch (e) {
      console.error("Supabase sync failed", e);
      notify("Could not save to the server — check your connection and try again.", "danger");
    } finally {
      setSyncing(false);
    }
  }, []);

  const updateDb = useCallback(
    (updater) => {
      setDb((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        persist(next, prev);
        return next;
      });
    },
    [persist]
  );

  // ---------- derived ----------
  const customerBalance = useCallback(
    (custId) => {
      const cust = db.customers.find((c) => c.id === custId);
      if (!cust) return 0;
      const sold = db.sales.filter((s) => s.customerId === custId).reduce((a, s) => a + Number(s.total), 0);
      const paid = db.payments.filter((p) => p.customerId === custId).reduce((a, p) => a + Number(p.amount), 0);
      return Number(cust.openingBalance || 0) + sold - paid;
    },
    [db]
  );

  const supplierBalance = useCallback(
    (supId) => {
      const sup = db.suppliers.find((s) => s.id === supId);
      if (!sup) return 0;
      const bought = db.purchases.filter((p) => p.supplierId === supId).reduce((a, p) => a + Number(p.total), 0);
      const paid = db.supplierPayments.filter((p) => p.supplierId === supId).reduce((a, p) => a + Number(p.amount), 0);
      return Number(sup.openingBalance || 0) + bought - paid;
    },
    [db]
  );

  const totals = useMemo(() => {
    const totalSales = db.sales.reduce((a, s) => a + Number(s.total), 0);
    const totalCollections = db.payments.reduce((a, p) => a + Number(p.amount), 0);
    const totalExpenses = db.expenses.reduce((a, e) => a + Number(e.amount), 0);
    const totalOutstanding = db.customers.reduce((a, c) => a + customerBalance(c.id), 0);
    const totalPurchases = db.purchases.reduce((a, p) => a + Number(p.total), 0);
    const totalSupplierPayments = db.supplierPayments.reduce((a, p) => a + Number(p.amount), 0);
    const totalPayable = db.suppliers.reduce((a, s) => a + supplierBalance(s.id), 0);
    const today = todayISO();
    const todaySales = db.sales.filter((s) => s.date === today).reduce((a, s) => a + Number(s.total), 0);
    const todayCollections = db.payments.filter((p) => p.date === today).reduce((a, p) => a + Number(p.amount), 0);
    const todayExpenses = db.expenses.filter((e) => e.date === today).reduce((a, e) => a + Number(e.amount), 0);
    const cashInHand = Number(db.settings.openingCash || 0) + totalCollections - totalExpenses - totalSupplierPayments;
    const netCashFlow = totalCollections - totalExpenses - totalSupplierPayments;
    const thisMonth = today.slice(0, 7);
    const monthSales = db.sales.filter((s) => monthKey(s.date) === thisMonth).reduce((a, s) => a + Number(s.total), 0);
    const monthExpenses = db.expenses.filter((e) => monthKey(e.date) === thisMonth).reduce((a, e) => a + Number(e.amount), 0);
    return {
      totalSales, totalCollections, totalExpenses, totalOutstanding,
      totalPurchases, totalSupplierPayments, totalPayable,
      todaySales, todayCollections, todayExpenses, cashInHand, netCashFlow,
      monthProfit: monthSales - monthExpenses,
    };
  }, [db, customerBalance, supplierBalance]);

  const mpCustomerBalance = useCallback(
    (custId) => {
      const cust = db.mpCustomers.find((c) => c.id === custId);
      if (!cust) return 0;
      const sold = db.mpSales.filter((s) => s.customerId === custId).reduce((a, s) => a + Number(s.total), 0);
      const paid = db.mpPayments.filter((p) => p.customerId === custId).reduce((a, p) => a + Number(p.amount), 0);
      return Number(cust.openingBalance || 0) + sold - paid;
    },
    [db]
  );

  const mpSupplierBalance = useCallback(
    (supId) => {
      const sup = db.mpSuppliers.find((s) => s.id === supId);
      if (!sup) return 0;
      const bought = db.mpPurchases.filter((p) => p.supplierId === supId).reduce((a, p) => a + Number(p.qty) * Number(p.dp), 0);
      const paid = db.mpSupplierPayments.filter((p) => p.supplierId === supId).reduce((a, p) => a + Number(p.amount), 0);
      return Number(sup.openingBalance || 0) + bought - paid;
    },
    [db]
  );

  // One row per product: total bought/sold, remaining stock, weighted-average DP,
  // auto TP (DP + your chosen margin %, set in Multi Plug Settings), and total DP/TP value in stock.
  const mpStockReport = useMemo(() => {
    const marginPercent = Number(db.mpSettings.marginPercent ?? 40);
    return db.mpProducts.map((prod) => {
      const purchases = db.mpPurchases.filter((p) => p.productId === prod.id);
      const sales = db.mpSales.filter((s) => s.productId === prod.id);
      const totalPurchasedQty = purchases.reduce((a, p) => a + Number(p.qty), 0);
      const totalSoldQty = sales.reduce((a, s) => a + Number(s.qty), 0);
      const remainingQty = totalPurchasedQty - totalSoldQty;
      const totalPurchaseValue = purchases.reduce((a, p) => a + Number(p.qty) * Number(p.dp), 0);
      const avgDP = totalPurchasedQty > 0 ? totalPurchaseValue / totalPurchasedQty : 0;
      const autoTP = avgDP * (1 + marginPercent / 100);
      const suppliers = Array.from(new Set(purchases.map((p) => {
        const sup = db.mpSuppliers.find((s) => s.id === p.supplierId);
        return sup ? sup.name : null;
      }).filter(Boolean)));
      return {
        productId: prod.id, productName: prod.name, suppliers,
        totalPurchasedQty, totalSoldQty, remainingQty,
        avgDP, autoTP,
        totalDPValue: remainingQty * avgDP,
        totalTPValue: remainingQty * autoTP,
      };
    });
  }, [db]);

  const mpTotals = useMemo(() => {
    const totalSales = db.mpSales.reduce((a, s) => a + Number(s.total), 0);
    const totalCollections = db.mpPayments.reduce((a, p) => a + Number(p.amount), 0);
    const totalPurchaseValue = db.mpPurchases.reduce((a, p) => a + Number(p.qty) * Number(p.dp), 0);
    const totalSupplierPayments = db.mpSupplierPayments.reduce((a, p) => a + Number(p.amount), 0);
    const totalPayable = db.mpSuppliers.reduce((a, s) => a + mpSupplierBalance(s.id), 0);
    const totalOutstanding = db.mpCustomers.reduce((a, c) => a + mpCustomerBalance(c.id), 0);
    const cashInHand = Number(db.mpSettings.openingCash || 0) + totalCollections - totalSupplierPayments;
    const totalStockDPValue = mpStockReport.reduce((a, r) => a + r.totalDPValue, 0);
    const totalStockTPValue = mpStockReport.reduce((a, r) => a + r.totalTPValue, 0);
    const totalCommission = db.mpSales.reduce((a, s) => {
      const sm = db.mpSalesmen.find((x) => x.id === s.salesmanId);
      const pct = sm ? Number(sm.commissionPercent || 10) : 10;
      return a + Number(s.total) * (pct / 100);
    }, 0);
    return {
      totalSales, totalCollections, totalPurchaseValue, totalSupplierPayments, totalPayable,
      totalOutstanding, cashInHand, totalStockDPValue, totalStockTPValue, totalCommission,
    };
  }, [db, mpSupplierBalance, mpCustomerBalance, mpStockReport]);

  const monthlyChartData = useMemo(() => {
    const map = {};
    const push = (iso, key, amt) => {
      const mk = monthKey(iso);
      if (!mk) return;
      if (!map[mk]) map[mk] = { month: mk, sales: 0, collections: 0, expenses: 0 };
      map[mk][key] += Number(amt);
    };
    db.sales.forEach((s) => push(s.date, "sales", s.total));
    db.payments.forEach((p) => push(p.date, "collections", p.amount));
    db.expenses.forEach((e) => push(e.date, "expenses", e.amount));
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [db]);

  const cashFlowSeries = useMemo(() => {
    const dates = new Set();
    db.payments.forEach((p) => dates.add(p.date));
    db.expenses.forEach((e) => dates.add(e.date));
    db.supplierPayments.forEach((p) => dates.add(p.date));
    const sorted = Array.from(dates).sort();
    let bal = Number(db.settings.openingCash || 0);
    return sorted.map((d) => {
      const inAmt = db.payments.filter((p) => p.date === d).reduce((a, p) => a + Number(p.amount), 0);
      const outAmt = db.expenses.filter((e) => e.date === d).reduce((a, e) => a + Number(e.amount), 0)
        + db.supplierPayments.filter((p) => p.date === d).reduce((a, p) => a + Number(p.amount), 0);
      bal = bal + inAmt - outAmt;
      return { date: fmtDateDMY(d), in: inAmt, out: outAmt, balance: bal };
    });
  }, [db]);

  const topCustomers = useMemo(() => {
    return db.customers
      .map((c) => ({ name: c.name, sales: db.sales.filter((s) => s.customerId === c.id).reduce((a, s) => a + Number(s.total), 0) }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 6);
  }, [db]);

  const outstandingCustomers = useMemo(() => {
    return db.customers
      .map((c) => ({ name: c.name, due: customerBalance(c.id) }))
      .filter((c) => c.due > 0)
      .sort((a, b) => b.due - a.due)
      .slice(0, 6);
  }, [db, customerBalance]);

  const nextInvoiceNo = () => `INV-${String(db.settings.invoiceSeq).padStart(4, "0")}`;

  // ---------- mutations ----------
  const saveCustomer = (data) => {
    updateDb((prev) => {
      const exists = prev.customers.some((c) => c.id === data.id);
      const customers = exists
        ? prev.customers.map((c) => (c.id === data.id ? data : c))
        : [...prev.customers, { ...data, id: uid("CUS") }];
      return { ...prev, customers };
    });
    notify(data.id && db.customers.some((c) => c.id === data.id) ? "Customer updated" : "Customer added");
  };

  const deleteCustomer = (id) => {
    updateDb((prev) => ({ ...prev, customers: prev.customers.filter((c) => c.id !== id) }));
    notify("Customer deleted", "danger");
  };

  const saveSale = (data) => {
    updateDb((prev) => {
      const exists = prev.sales.some((s) => s.id === data.id);
      let sales, settings = prev.settings, payments = prev.payments;
      const cashNow = Number(data.cashReceived || 0);
      if (exists) {
        sales = prev.sales.map((s) => (s.id === data.id ? data : s));
      } else {
        const invoiceNo = nextInvoiceNo();
        sales = [...prev.sales, { ...data, id: uid("SAL"), invoiceNo }];
        settings = { ...prev.settings, invoiceSeq: prev.settings.invoiceSeq + 1 };
        if (cashNow > 0) {
          payments = [...prev.payments, {
            id: uid("PAY"), date: data.date, customerId: data.customerId, amount: cashNow,
            method: "Cash", reference: invoiceNo, remarks: "Cash received at sale",
          }];
        }
      }
      return { ...prev, sales, payments, settings };
    });
    notify("Sale recorded — statement and due balance updated");
  };

  const deleteSale = (id) => {
    updateDb((prev) => ({ ...prev, sales: prev.sales.filter((s) => s.id !== id) }));
    notify("Sale entry removed", "danger");
  };

  const savePayment = (data) => {
    updateDb((prev) => {
      const exists = prev.payments.some((p) => p.id === data.id);
      const payments = exists
        ? prev.payments.map((p) => (p.id === data.id ? data : p))
        : [...prev.payments, { ...data, id: uid("PAY") }];
      return { ...prev, payments };
    });
    notify("Payment recorded — due balance and cash flow updated");
  };

  const deletePayment = (id) => {
    updateDb((prev) => ({ ...prev, payments: prev.payments.filter((p) => p.id !== id) }));
    notify("Payment removed", "danger");
  };

  const saveExpense = (data) => {
    updateDb((prev) => {
      const exists = prev.expenses.some((e) => e.id === data.id);
      const expenses = exists
        ? prev.expenses.map((e) => (e.id === data.id ? data : e))
        : [...prev.expenses, { ...data, id: uid("EXP") }];
      return { ...prev, expenses };
    });
    notify("Expense recorded — cash flow updated");
  };

  const deleteExpense = (id) => {
    updateDb((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) }));
    notify("Expense removed", "danger");
  };

  const nextPurchaseInvoiceNo = () => `PUR-${String(db.settings.purchaseInvoiceSeq).padStart(4, "0")}`;

  const saveSupplier = (data) => {
    updateDb((prev) => {
      const exists = prev.suppliers.some((s) => s.id === data.id);
      const suppliers = exists
        ? prev.suppliers.map((s) => (s.id === data.id ? data : s))
        : [...prev.suppliers, { ...data, id: uid("SUP") }];
      return { ...prev, suppliers };
    });
    notify("Supplier saved");
  };

  const deleteSupplier = (id) => {
    updateDb((prev) => ({ ...prev, suppliers: prev.suppliers.filter((s) => s.id !== id) }));
    notify("Supplier deleted", "danger");
  };

  const savePurchase = (data) => {
    updateDb((prev) => {
      const exists = prev.purchases.some((p) => p.id === data.id);
      let purchases, settings = prev.settings;
      if (exists) {
        purchases = prev.purchases.map((p) => (p.id === data.id ? data : p));
      } else {
        const invoiceNo = nextPurchaseInvoiceNo();
        purchases = [...prev.purchases, { ...data, id: uid("PUR"), invoiceNo }];
        settings = { ...prev.settings, purchaseInvoiceSeq: prev.settings.purchaseInvoiceSeq + 1 };
      }
      return { ...prev, purchases, settings };
    });
    notify("Purchase recorded — accounts payable updated");
  };

  const deletePurchase = (id) => {
    updateDb((prev) => ({ ...prev, purchases: prev.purchases.filter((p) => p.id !== id) }));
    notify("Purchase entry removed", "danger");
  };

  const saveSupplierPayment = (data) => {
    updateDb((prev) => {
      const exists = prev.supplierPayments.some((p) => p.id === data.id);
      const supplierPayments = exists
        ? prev.supplierPayments.map((p) => (p.id === data.id ? data : p))
        : [...prev.supplierPayments, { ...data, id: uid("SPAY") }];
      return { ...prev, supplierPayments };
    });
    notify("Payment to supplier recorded — payable and cash flow updated");
  };

  const deleteSupplierPayment = (id) => {
    updateDb((prev) => ({ ...prev, supplierPayments: prev.supplierPayments.filter((p) => p.id !== id) }));
    notify("Supplier payment removed", "danger");
  };

  const saveSettings = (data) => {
    updateDb((prev) => ({ ...prev, settings: { ...prev.settings, ...data } }));
    notify("Settings saved");
  };

  // ---------- Multi Plug module ----------
  // Generic helper: saves/updates a row in any mp_* collection by id.
  const mpSave = (key, prefix, data, msg) => {
    updateDb((prev) => {
      const list = prev[key];
      const exists = list.some((r) => r.id === data.id);
      const next = exists ? list.map((r) => (r.id === data.id ? data : r)) : [...list, { ...data, id: uid(prefix) }];
      return { ...prev, [key]: next };
    });
    notify(msg);
  };
  const mpDelete = (key, id, msg) => {
    updateDb((prev) => ({ ...prev, [key]: prev[key].filter((r) => r.id !== id) }));
    notify(msg, "danger");
  };

  const saveMpCustomer = (data) => mpSave("mpCustomers", "MPCUS", data, "Multi Plug customer saved");
  const deleteMpCustomer = (id) => mpDelete("mpCustomers", id, "Customer deleted");

  const saveMpSupplier = (data) => mpSave("mpSuppliers", "MPSUP", data, "Multi Plug supplier saved");
  const deleteMpSupplier = (id) => mpDelete("mpSuppliers", id, "Supplier deleted");

  const saveMpSalesman = (data) => mpSave("mpSalesmen", "MPSM", data, "Salesman saved");
  const deleteMpSalesman = (id) => mpDelete("mpSalesmen", id, "Salesman deleted");

  const saveMpProduct = (data) => mpSave("mpProducts", "MPPRD", data, "Product saved");
  const deleteMpProduct = (id) => mpDelete("mpProducts", id, "Product deleted");

  const nextMpPurchaseInvoiceNo = () => `MPP-${String(db.mpSettings.purchaseInvoiceSeq).padStart(4, "0")}`;
  const nextMpSaleInvoiceNo = () => `MPS-${String(db.mpSettings.saleInvoiceSeq).padStart(4, "0")}`;

  const saveMpPurchase = (data) => {
    updateDb((prev) => {
      const exists = prev.mpPurchases.some((p) => p.id === data.id);
      let mpPurchases, mpSettings = prev.mpSettings;
      if (exists) {
        mpPurchases = prev.mpPurchases.map((p) => (p.id === data.id ? data : p));
      } else {
        const invoiceNo = nextMpPurchaseInvoiceNo();
        mpPurchases = [...prev.mpPurchases, { ...data, id: uid("MPPUR"), invoiceNo }];
        mpSettings = { ...prev.mpSettings, purchaseInvoiceSeq: prev.mpSettings.purchaseInvoiceSeq + 1 };
      }
      return { ...prev, mpPurchases, mpSettings };
    });
    notify("Purchase recorded — stock updated");
  };
  const deleteMpPurchase = (id) => mpDelete("mpPurchases", id, "Purchase entry removed");

  const saveMpSale = (data) => {
    updateDb((prev) => {
      const exists = prev.mpSales.some((s) => s.id === data.id);
      let mpSales, mpSettings = prev.mpSettings;
      if (exists) {
        mpSales = prev.mpSales.map((s) => (s.id === data.id ? data : s));
      } else {
        const invoiceNo = nextMpSaleInvoiceNo();
        mpSales = [...prev.mpSales, { ...data, id: uid("MPSAL"), invoiceNo }];
        mpSettings = { ...prev.mpSettings, saleInvoiceSeq: prev.mpSettings.saleInvoiceSeq + 1 };
      }
      return { ...prev, mpSales, mpSettings };
    });
    notify("Sale recorded — stock and salesman commission updated");
  };
  const deleteMpSale = (id) => mpDelete("mpSales", id, "Sale entry removed");

  const saveMpPayment = (data) => mpSave("mpPayments", "MPPAY", data, "Payment recorded");
  const deleteMpPayment = (id) => mpDelete("mpPayments", id, "Payment removed");

  const saveMpSupplierPayment = (data) => mpSave("mpSupplierPayments", "MPSPAY", data, "Payment to supplier recorded");
  const deleteMpSupplierPayment = (id) => mpDelete("mpSupplierPayments", id, "Supplier payment removed");

  const saveMpSettings = (data) => {
    updateDb((prev) => ({ ...prev, mpSettings: { ...prev.mpSettings, ...data } }));
    notify("Multi Plug settings saved");
  };

  // ---------- auth ----------
  const loginAsAdmin = async (u, p) => {
    const { error } = await supabase.auth.signInWithPassword({ email: u, password: p });
    if (error) return false;
    try {
      const fullDb = await fetchAllTables();
      setDb(fullDb);
    } catch (e) {
      console.error("failed to load data after login", e);
    }
    setRole("admin");
    setView("dashboard");
    return true;
  };

  const loginAsCustomer = async (u, p) => {
    const { data, error } = await supabase.rpc("login_customer", { p_username: u, p_password: p });
    if (error || !data) return false;
    setDb({
      ...emptyDB(),
      customers: [data.customer],
      sales: data.sales || [],
      payments: data.payments || [],
    });
    setRole("customer");
    setCustomerId(data.customer.id);
    setView("profile");
    return true;
  };

  const logout = async () => {
    if (role === "admin") {
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
    }
    setRole(null);
    setCustomerId(null);
    setDb(emptyDB());
    setView("dashboard");
  };

  if (!loaded) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", background: T.paper, color: T.ink }}>
        Loading ledger...
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      backgroundColor: "#0E1A28",
      backgroundImage: `linear-gradient(rgba(10,18,28,${dark ? 0.72 : 0.42}), rgba(10,18,28,${dark ? 0.8 : 0.48})), url('/arham-bg.jpg')`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
      backgroundRepeat: "no-repeat",
      minHeight: "100vh", color: T.ink, transition: "background .2s", overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .lg-mono { font-family: 'IBM Plex Mono', monospace; }
        .lg-display { font-family: 'Fraunces', serif; }
        .lg-btn { cursor:pointer; border:none; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:6px; transition:opacity .15s; }
        .lg-btn:hover { opacity:.85; }
        .lg-input { width:100%; padding:8px 10px; border-radius:6px; border:1px solid ${T.line}; font-size:13px; background:${T.paperCard}; color:${T.ink}; box-sizing:border-box; }
        .lg-input:focus { outline:2px solid ${T.gold}; }
        table.lg-table { width:100%; border-collapse:collapse; font-size:13px; }
        table.lg-table th { text-align:left; padding:8px 10px; color:${T.slate}; font-weight:600; border-bottom:1px solid ${T.line}; white-space:nowrap; }
        table.lg-table td { padding:8px 10px; border-bottom:1px solid ${T.line}; }
        @keyframes pageFadeIn {
          0% { opacity: 0; transform: translateX(28px) scale(.97); filter: blur(4px); }
          60% { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
        }
        .page-transition { animation: pageFadeIn .5s cubic-bezier(.22,1,.36,1); transform-origin: left center; }
        @media print {
          .no-print { display:none !important; }
          .print-area { background:white !important; color:black !important; }
        }
      `}</style>

      {!role ? (
        <LoginScreen T={T} onAdmin={loginAsAdmin} onCustomer={loginAsCustomer} dark={dark} setDark={setDark} />
      ) : role === "admin" ? (
        <AdminShell
          T={T} dark={dark} setDark={setDark} view={view} setView={setView} logout={logout}
          db={db} totals={totals} monthlyChartData={monthlyChartData} cashFlowSeries={cashFlowSeries}
          topCustomers={topCustomers} outstandingCustomers={outstandingCustomers}
          customerBalance={customerBalance} nextInvoiceNo={nextInvoiceNo}
          supplierBalance={supplierBalance} nextPurchaseInvoiceNo={nextPurchaseInvoiceNo}
          saveCustomer={saveCustomer} deleteCustomer={deleteCustomer}
          saveSale={saveSale} deleteSale={deleteSale}
          savePayment={savePayment} deletePayment={deletePayment}
          saveExpense={saveExpense} deleteExpense={deleteExpense}
          saveSupplier={saveSupplier} deleteSupplier={deleteSupplier}
          savePurchase={savePurchase} deletePurchase={deletePurchase}
          saveSupplierPayment={saveSupplierPayment} deleteSupplierPayment={deleteSupplierPayment}
          saveSettings={saveSettings}
          mpTotals={mpTotals} mpStockReport={mpStockReport} mpCustomerBalance={mpCustomerBalance} mpSupplierBalance={mpSupplierBalance}
          nextMpPurchaseInvoiceNo={nextMpPurchaseInvoiceNo} nextMpSaleInvoiceNo={nextMpSaleInvoiceNo}
          saveMpCustomer={saveMpCustomer} deleteMpCustomer={deleteMpCustomer}
          saveMpSupplier={saveMpSupplier} deleteMpSupplier={deleteMpSupplier}
          saveMpSalesman={saveMpSalesman} deleteMpSalesman={deleteMpSalesman}
          saveMpProduct={saveMpProduct} deleteMpProduct={deleteMpProduct}
          saveMpPurchase={saveMpPurchase} deleteMpPurchase={deleteMpPurchase}
          saveMpSale={saveMpSale} deleteMpSale={deleteMpSale}
          saveMpPayment={saveMpPayment} deleteMpPayment={deleteMpPayment}
          saveMpSupplierPayment={saveMpSupplierPayment} deleteMpSupplierPayment={deleteMpSupplierPayment}
          saveMpSettings={saveMpSettings}
        />
      ) : (
        <CustomerShell
          T={T} dark={dark} setDark={setDark} view={view} setView={setView} logout={logout}
          db={db} customerId={customerId} customerBalance={customerBalance}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, background: toast.kind === "danger" ? T.rule : T.green,
          color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 50,
          boxShadow: "0 4px 12px rgba(0,0,0,.2)",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ================= LOGIN =================
function LoginScreen({ T, onAdmin, onCustomer, dark, setDark }) {
  const [mode, setMode] = useState("admin");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setSubmitting(true);
    try {
      const ok = mode === "admin" ? await onAdmin(u, p) : await onCustomer(u, p);
      if (!ok) setErr("Incorrect username or password.");
    } catch (e2) {
      setErr("Something went wrong — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: 560, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <ARLogo size={52} />
          </div>
          <div className="lg-display" style={{ fontSize: 26, fontWeight: 600, color: "#fff", letterSpacing: 0.5, textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>ARHAM TRADERS</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", marginTop: 6, textShadow: "0 1px 4px rgba(0,0,0,.5)" }}>462/2 Saheen Academy Road, Feni</div>
        </div>
        <div style={{ background: T.paperCard, border: `1px solid ${T.line}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 18, background: T.paper, borderRadius: 8, padding: 4 }}>
            {["admin", "customer"].map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setErr(""); }}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", background: mode === m ? T.ink : "transparent", color: mode === m ? "#fff" : T.slate,
                }}>
                {m === "admin" ? "Admin" : "Customer"}
              </button>
            ))}
          </div>
          <form onSubmit={submit}>
            <label style={{ fontSize: 12, color: T.slate, fontWeight: 600 }}>{mode === "admin" ? "Email" : "Username"}</label>
            <input className="lg-input" style={{ marginTop: 4, marginBottom: 14 }} value={u} onChange={(e) => setU(e.target.value)} placeholder={mode === "admin" ? "admin@example.com" : "e.g. rahim01"} />
            <label style={{ fontSize: 12, color: T.slate, fontWeight: 600 }}>Password</label>
            <input className="lg-input" type="password" style={{ marginTop: 4, marginBottom: 8 }} value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••" />
            {err && <div style={{ color: T.rule, fontSize: 12, marginBottom: 10 }}>{err}</div>}
            <button className="lg-btn" type="submit" disabled={submitting} style={{ width: "100%", background: T.ink, color: "#fff", justifyContent: "center", padding: "10px 0", marginTop: 6, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <button className="lg-btn" onClick={() => setDark(!dark)} style={{ margin: "18px auto 0", background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: 20, padding: "6px 14px" }}>
          {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? "Light mode" : "Dark mode"}
        </button>
      </div>
    </div>
  );
}

// ================= SHELL =================
function NavButton({ item, active, onClick, T }) {
  const [hover, setHover] = useState(false);
  const color = item.color || T.gold;
  const front = item.frontColor || "rgba(255,255,255,.72)";
  const bg = active ? color : hover ? hexToRgba(color, 0.22) : "transparent";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none",
        cursor: "pointer", fontSize: 13.5, fontWeight: 500, textAlign: "left",
        background: bg, transition: "background .15s, transform .15s",
        transform: hover && !active ? "scale(1.06)" : "scale(1)", transformOrigin: "left center",
        color: active ? "#fff" : hover ? "#fff" : front,
      }}>
      <item.icon size={16} /> {item.label}
    </button>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth <= 820 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 820);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

function SidebarInner({ T, dark, setDark, logout, title, navItems, view, setView, onNavigate }) {
  const [hoverToggle, setHoverToggle] = useState(false);
  const [hoverLogout, setHoverLogout] = useState(false);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 18px" }}>
        <ARLogo size={32} />
        <div>
          <div className="lg-display" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1 }}>ARHAM TRADERS</div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", marginTop: 2 }}>{title}</div>
        </div>
      </div>
      {navItems.map((item) => (
        <NavButton key={item.key} item={item} active={view === item.key} onClick={() => { setView(item.key); onNavigate && onNavigate(); }} T={T} />
      ))}
      <div style={{ flex: 1 }} />
      <button onClick={() => setDark(!dark)}
        onMouseEnter={() => setHoverToggle(true)} onMouseLeave={() => setHoverToggle(false)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, background: hoverToggle ? "rgba(255,255,255,.1)" : "transparent", color: "rgba(255,255,255,.6)", transition: "background .15s" }}>
        {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? "Light mode" : "Dark mode"}
      </button>
      <button onClick={logout}
        onMouseEnter={() => setHoverLogout(true)} onMouseLeave={() => setHoverLogout(false)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13.5, background: hoverLogout ? hexToRgba(T.rule, 0.25) : "transparent", color: "rgba(255,255,255,.75)", transition: "background .15s" }}>
        <LogOut size={16} /> Log out
      </button>
    </>
  );
}

function Shell({ T, dark, setDark, logout, title, navItems, view, setView, children }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isMobile) {
    return (
      <div style={{ minHeight: 600 }}>
        <div className="no-print" style={{
          position: "sticky", top: 0, zIndex: 30, background: T.ink, color: "#fff",
          display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        }}>
          <button onClick={() => setDrawerOpen(true)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
            <Menu size={22} />
          </button>
          <ARLogo size={28} />
          <div className="lg-display" style={{ fontSize: 14, fontWeight: 600 }}>ARHAM TRADERS</div>
        </div>

        {drawerOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
            <div onClick={() => setDrawerOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)" }} />
            <div style={{
              position: "relative", width: 240, maxWidth: "82vw", background: T.ink, color: "#fff",
              padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4, height: "100%", overflowY: "auto",
            }}>
              <button onClick={() => setDrawerOpen(false)} style={{ alignSelf: "flex-end", background: "transparent", border: "none", color: "#fff", cursor: "pointer", marginBottom: 6 }}>
                <X size={20} />
              </button>
              <SidebarInner T={T} dark={dark} setDark={setDark} logout={logout} title={title} navItems={navItems} view={view} setView={setView} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        <div style={{
          margin: 10, padding: 16, borderRadius: 14,
          background: hexToRgba(T.paper, 0.4), backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        }}>
          <div key={view} className="page-transition">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: 600 }}>
      <div className="no-print" style={{ width: 220, background: T.ink, color: "#fff", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
        <SidebarInner T={T} dark={dark} setDark={setDark} logout={logout} title={title} navItems={navItems} view={view} setView={setView} />
      </div>
      <div style={{
        flex: 1, minWidth: 0, padding: 24,
        background: hexToRgba(T.paper, 0.4), backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      }}>
        <div key={view} className="page-transition">{children}</div>
      </div>
    </div>
  );
}

function PageHeader({ T, title, subtitle, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div>
        <div className="lg-display" style={{ fontSize: 22, fontWeight: 600, color: T.ink }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: T.slate, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function Card({ T, children, style, ...rest }) {
  return <div style={{ background: T.paperCard, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18, ...style }} {...rest}>{children}</div>;
}

function StatCard({ T, label, value, sub, tone, accent }) {
  const [hover, setHover] = useState(false);
  const color = tone === "danger" ? T.rule : tone === "good" ? T.green : T.ink;
  const bg = accent ? hexToRgba(accent, hover ? 0.22 : 0.12) : T.paperCard;
  return (
    <Card T={T} style={{
      padding: 14, background: bg, borderColor: accent ? hexToRgba(accent, 0.35) : T.line,
      transform: hover ? "scale(1.05)" : "scale(1)", transition: "transform .15s, background .15s",
      cursor: "default",
    }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600, textTransform: "uppercase", letterSpacing: .3 }}>{label}</div>
      <div className="lg-mono" style={{ fontSize: 20, fontWeight: 600, color, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: T.slateLight, marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}

// ================= ADMIN =================
function AdminShell(props) {
  const { T, dark, setDark, view, setView, logout } = props;
  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, color: "#B8912F", frontColor: "#5FBFB0" },
    { key: "customers", label: "Customers", icon: Users, color: "#2F6B4F", frontColor: "#E0A458" },
    { key: "sales", label: "Sales entry", icon: PackagePlus, color: "#3B6EA5", frontColor: "#E08B76" },
    { key: "payments", label: "Cash Receiving", icon: Banknote, color: "#6B4C9A", frontColor: "#8FCF8F" },
    { key: "suppliers", label: "Suppliers", icon: Truck, color: "#8A5A2B", frontColor: "#8AD6C9" },
    { key: "purchases", label: "Purchase entry", icon: Building2, color: "#3B6EA5", frontColor: "#E0B463" },
    { key: "supplierPayments", label: "Payments", icon: CreditCard, color: "#A34C6B", frontColor: "#7FD1E0" },
    { key: "expenses", label: "Expenses", icon: Receipt, color: "#B23A2E", frontColor: "#8FC1E8" },
    { key: "cashflow", label: "Cash flow", icon: TrendingUp, color: "#2E8B8B", frontColor: "#E29BD1" },
    { key: "reports", label: "Reports", icon: FileBarChart, color: "#4C5B8A", frontColor: "#F0C96B" },
    { key: "multiplug", label: "Multi Plug", icon: Plug, color: "#1F7A5C", frontColor: "#F0A868" },
    { key: "settings", label: "Settings", icon: Settings, color: "#7A7A7A", frontColor: "#A8E6D9" },
  ];
  return (
    <Shell T={T} dark={dark} setDark={setDark} logout={logout} title="Admin" navItems={navItems} view={view} setView={setView}>
      {view === "dashboard" && <AdminDashboard {...props} />}
      {view === "customers" && <CustomersPage {...props} />}
      {view === "sales" && <SalesPage {...props} />}
      {view === "payments" && <PaymentsPage {...props} />}
      {view === "suppliers" && <SuppliersPage {...props} />}
      {view === "purchases" && <PurchasesPage {...props} />}
      {view === "supplierPayments" && <SupplierPaymentsPage {...props} />}
      {view === "expenses" && <ExpensesPage {...props} />}
      {view === "cashflow" && <CashFlowPage {...props} />}
      {view === "reports" && <ReportsPage {...props} />}
      {view === "multiplug" && <MultiPlugPage {...props} />}
      {view === "settings" && <SettingsPage {...props} />}
    </Shell>
  );
}

function AdminDashboard({ T, db, totals, monthlyChartData, cashFlowSeries, topCustomers, outstandingCustomers, mpTotals }) {
  const RC = useRecharts();
  const cards = [
    { label: "Total customers", value: db.customers.length, tone: "", accent: "#B8912F" },
    { label: "Total sales", value: fmtMoney(totals.totalSales), tone: "", accent: "#3B6EA5" },
    { label: "Total collections", value: fmtMoney(totals.totalCollections), tone: "good", accent: "#2F6B4F" },
    { label: "Total outstanding", value: fmtMoney(totals.totalOutstanding), tone: "danger", accent: "#B23A2E" },
    { label: "Today's sales", value: fmtMoney(totals.todaySales), tone: "", accent: "#6B4C9A" },
    { label: "Today's collections", value: fmtMoney(totals.todayCollections), tone: "good", accent: "#2E8B8B" },
    { label: "Today's expenses", value: fmtMoney(totals.todayExpenses), tone: "danger", accent: "#C1663B" },
    { label: "Cash in hand", value: fmtMoney(totals.cashInHand), tone: "", accent: "#4C5B8A" },
    { label: "Net cash flow", value: fmtMoney(totals.netCashFlow), tone: totals.netCashFlow >= 0 ? "good" : "danger", accent: "#A34C6B" },
    { label: "Monthly profit / loss", value: fmtMoney(totals.monthProfit), tone: totals.monthProfit >= 0 ? "good" : "danger", accent: "#1F7A5C" },
    { label: "Accounts payable", value: fmtMoney(totals.totalPayable), tone: totals.totalPayable > 0 ? "danger" : "", accent: "#8A5A2B" },
    { label: "Multi Plug — cash in hand", value: fmtMoney(mpTotals.cashInHand), tone: "", accent: "#1F7A5C" },
  ];
  return (
    <div>
      <PageHeader T={T} title="Dashboard" subtitle={`All figures in ${CUR}`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
        {cards.map((c) => <StatCard key={c.label} T={T} {...c} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card T={T}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Monthly sales, collections &amp; expenses</div>
          {!RC ? <ChartLoading T={T} /> : (
            <RC.ResponsiveContainer width="100%" height={230}>
              <RC.BarChart data={monthlyChartData}>
                <RC.CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                <RC.XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <RC.YAxis tick={{ fontSize: 11 }} />
                <RC.Tooltip />
                <RC.Legend wrapperStyle={{ fontSize: 12 }} />
                <RC.Bar dataKey="sales" fill={T.gold} name="Sales" />
                <RC.Bar dataKey="collections" fill={T.green} name="Collections" />
                <RC.Bar dataKey="expenses" fill={T.rule} name="Expenses" />
              </RC.BarChart>
            </RC.ResponsiveContainer>
          )}
        </Card>
        <Card T={T}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Cash flow</div>
          {!RC ? <ChartLoading T={T} /> : (
            <RC.ResponsiveContainer width="100%" height={230}>
              <RC.LineChart data={cashFlowSeries}>
                <RC.CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                <RC.XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <RC.YAxis tick={{ fontSize: 11 }} />
                <RC.Tooltip />
                <RC.Line type="monotone" dataKey="balance" stroke={T.ink} strokeWidth={2} dot={false} name="Cash balance" />
              </RC.LineChart>
            </RC.ResponsiveContainer>
          )}
        </Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card T={T}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top customers by sales</div>
          {!RC ? <ChartLoading T={T} height={200} /> : (
            <RC.ResponsiveContainer width="100%" height={200}>
              <RC.BarChart data={topCustomers} layout="vertical">
                <RC.XAxis type="number" tick={{ fontSize: 11 }} />
                <RC.YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <RC.Tooltip />
                <RC.Bar dataKey="sales" fill={T.gold} />
              </RC.BarChart>
            </RC.ResponsiveContainer>
          )}
        </Card>
        <Card T={T}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Outstanding customers</div>
          {!RC ? <ChartLoading T={T} height={200} /> : (
            <RC.ResponsiveContainer width="100%" height={200}>
              <RC.BarChart data={outstandingCustomers} layout="vertical">
                <RC.XAxis type="number" tick={{ fontSize: 11 }} />
                <RC.YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <RC.Tooltip />
                <RC.Bar dataKey="due" fill={T.rule} />
              </RC.BarChart>
            </RC.ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

function CustomersPage({ T, db, saveCustomer, deleteCustomer, customerBalance }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modal, setModal] = useState(null); // customer obj or {} for new, null closed
  const [confirmDel, setConfirmDel] = useState(null);
  const [statementId, setStatementId] = useState(null);

  const filtered = db.customers.filter((c) => {
    const matchQ = !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.mobile.includes(q);
    const matchStatus = statusFilter === "All" || c.status === statusFilter;
    return matchQ && matchStatus;
  });
  const totalBalance = db.customers.reduce((a, c) => a + customerBalance(c.id), 0);

  return (
    <div>
      <PageHeader T={T} title="Retail customers" subtitle={`${db.customers.length} total — click a name to open their statement`}
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})}><Plus size={14} /> Add customer</button>} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.slateLight }} />
          <input className="lg-input" style={{ paddingLeft: 30 }} placeholder="Search name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="lg-input" style={{ width: 140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option>All</option><option>Active</option><option>Inactive</option>
        </select>
      </div>
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Company</th><th>Status</th><th>Balance</th><th></th></tr></thead>
          <tbody>
            {filtered.map((c) => {
              const bal = customerBalance(c.id);
              return (
                <tr key={c.id}>
                  <td className="lg-mono" style={{ fontSize: 11.5, color: T.slate }}>{c.id}</td>
                  <td>
                    <button onClick={() => setStatementId(c.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontWeight: 600, color: T.ink, textDecoration: "underline", textDecorationColor: T.line, fontSize: 13 }}>
                      {c.name}
                    </button>
                  </td>
                  <td className="lg-mono">{c.mobile}</td>
                  <td>{c.company || "—"}</td>
                  <td><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: c.status === "Active" ? T.greenBg : T.dangerBg, color: c.status === "Active" ? T.green : T.rule, fontWeight: 600 }}>{c.status}</span></td>
                  <td className="lg-mono" style={{ color: bal > 0 ? T.rule : T.green, fontWeight: 600 }}>{fmtMoney(bal)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setModal(c)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(c)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No customers found.</td></tr>}
          </tbody>
          {!!db.customers.length && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: "right", fontWeight: 600, fontSize: 12.5, color: T.slate, borderTop: `2px solid ${T.line}` }}>Total balance (all customers)</td>
                <td className="lg-mono" style={{ fontWeight: 700, fontSize: 14, color: totalBalance > 0 ? T.rule : T.green, borderTop: `2px solid ${T.line}` }}>{fmtMoney(totalBalance)}</td>
                <td style={{ borderTop: `2px solid ${T.line}` }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {modal && <CustomerModal T={T} initial={modal} onClose={() => setModal(null)} onSave={(d) => { saveCustomer(d); setModal(null); }} />}
      {confirmDel && (
        <ConfirmModal T={T} title="Delete customer?" message={`This removes ${confirmDel.name} and cannot be undone.`}
          onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteCustomer(confirmDel.id); setConfirmDel(null); }} />
      )}
      {statementId && <StatementModal T={T} db={db} kind="customer" id={statementId} onClose={() => setStatementId(null)} />}
    </div>
  );
}

function CustomerModal({ T, initial, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial.id, name: initial.name || "", mobile: initial.mobile || "", email: initial.email || "",
    address: initial.address || "", company: initial.company || "", openingBalance: initial.openingBalance || 0,
    status: initial.status || "Active", username: initial.username || "", password: initial.password || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <ModalShell T={T} title={initial.id ? "Edit customer" : "Add customer"} onClose={onClose}>
      <Field T={T} label="Customer name"><input className="lg-input" value={f.name} onChange={set("name")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Mobile number"><input className="lg-input" value={f.mobile} onChange={set("mobile")} /></Field>
        <Field T={T} label="Email"><input className="lg-input" value={f.email} onChange={set("email")} /></Field>
      </div>
      <Field T={T} label="Address"><input className="lg-input" value={f.address} onChange={set("address")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Company (optional)"><input className="lg-input" value={f.company} onChange={set("company")} /></Field>
        <Field T={T} label="Opening balance"><input className="lg-input" type="number" value={f.openingBalance} onChange={set("openingBalance")} /></Field>
      </div>
      <Field T={T} label="Status">
        <select className="lg-input" value={f.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Login username"><input className="lg-input" value={f.username} onChange={set("username")} /></Field>
        <Field T={T} label="Login password"><input className="lg-input" value={f.password} onChange={set("password")} /></Field>
      </div>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        onClick={() => f.name && f.username && onSave(f)}>Save customer</button>
    </ModalShell>
  );
}

function SalesPage({ T, db, saveSale, deleteSale, nextInvoiceNo }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.sales].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Product delivery / sales entry" subtitle="Every sale updates the customer statement, due balance and dashboard automatically"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})}><Plus size={14} /> New sale</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Product</th><th>Qty</th><th>Unit price</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {rows.map((s) => {
              const cust = db.customers.find((c) => c.id === s.customerId);
              return (
                <tr key={s.id}>
                  <td className="lg-mono">{s.invoiceNo}</td>
                  <td className="lg-mono">{fmtDateDMY(s.date)}</td>
                  <td>{cust ? cust.name : "—"}</td>
                  <td>{s.productName}</td>
                  <td className="lg-mono">{s.qty} {s.unit}</td>
                  <td className="lg-mono">{fmtMoney(s.unitPrice)}</td>
                  <td className="lg-mono" style={{ fontWeight: 600 }}>{fmtMoney(s.total)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setModal(s)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(s)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No sales recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && <SaleModal T={T} db={db} initial={modal} nextInvoiceNo={nextInvoiceNo} onClose={() => setModal(null)} onSave={(d) => { saveSale(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete sale?" message="This will reduce the customer's due balance." onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteSale(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function SaleModal({ T, db, initial, nextInvoiceNo, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial.id, date: initial.date || todayISO(), customerId: initial.customerId || (db.customers[0]?.id || ""),
    productName: initial.productName || "", description: initial.description || "", qty: initial.qty || 1,
    unit: initial.unit || "pcs", unitPrice: initial.unitPrice || 0, remarks: initial.remarks || "",
    cashReceived: initial.cashReceived || 0,
  });
  const total = (Number(f.qty) || 0) * (Number(f.unitPrice) || 0);
  const cashReceived = Math.min(Number(f.cashReceived) || 0, total);
  const balanceDue = Math.max(total - cashReceived, 0);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <ModalShell T={T} title={initial.id ? "Edit sale" : "New sale entry"} onClose={onClose}>
      <div style={{ fontSize: 11.5, color: T.slateLight, marginBottom: 8 }}>Invoice: <span className="lg-mono">{initial.invoiceNo || nextInvoiceNo()}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field T={T} label="Customer">
          <select className="lg-input" value={f.customerId} onChange={set("customerId")}>
            {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field T={T} label="Product name"><input className="lg-input" value={f.productName} onChange={set("productName")} /></Field>
      <Field T={T} label="Description"><input className="lg-input" value={f.description} onChange={set("description")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field T={T} label="Quantity"><input className="lg-input" type="number" value={f.qty} onChange={set("qty")} /></Field>
        <Field T={T} label="Unit"><input className="lg-input" value={f.unit} onChange={set("unit")} /></Field>
        <Field T={T} label="Unit price"><input className="lg-input" type="number" value={f.unitPrice} onChange={set("unitPrice")} /></Field>
      </div>
      <Field T={T} label="Remarks"><input className="lg-input" value={f.remarks} onChange={set("remarks")} /></Field>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0" }}>
        <span style={{ fontSize: 13, color: T.slate }}>Total amount</span>
        <span className="lg-mono" style={{ fontSize: 18, fontWeight: 600 }}>{fmtMoney(total)}</span>
      </div>
      {!initial.id && (
        <Field T={T} label="Cash received now (leave 0 if fully on credit)">
          <input className="lg-input" type="number" value={f.cashReceived} onChange={set("cashReceived")} placeholder="0" />
        </Field>
      )}
      {!initial.id && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 12px", padding: "8px 10px", background: hexToRgba(balanceDue > 0 ? T.rule : T.green, 0.1), borderRadius: 8 }}>
          <span style={{ fontSize: 12.5, color: T.slate }}>{balanceDue > 0 ? "Remaining balance (added to due)" : "Fully paid — balance will be zero"}</span>
          <span className="lg-mono" style={{ fontSize: 15, fontWeight: 600, color: balanceDue > 0 ? T.rule : T.green }}>{fmtMoney(balanceDue)}</span>
        </div>
      )}
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center" }}
        disabled={!f.customerId || !f.productName}
        onClick={() => onSave({ ...f, qty: Number(f.qty), unitPrice: Number(f.unitPrice), total, cashReceived: initial.id ? undefined : cashReceived })}>Save sale</button>
    </ModalShell>
  );
}

function PaymentsPage({ T, db, savePayment, deletePayment }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.payments].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Cash receiving" subtitle="Record any money received from a customer — downpayment, full payment, or an installment. This reduces the due balance and increases cash in hand"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})}><Plus size={14} /> New payment</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th>Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const cust = db.customers.find((c) => c.id === p.customerId);
              return (
                <tr key={p.id}>
                  <td className="lg-mono">{fmtDateDMY(p.date)}</td>
                  <td>{cust ? cust.name : "—"}</td>
                  <td className="lg-mono" style={{ color: T.green, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                  <td>{p.method}</td>
                  <td className="lg-mono">{p.reference || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setModal(p)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(p)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && <PaymentModal T={T} db={db} initial={modal} onClose={() => setModal(null)} onSave={(d) => { savePayment(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete payment?" message="This will increase the customer's due balance." onCancel={() => setConfirmDel(null)} onConfirm={() => { deletePayment(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function PaymentModal({ T, db, initial, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial.id, date: initial.date || todayISO(), customerId: initial.customerId || (db.customers[0]?.id || ""),
    amount: initial.amount || 0, method: initial.method || "Cash", reference: initial.reference || "", remarks: initial.remarks || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <ModalShell T={T} title={initial.id ? "Edit payment" : "New payment"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field T={T} label="Customer">
          <select className="lg-input" value={f.customerId} onChange={set("customerId")}>
            {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Payment amount"><input className="lg-input" type="number" value={f.amount} onChange={set("amount")} /></Field>
        <Field T={T} label="Payment method">
          <select className="lg-input" value={f.method} onChange={set("method")}>
            <option>Cash</option><option>Bank</option><option>Mobile Banking</option><option>Cheque</option>
          </select>
        </Field>
      </div>
      <Field T={T} label="Reference number"><input className="lg-input" value={f.reference} onChange={set("reference")} /></Field>
      <Field T={T} label="Remarks"><input className="lg-input" value={f.remarks} onChange={set("remarks")} /></Field>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        disabled={!f.customerId || !f.amount}
        onClick={() => onSave({ ...f, amount: Number(f.amount) })}>Save payment</button>
    </ModalShell>
  );
}

const EXPENSE_CATS = ["Office Expense", "Transport", "Salary", "Electricity", "Internet", "Marketing", "Maintenance", "Other"];

function ExpensesPage({ T, db, saveExpense, deleteExpense }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Expenses" subtitle="Every expense reduces cash in hand and appears in the expense report"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})}><Plus size={14} /> New expense</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Method</th><th>Description</th><th></th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="lg-mono">{fmtDateDMY(e.date)}</td>
                <td>{e.category}</td>
                <td className="lg-mono" style={{ color: T.rule, fontWeight: 600 }}>{fmtMoney(e.amount)}</td>
                <td>{e.method}</td>
                <td>{e.description}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button onClick={() => setModal(e)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                  <button onClick={() => setConfirmDel(e)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No expenses recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && <ExpenseModal T={T} initial={modal} onClose={() => setModal(null)} onSave={(d) => { saveExpense(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete expense?" message="This will increase cash in hand." onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteExpense(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function ExpenseModal({ T, initial, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial.id, date: initial.date || todayISO(), category: initial.category || EXPENSE_CATS[0],
    amount: initial.amount || 0, description: initial.description || "", method: initial.method || "Cash", remarks: initial.remarks || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <ModalShell T={T} title={initial.id ? "Edit expense" : "New expense"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field T={T} label="Category">
          <select className="lg-input" value={f.category} onChange={set("category")}>
            {EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Amount"><input className="lg-input" type="number" value={f.amount} onChange={set("amount")} /></Field>
        <Field T={T} label="Payment method">
          <select className="lg-input" value={f.method} onChange={set("method")}>
            <option>Cash</option><option>Bank</option><option>Mobile Banking</option><option>Cheque</option>
          </select>
        </Field>
      </div>
      <Field T={T} label="Description"><input className="lg-input" value={f.description} onChange={set("description")} /></Field>
      <Field T={T} label="Remarks"><input className="lg-input" value={f.remarks} onChange={set("remarks")} /></Field>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        disabled={!f.amount}
        onClick={() => onSave({ ...f, amount: Number(f.amount) })}>Save expense</button>
    </ModalShell>
  );
}

// ================= SUPPLIERS / PURCHASES / SUPPLIER PAYMENTS =================
function SuppliersPage({ T, db, saveSupplier, deleteSupplier, supplierBalance }) {
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [statementId, setStatementId] = useState(null);
  const filtered = db.suppliers.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.mobile || "").includes(q));
  const totalPayable = db.suppliers.reduce((a, s) => a + supplierBalance(s.id), 0);
  return (
    <div>
      <PageHeader T={T} title="Suppliers" subtitle={`${db.suppliers.length} total — click a name to open their statement`}
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})}><Plus size={14} /> Add supplier</button>} />
      <div style={{ position: "relative", maxWidth: 300, marginBottom: 14 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.slateLight }} />
        <input className="lg-input" style={{ paddingLeft: 30 }} placeholder="Search name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Company</th><th>Status</th><th>Payable</th><th></th></tr></thead>
          <tbody>
            {filtered.map((s) => {
              const bal = supplierBalance(s.id);
              return (
                <tr key={s.id}>
                  <td className="lg-mono" style={{ fontSize: 11.5, color: T.slate }}>{s.id}</td>
                  <td>
                    <button onClick={() => setStatementId(s.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontWeight: 600, color: T.ink, textDecoration: "underline", textDecorationColor: T.line, fontSize: 13 }}>
                      {s.name}
                    </button>
                  </td>
                  <td className="lg-mono">{s.mobile}</td>
                  <td>{s.company || "—"}</td>
                  <td><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: s.status === "Active" ? T.greenBg : T.dangerBg, color: s.status === "Active" ? T.green : T.rule, fontWeight: 600 }}>{s.status}</span></td>
                  <td className="lg-mono" style={{ color: bal > 0 ? T.rule : T.green, fontWeight: 600 }}>{fmtMoney(bal)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setModal(s)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(s)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No suppliers added yet.</td></tr>}
          </tbody>
          {!!db.suppliers.length && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: "right", fontWeight: 600, fontSize: 12.5, color: T.slate, borderTop: `2px solid ${T.line}` }}>Total payable (all suppliers)</td>
                <td className="lg-mono" style={{ fontWeight: 700, fontSize: 14, color: totalPayable > 0 ? T.rule : T.green, borderTop: `2px solid ${T.line}` }}>{fmtMoney(totalPayable)}</td>
                <td style={{ borderTop: `2px solid ${T.line}` }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
      {modal && <SupplierModal T={T} initial={modal} onClose={() => setModal(null)} onSave={(d) => { saveSupplier(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete supplier?" message={`This removes ${confirmDel.name} and cannot be undone.`} onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteSupplier(confirmDel.id); setConfirmDel(null); }} />}
      {statementId && <StatementModal T={T} db={db} kind="supplier" id={statementId} onClose={() => setStatementId(null)} />}
    </div>
  );
}

function SupplierModal({ T, initial, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial.id, name: initial.name || "", mobile: initial.mobile || "", email: initial.email || "",
    address: initial.address || "", company: initial.company || "", openingBalance: initial.openingBalance || 0,
    status: initial.status || "Active",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <ModalShell T={T} title={initial.id ? "Edit supplier" : "Add supplier"} onClose={onClose}>
      <Field T={T} label="Supplier / company name"><input className="lg-input" value={f.name} onChange={set("name")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Mobile number"><input className="lg-input" value={f.mobile} onChange={set("mobile")} /></Field>
        <Field T={T} label="Email"><input className="lg-input" value={f.email} onChange={set("email")} /></Field>
      </div>
      <Field T={T} label="Address"><input className="lg-input" value={f.address} onChange={set("address")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Company (optional)"><input className="lg-input" value={f.company} onChange={set("company")} /></Field>
        <Field T={T} label="Opening balance (amount you already owe)"><input className="lg-input" type="number" value={f.openingBalance} onChange={set("openingBalance")} /></Field>
      </div>
      <Field T={T} label="Status">
        <select className="lg-input" value={f.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select>
      </Field>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        onClick={() => f.name && onSave(f)}>Save supplier</button>
    </ModalShell>
  );
}

function PurchasesPage({ T, db, savePurchase, deletePurchase, nextPurchaseInvoiceNo }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.purchases].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Purchase entry" subtitle="Stock bought from a supplier — this increases accounts payable (money you owe them)"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})} disabled={!db.suppliers.length}><Plus size={14} /> New purchase</button>} />
      {!db.suppliers.length && <div style={{ fontSize: 12.5, color: T.slateLight, marginBottom: 12 }}>Add a supplier first before recording a purchase.</div>}
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Supplier</th><th>Product</th><th>Qty</th><th>Unit price</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const sup = db.suppliers.find((s) => s.id === p.supplierId);
              return (
                <tr key={p.id}>
                  <td className="lg-mono">{p.invoiceNo}</td>
                  <td className="lg-mono">{fmtDateDMY(p.date)}</td>
                  <td>{sup ? sup.name : "—"}</td>
                  <td>{p.productName}</td>
                  <td className="lg-mono">{p.qty} {p.unit}</td>
                  <td className="lg-mono">{fmtMoney(p.unitPrice)}</td>
                  <td className="lg-mono" style={{ fontWeight: 600 }}>{fmtMoney(p.total)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setModal(p)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(p)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No purchases recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && <PurchaseModal T={T} db={db} initial={modal} nextPurchaseInvoiceNo={nextPurchaseInvoiceNo} onClose={() => setModal(null)} onSave={(d) => { savePurchase(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete purchase?" message="This will reduce the amount owed to this supplier." onCancel={() => setConfirmDel(null)} onConfirm={() => { deletePurchase(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function PurchaseModal({ T, db, initial, nextPurchaseInvoiceNo, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial.id, date: initial.date || todayISO(), supplierId: initial.supplierId || (db.suppliers[0]?.id || ""),
    productName: initial.productName || "", description: initial.description || "", qty: initial.qty || 1,
    unit: initial.unit || "pcs", unitPrice: initial.unitPrice || 0, remarks: initial.remarks || "",
  });
  const total = (Number(f.qty) || 0) * (Number(f.unitPrice) || 0);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <ModalShell T={T} title={initial.id ? "Edit purchase" : "New purchase entry"} onClose={onClose}>
      <div style={{ fontSize: 11.5, color: T.slateLight, marginBottom: 8 }}>Invoice: <span className="lg-mono">{initial.invoiceNo || nextPurchaseInvoiceNo()}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field T={T} label="Supplier">
          <select className="lg-input" value={f.supplierId} onChange={set("supplierId")}>
            {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field T={T} label="Product name"><input className="lg-input" value={f.productName} onChange={set("productName")} /></Field>
      <Field T={T} label="Description"><input className="lg-input" value={f.description} onChange={set("description")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field T={T} label="Quantity"><input className="lg-input" type="number" value={f.qty} onChange={set("qty")} /></Field>
        <Field T={T} label="Unit"><input className="lg-input" value={f.unit} onChange={set("unit")} /></Field>
        <Field T={T} label="Unit price"><input className="lg-input" type="number" value={f.unitPrice} onChange={set("unitPrice")} /></Field>
      </div>
      <Field T={T} label="Remarks"><input className="lg-input" value={f.remarks} onChange={set("remarks")} /></Field>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0" }}>
        <span style={{ fontSize: 13, color: T.slate }}>Total amount</span>
        <span className="lg-mono" style={{ fontSize: 18, fontWeight: 600 }}>{fmtMoney(total)}</span>
      </div>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center" }}
        disabled={!f.supplierId || !f.productName}
        onClick={() => onSave({ ...f, qty: Number(f.qty), unitPrice: Number(f.unitPrice), total })}>Save purchase</button>
    </ModalShell>
  );
}

function SupplierPaymentsPage({ T, db, saveSupplierPayment, deleteSupplierPayment }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.supplierPayments].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Payments to suppliers" subtitle="Money you pay out to a supplier — this reduces accounts payable and cash in hand"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})} disabled={!db.suppliers.length}><Plus size={14} /> New payment</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th>Supplier</th><th>Amount</th><th>Method</th><th>Reference</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const sup = db.suppliers.find((s) => s.id === p.supplierId);
              return (
                <tr key={p.id}>
                  <td className="lg-mono">{fmtDateDMY(p.date)}</td>
                  <td>{sup ? sup.name : "—"}</td>
                  <td className="lg-mono" style={{ color: T.rule, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                  <td>{p.method}</td>
                  <td className="lg-mono">{p.reference || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setModal(p)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(p)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No payments to suppliers recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && <SupplierPaymentModal T={T} db={db} initial={modal} onClose={() => setModal(null)} onSave={(d) => { saveSupplierPayment(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete payment?" message="This will increase the amount owed to this supplier." onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteSupplierPayment(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function SupplierPaymentModal({ T, db, initial, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial.id, date: initial.date || todayISO(), supplierId: initial.supplierId || (db.suppliers[0]?.id || ""),
    amount: initial.amount || 0, method: initial.method || "Cash", reference: initial.reference || "", remarks: initial.remarks || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <ModalShell T={T} title={initial.id ? "Edit payment" : "New payment to supplier"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field T={T} label="Supplier">
          <select className="lg-input" value={f.supplierId} onChange={set("supplierId")}>
            {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Amount paid"><input className="lg-input" type="number" value={f.amount} onChange={set("amount")} /></Field>
        <Field T={T} label="Payment method">
          <select className="lg-input" value={f.method} onChange={set("method")}>
            <option>Cash</option><option>Bank</option><option>Mobile Banking</option><option>Cheque</option>
          </select>
        </Field>
      </div>
      <Field T={T} label="Reference number"><input className="lg-input" value={f.reference} onChange={set("reference")} /></Field>
      <Field T={T} label="Remarks"><input className="lg-input" value={f.remarks} onChange={set("remarks")} /></Field>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        disabled={!f.supplierId || !f.amount}
        onClick={() => onSave({ ...f, amount: Number(f.amount) })}>Save payment</button>
    </ModalShell>
  );
}

function buildStatementRows(db, customerId) {
  const cust = db.customers.find((c) => c.id === customerId);
  if (!cust) return { rows: [], opening: 0, closing: 0 };
  const sales = db.sales.filter((s) => s.customerId === customerId).map((s) => ({
    date: s.date, type: "Sale", invoiceNo: s.invoiceNo, description: s.productName, debit: Number(s.total), credit: 0,
  }));
  const payments = db.payments.filter((p) => p.customerId === customerId).map((p) => ({
    date: p.date, type: "Payment", invoiceNo: p.reference || "—", description: `${p.method} payment`, debit: 0, credit: Number(p.amount),
  }));
  const merged = [...sales, ...payments].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let bal = Number(cust.openingBalance || 0);
  const rows = merged.map((r) => {
    bal = bal + r.debit - r.credit;
    return { ...r, balance: bal };
  });
  return { rows, opening: Number(cust.openingBalance || 0), closing: bal };
}

function buildSupplierStatementRows(db, supplierId) {
  const sup = db.suppliers.find((s) => s.id === supplierId);
  if (!sup) return { rows: [], opening: 0, closing: 0 };
  const purchases = db.purchases.filter((p) => p.supplierId === supplierId).map((p) => ({
    date: p.date, type: "Purchase", invoiceNo: p.invoiceNo, description: p.productName, debit: Number(p.total), credit: 0,
  }));
  const payments = db.supplierPayments.filter((p) => p.supplierId === supplierId).map((p) => ({
    date: p.date, type: "Payment", invoiceNo: p.reference || "—", description: `${p.method} payment`, debit: 0, credit: Number(p.amount),
  }));
  const merged = [...purchases, ...payments].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let bal = Number(sup.openingBalance || 0);
  const rows = merged.map((r) => {
    bal = bal + r.debit - r.credit;
    return { ...r, balance: bal };
  });
  return { rows, opening: Number(sup.openingBalance || 0), closing: bal };
}

// Reusable statement viewer — opened by clicking a customer or supplier name.
// kind: "customer" | "supplier"
function StatementModal({ T, db, kind, id, onClose }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const isCustomer = kind === "customer";
  const person = isCustomer ? db.customers.find((c) => c.id === id) : db.suppliers.find((s) => s.id === id);
  const { rows, opening } = isCustomer ? buildStatementRows(db, id) : buildSupplierStatementRows(db, id);
  const filteredRows = rows.filter((r) => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (q && !r.description.toLowerCase().includes(q.toLowerCase()) && !String(r.invoiceNo).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const closing = filteredRows.length ? filteredRows[filteredRows.length - 1].balance : opening;
  const debitLabel = isCustomer ? "Debit (Sale)" : "Debit (Purchase)";
  const balanceLabel = isCustomer ? "due" : "payable";

  const exportCSV = () => downloadCSV(`statement-${person?.name || kind}.csv`, filteredRows.map((r) => ({
    Date: fmtDateDMY(r.date), Type: r.type, Invoice: r.invoiceNo, Description: r.description,
    Debit: r.debit || "", Credit: r.credit || "", Balance: r.balance,
  })));

  if (!person) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 45, padding: 16 }}>
      <div style={{ background: T.paperCard, borderRadius: 12, padding: 22, width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="lg-display" style={{ fontSize: 17, fontWeight: 600, color: T.ink }}>{person.name}'s statement</div>
            <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>Running ledger — automatically built from {isCustomer ? "sales and payments" : "purchases and payments"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={exportCSV}><Download size={14} /> CSV</button>
            <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.slate }}><X size={20} /></button>
          </div>
        </div>

        <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input className="lg-input" style={{ width: 150 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="lg-input" style={{ width: 150 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <input className="lg-input" style={{ width: 200 }} placeholder="Search description / invoice" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="print-area">
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${T.rule}`, paddingBottom: 12, marginBottom: 4 }}>
            <div>
              <div className="lg-display" style={{ fontSize: 18, fontWeight: 600 }}>{person.name}</div>
              <div style={{ fontSize: 12, color: T.slate }}>{person.mobile} {person.company ? `• ${person.company}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: T.slate }}>Opening balance</div>
              <div className="lg-mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmtMoney(opening)}</div>
            </div>
          </div>
          <div style={{ position: "relative", paddingLeft: 14, borderLeft: `2px solid ${T.rule}`, marginTop: 10, overflowX: "auto" }}>
            <table className="lg-table">
              <thead><tr><th>Date</th><th>Type</th><th>Invoice</th><th>Description</th><th style={{ textAlign: "right" }}>{debitLabel}</th><th style={{ textAlign: "right" }}>Credit</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
              <tbody>
                {filteredRows.map((r, i) => (
                  <tr key={i}>
                    <td className="lg-mono">{fmtDateDMY(r.date)}</td>
                    <td>{r.type}</td>
                    <td className="lg-mono">{r.invoiceNo}</td>
                    <td>{r.description}</td>
                    <td className="lg-mono" style={{ textAlign: "right", color: r.debit ? T.rule : T.slateLight }}>{r.debit ? fmtMoney(r.debit) : "—"}</td>
                    <td className="lg-mono" style={{ textAlign: "right", color: r.credit ? T.green : T.slateLight }}>{r.credit ? fmtMoney(r.credit) : "—"}</td>
                    <td className="lg-mono" style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.balance)}</td>
                  </tr>
                ))}
                {!filteredRows.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: T.slateLight }}>No transactions in this range.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, paddingTop: 12, borderTop: `2px solid ${T.rule}` }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: T.slate }}>Closing balance ({balanceLabel})</div>
              <div className="lg-mono" style={{ fontSize: 18, fontWeight: 600, color: closing > 0 ? T.rule : T.green }}>{fmtMoney(closing)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashFlowPage({ T, db, cashFlowSeries, totals }) {
  const RC = useRecharts();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

  const transactions = useMemo(() => {
    const rows = [];
    db.payments.forEach((p) => {
      const cust = db.customers.find((c) => c.id === p.customerId);
      rows.push({ date: p.date, dir: "in", label: `Payment from ${cust ? cust.name : "—"}`, sub: p.method, amount: Number(p.amount) });
    });
    db.expenses.forEach((e) => {
      rows.push({ date: e.date, dir: "out", label: `Expense — ${e.category}`, sub: e.description || e.method, amount: Number(e.amount) });
    });
    db.supplierPayments.forEach((p) => {
      const sup = db.suppliers.find((s) => s.id === p.supplierId);
      rows.push({ date: p.date, dir: "out", label: `Payment to ${sup ? sup.name : "—"} (supplier)`, sub: p.method, amount: Number(p.amount) });
    });
    rows.sort((a, b) => (a.date || "").localeCompare(b.date || "") || 0);
    let bal = Number(db.settings.openingCash || 0);
    const withBalance = rows.map((r) => {
      bal = bal + (r.dir === "in" ? r.amount : -r.amount);
      return { ...r, balance: bal };
    });
    return withBalance.reverse();
  }, [db]);

  const filtered = transactions.filter((r) => {
    if (typeFilter !== "All" && r.dir !== typeFilter) return false;
    if (q && !r.label.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const exportCSV = () => downloadCSV("cash-flow-detail.csv", filtered.map((r) => ({
    Date: fmtDateDMY(r.date), Direction: r.dir === "in" ? "Cash In" : "Cash Out", Reason: r.label, Detail: r.sub || "", Amount: r.amount, Balance: r.balance,
  })));

  return (
    <div>
      <PageHeader T={T} title="Cash flow" subtitle="Every cash movement with its reason — customer payment, expense, or supplier payment"
        action={<button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={exportCSV}><Download size={14} /> Export CSV</button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard T={T} label="Opening cash" value={fmtMoney(db.settings.openingCash)} />
        <StatCard T={T} label="Cash in hand" value={fmtMoney(totals.cashInHand)} />
        <StatCard T={T} label="Net cash flow" value={fmtMoney(totals.netCashFlow)} tone={totals.netCashFlow >= 0 ? "good" : "danger"} />
      </div>
      <Card T={T} style={{ marginBottom: 16 }}>
        {!RC ? <ChartLoading T={T} height={240} /> : (
          <RC.ResponsiveContainer width="100%" height={240}>
            <RC.LineChart data={cashFlowSeries}>
              <RC.CartesianGrid strokeDasharray="3 3" stroke={T.line} />
              <RC.XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <RC.YAxis tick={{ fontSize: 11 }} />
              <RC.Tooltip />
              <RC.Legend wrapperStyle={{ fontSize: 12 }} />
              <RC.Line type="monotone" dataKey="in" stroke={T.green} name="Cash in" dot={false} />
              <RC.Line type="monotone" dataKey="out" stroke={T.rule} name="Cash out" dot={false} />
              <RC.Line type="monotone" dataKey="balance" stroke={T.ink} strokeWidth={2} name="Balance" dot={false} />
            </RC.LineChart>
          </RC.ResponsiveContainer>
        )}
      </Card>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input className="lg-input" style={{ width: 220 }} placeholder="Search reason (customer, expense, supplier)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="lg-input" style={{ width: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="All">All movements</option>
          <option value="in">Cash in only</option>
          <option value="out">Cash out only</option>
        </select>
      </div>
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th>Reason</th><th>Detail</th><th style={{ textAlign: "right" }}>Cash in</th><th style={{ textAlign: "right" }}>Cash out</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td className="lg-mono">{fmtDateDMY(r.date)}</td>
                <td style={{ fontWeight: 500 }}>{r.label}</td>
                <td style={{ color: T.slateLight, fontSize: 12 }}>{r.sub || "—"}</td>
                <td className="lg-mono" style={{ textAlign: "right", color: T.green }}>{r.dir === "in" ? fmtMoney(r.amount) : "—"}</td>
                <td className="lg-mono" style={{ textAlign: "right", color: T.rule }}>{r.dir === "out" ? fmtMoney(r.amount) : "—"}</td>
                <td className="lg-mono" style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.balance)}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No cash movements recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ReportsPage({ T, db, customerBalance, supplierBalance }) {
  const reports = [
    { label: "Sales report", data: () => db.sales.map((s) => ({ Date: fmtDateDMY(s.date), Invoice: s.invoiceNo, Customer: db.customers.find((c) => c.id === s.customerId)?.name || "", Product: s.productName, Qty: s.qty, Total: s.total })), file: "sales-report.csv" },
    { label: "Collection report", data: () => db.payments.map((p) => ({ Date: fmtDateDMY(p.date), Customer: db.customers.find((c) => c.id === p.customerId)?.name || "", Amount: p.amount, Method: p.method, Reference: p.reference })), file: "collection-report.csv" },
    { label: "Expense report", data: () => db.expenses.map((e) => ({ Date: fmtDateDMY(e.date), Category: e.category, Amount: e.amount, Method: e.method, Description: e.description })), file: "expense-report.csv" },
    { label: "Customer due report", data: () => db.customers.map((c) => ({ Customer: c.name, Mobile: c.mobile, Balance: customerBalance(c.id) })), file: "customer-due-report.csv" },
    { label: "Purchase report", data: () => db.purchases.map((p) => ({ Date: fmtDateDMY(p.date), Invoice: p.invoiceNo, Supplier: db.suppliers.find((s) => s.id === p.supplierId)?.name || "", Product: p.productName, Qty: p.qty, Total: p.total })), file: "purchase-report.csv" },
    { label: "Supplier due report", data: () => db.suppliers.map((s) => ({ Supplier: s.name, Mobile: s.mobile, Payable: supplierBalance(s.id) })), file: "supplier-due-report.csv" },
  ];
  return (
    <div>
      <PageHeader T={T} title="Reports" subtitle="Export any report as CSV, then open in Excel or Google Sheets" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 14 }}>
        {reports.map((r) => {
          const data = r.data();
          return (
            <Card T={T} key={r.label}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 12, color: T.slateLight, marginBottom: 12 }}>{data.length} records</div>
              <button className="lg-btn" style={{ background: T.ink, color: "#fff" }} disabled={!data.length} onClick={() => downloadCSV(r.file, data)}>
                <Download size={14} /> Export CSV
              </button>
            </Card>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: T.slateLight, marginTop: 14 }}>For a printable PDF version of any customer statement, open Statements and use Print.</div>
    </div>
  );
}

// ================= MULTI PLUG MODULE =================
const MP_SUBTABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "stock", label: "Stock Report" },
  { key: "purchase", label: "Purchase" },
  { key: "sales", label: "Sales" },
  { key: "salesmen", label: "Salesmen" },
  { key: "customers", label: "Customers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "payments", label: "Cash Receiving" },
  { key: "supplierPayments", label: "Supplier Payments" },
  { key: "settings", label: "Settings" },
];

function MultiPlugPage(props) {
  const { T } = props;
  const [sub, setSub] = useState("dashboard");
  return (
    <div>
      <PageHeader T={T} title="Multi Plug" subtitle="A separate product line — its own stock, purchases, sales and salesmen" />
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {MP_SUBTABS.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)} className="lg-btn"
            style={{
              background: sub === t.key ? T.ink : "transparent", color: sub === t.key ? "#fff" : T.slate,
              border: `1px solid ${sub === t.key ? T.ink : T.line}`, padding: "7px 14px", fontSize: 12.5,
            }}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === "dashboard" && <MpDashboard {...props} />}
      {sub === "stock" && <MpStockReportPage {...props} />}
      {sub === "purchase" && <MpPurchasePage {...props} />}
      {sub === "sales" && <MpSalesPage {...props} />}
      {sub === "salesmen" && <MpSalesmenPage {...props} />}
      {sub === "customers" && <MpCustomersPage {...props} />}
      {sub === "suppliers" && <MpSuppliersPage {...props} />}
      {sub === "payments" && <MpPaymentsPage {...props} />}
      {sub === "supplierPayments" && <MpSupplierPaymentsPage {...props} />}
      {sub === "settings" && <MpSettingsPage {...props} />}
    </div>
  );
}

function MpDashboard({ T, db, mpTotals, mpStockReport }) {
  const cards = [
    { label: "Total products", value: db.mpProducts.length, accent: "#B8912F" },
    { label: "Total sales", value: fmtMoney(mpTotals.totalSales), accent: "#3B6EA5" },
    { label: "Total collections", value: fmtMoney(mpTotals.totalCollections), tone: "good", accent: "#2F6B4F" },
    { label: "Total outstanding (customers)", value: fmtMoney(mpTotals.totalOutstanding), tone: "danger", accent: "#B23A2E" },
    { label: "Accounts payable (suppliers)", value: fmtMoney(mpTotals.totalPayable), tone: mpTotals.totalPayable > 0 ? "danger" : "", accent: "#8A5A2B" },
    { label: "Cash in hand", value: fmtMoney(mpTotals.cashInHand), accent: "#4C5B8A" },
    { label: "Stock value (at DP)", value: fmtMoney(mpTotals.totalStockDPValue), accent: "#6B4C9A" },
    { label: "Stock value (at TP)", value: fmtMoney(mpTotals.totalStockTPValue), tone: "good", accent: "#2E8B8B" },
    { label: "Total salesman commission", value: fmtMoney(mpTotals.totalCommission), accent: "#A34C6B" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
        {cards.map((c) => <StatCard key={c.label} T={T} {...c} />)}
      </div>
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Product</th><th style={{ textAlign: "right" }}>In stock</th><th style={{ textAlign: "right" }}>Avg DP</th><th style={{ textAlign: "right" }}>Auto TP</th></tr></thead>
          <tbody>
            {mpStockReport.slice(0, 8).map((r) => (
              <tr key={r.productId}>
                <td>{r.productName}</td>
                <td className="lg-mono" style={{ textAlign: "right" }}>{r.remainingQty}</td>
                <td className="lg-mono" style={{ textAlign: "right" }}>{fmtMoney(r.avgDP)}</td>
                <td className="lg-mono" style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.autoTP)}</td>
              </tr>
            ))}
            {!mpStockReport.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: 20, color: T.slateLight }}>No products yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MpStockReportPage({ T, mpStockReport }) {
  const exportCSV = () => downloadCSV("multiplug-stock-report.csv", mpStockReport.map((r) => ({
    Product: r.productName, "Bought from": r.suppliers.join(", "), "Total purchased": r.totalPurchasedQty,
    "Total sold": r.totalSoldQty, "In stock": r.remainingQty, "Avg DP": r.avgDP.toFixed(2), "Auto TP": r.autoTP.toFixed(2),
    "Total DP value": r.totalDPValue.toFixed(2), "Total TP value": r.totalTPValue.toFixed(2),
  })));
  const totalDP = mpStockReport.reduce((a, r) => a + r.totalDPValue, 0);
  const totalTP = mpStockReport.reduce((a, r) => a + r.totalTPValue, 0);
  return (
    <div>
      <PageHeader T={T} title="Stock report" subtitle="TP is auto-calculated as DP + 40% margin"
        action={<button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={exportCSV}><Download size={14} /> Export CSV</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead>
            <tr>
              <th>Product</th><th>Bought from</th>
              <th style={{ textAlign: "right" }}>Purchased</th><th style={{ textAlign: "right" }}>Sold</th><th style={{ textAlign: "right" }}>In stock</th>
              <th style={{ textAlign: "right" }}>DP (avg)</th><th style={{ textAlign: "right" }}>TP (auto)</th>
              <th style={{ textAlign: "right" }}>Total DP value</th><th style={{ textAlign: "right" }}>Total TP value</th>
            </tr>
          </thead>
          <tbody>
            {mpStockReport.map((r) => (
              <tr key={r.productId}>
                <td style={{ fontWeight: 600 }}>{r.productName}</td>
                <td style={{ fontSize: 12, color: T.slateLight }}>{r.suppliers.join(", ") || "—"}</td>
                <td className="lg-mono" style={{ textAlign: "right" }}>{r.totalPurchasedQty}</td>
                <td className="lg-mono" style={{ textAlign: "right" }}>{r.totalSoldQty}</td>
                <td className="lg-mono" style={{ textAlign: "right", fontWeight: 700, color: r.remainingQty > 0 ? T.green : T.rule }}>{r.remainingQty}</td>
                <td className="lg-mono" style={{ textAlign: "right" }}>{fmtMoney(r.avgDP)}</td>
                <td className="lg-mono" style={{ textAlign: "right" }}>{fmtMoney(r.autoTP)}</td>
                <td className="lg-mono" style={{ textAlign: "right" }}>{fmtMoney(r.totalDPValue)}</td>
                <td className="lg-mono" style={{ textAlign: "right" }}>{fmtMoney(r.totalTPValue)}</td>
              </tr>
            ))}
            {!mpStockReport.length && <tr><td colSpan={9} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No products yet — add one from Purchase entry.</td></tr>}
          </tbody>
          {!!mpStockReport.length && (
            <tfoot>
              <tr>
                <td colSpan={7} style={{ textAlign: "right", fontWeight: 600, fontSize: 12.5, color: T.slate, borderTop: `2px solid ${T.line}` }}>Total stock value</td>
                <td className="lg-mono" style={{ fontWeight: 700, borderTop: `2px solid ${T.line}`, textAlign: "right" }}>{fmtMoney(totalDP)}</td>
                <td className="lg-mono" style={{ fontWeight: 700, borderTop: `2px solid ${T.line}`, textAlign: "right" }}>{fmtMoney(totalTP)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}

function MpCustomersPage({ T, db, saveMpCustomer, deleteMpCustomer, mpCustomerBalance }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const totalBalance = db.mpCustomers.reduce((a, c) => a + mpCustomerBalance(c.id), 0);
  return (
    <div>
      <PageHeader T={T} title="Multi Plug customers" subtitle={`${db.mpCustomers.length} total`}
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})}><Plus size={14} /> Add customer</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Name</th><th>Mobile</th><th>Status</th><th>Balance</th><th></th></tr></thead>
          <tbody>
            {db.mpCustomers.map((c) => {
              const bal = mpCustomerBalance(c.id);
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="lg-mono">{c.mobile}</td>
                  <td><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: c.status === "Active" ? T.greenBg : T.dangerBg, color: c.status === "Active" ? T.green : T.rule, fontWeight: 600 }}>{c.status}</span></td>
                  <td className="lg-mono" style={{ color: bal > 0 ? T.rule : T.green, fontWeight: 600 }}>{fmtMoney(bal)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setModal(c)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(c)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!db.mpCustomers.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No customers yet.</td></tr>}
          </tbody>
          {!!db.mpCustomers.length && (
            <tfoot><tr>
              <td colSpan={3} style={{ textAlign: "right", fontWeight: 600, fontSize: 12.5, color: T.slate, borderTop: `2px solid ${T.line}` }}>Total balance</td>
              <td className="lg-mono" style={{ fontWeight: 700, color: totalBalance > 0 ? T.rule : T.green, borderTop: `2px solid ${T.line}` }}>{fmtMoney(totalBalance)}</td>
              <td style={{ borderTop: `2px solid ${T.line}` }}></td>
            </tr></tfoot>
          )}
        </table>
      </Card>
      {modal && (
        <ModalShell T={T} title={modal.id ? "Edit customer" : "Add customer"} onClose={() => setModal(null)}>
          <MpPersonForm T={T} initial={modal} onSave={(d) => { saveMpCustomer(d); setModal(null); }} />
        </ModalShell>
      )}
      {confirmDel && <ConfirmModal T={T} title="Delete customer?" message={`Remove ${confirmDel.name}?`} onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteMpCustomer(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function MpSuppliersPage({ T, db, saveMpSupplier, deleteMpSupplier, mpSupplierBalance }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const totalPayable = db.mpSuppliers.reduce((a, s) => a + mpSupplierBalance(s.id), 0);
  return (
    <div>
      <PageHeader T={T} title="Multi Plug suppliers" subtitle={`${db.mpSuppliers.length} total`}
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})}><Plus size={14} /> Add supplier</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Name</th><th>Mobile</th><th>Status</th><th>Payable</th><th></th></tr></thead>
          <tbody>
            {db.mpSuppliers.map((s) => {
              const bal = mpSupplierBalance(s.id);
              return (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="lg-mono">{s.mobile}</td>
                  <td><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: s.status === "Active" ? T.greenBg : T.dangerBg, color: s.status === "Active" ? T.green : T.rule, fontWeight: 600 }}>{s.status}</span></td>
                  <td className="lg-mono" style={{ color: bal > 0 ? T.rule : T.green, fontWeight: 600 }}>{fmtMoney(bal)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setModal(s)} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(s)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!db.mpSuppliers.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No suppliers yet.</td></tr>}
          </tbody>
          {!!db.mpSuppliers.length && (
            <tfoot><tr>
              <td colSpan={3} style={{ textAlign: "right", fontWeight: 600, fontSize: 12.5, color: T.slate, borderTop: `2px solid ${T.line}` }}>Total payable</td>
              <td className="lg-mono" style={{ fontWeight: 700, color: totalPayable > 0 ? T.rule : T.green, borderTop: `2px solid ${T.line}` }}>{fmtMoney(totalPayable)}</td>
              <td style={{ borderTop: `2px solid ${T.line}` }}></td>
            </tr></tfoot>
          )}
        </table>
      </Card>
      {modal && (
        <ModalShell T={T} title={modal.id ? "Edit supplier" : "Add supplier"} onClose={() => setModal(null)}>
          <MpPersonForm T={T} initial={modal} onSave={(d) => { saveMpSupplier(d); setModal(null); }} />
        </ModalShell>
      )}
      {confirmDel && <ConfirmModal T={T} title="Delete supplier?" message={`Remove ${confirmDel.name}?`} onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteMpSupplier(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function MpPersonForm({ T, initial, onSave }) {
  const [f, setF] = useState({
    id: initial.id, name: initial.name || "", mobile: initial.mobile || "", address: initial.address || "",
    openingBalance: initial.openingBalance || 0, status: initial.status || "Active",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Field T={T} label="Name"><input className="lg-input" value={f.name} onChange={set("name")} /></Field>
      <Field T={T} label="Mobile"><input className="lg-input" value={f.mobile} onChange={set("mobile")} /></Field>
      <Field T={T} label="Address"><input className="lg-input" value={f.address} onChange={set("address")} /></Field>
      <Field T={T} label="Opening balance"><input className="lg-input" type="number" value={f.openingBalance} onChange={set("openingBalance")} /></Field>
      <Field T={T} label="Status">
        <select className="lg-input" value={f.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select>
      </Field>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        disabled={!f.name} onClick={() => onSave(f)}>Save</button>
    </>
  );
}

function MpSalesmenPage({ T, db, saveMpSalesman, deleteMpSalesman, mpCustomerBalance }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const salesmanStats = (smId) => {
    const sales = db.mpSales.filter((s) => s.salesmanId === smId);
    const sm = db.mpSalesmen.find((x) => x.id === smId);
    const pct = sm ? Number(sm.commissionPercent || 10) : 10;
    const totalSold = sales.reduce((a, s) => a + Number(s.total), 0);
    const totalQty = sales.reduce((a, s) => a + Number(s.qty), 0);
    const totalDiscount = sales.reduce((a, s) => a + Number(s.discount || 0), 0);
    const commission = totalSold * (pct / 100);
    const byCustomer = {};
    sales.forEach((s) => {
      const cust = db.mpCustomers.find((c) => c.id === s.customerId);
      const name = cust ? cust.name : "—";
      if (!byCustomer[name]) byCustomer[name] = { qty: 0, total: 0, discount: 0, customerId: s.customerId };
      byCustomer[name].qty += Number(s.qty);
      byCustomer[name].total += Number(s.total);
      byCustomer[name].discount += Number(s.discount || 0);
    });
    return { totalSold, totalQty, totalDiscount, commission, byCustomer };
  };

  return (
    <div>
      <PageHeader T={T} title="Salesmen" subtitle="Sales, discounts given, and commission per salesman"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})}><Plus size={14} /> Add salesman</button>} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {db.mpSalesmen.map((sm) => {
          const stats = salesmanStats(sm.id);
          const isOpen = expanded === sm.id;
          return (
            <Card key={sm.id} T={T} style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : sm.id)}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{sm.name}</div>
                  <div style={{ fontSize: 12, color: T.slateLight }}>{sm.mobile} · Commission: {sm.commissionPercent || 10}%</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: T.slate }}>Total sold</div>
                    <div className="lg-mono" style={{ fontWeight: 700 }}>{fmtMoney(stats.totalSold)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: T.slate }}>Commission</div>
                    <div className="lg-mono" style={{ fontWeight: 700, color: T.green }}>{fmtMoney(stats.commission)}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setModal(sm); }} className="lg-btn" style={{ background: "transparent", color: T.slate, padding: 6 }}><Pencil size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDel(sm); }} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                </div>
              </div>
              {isOpen && (
                <div style={{ borderTop: `1px solid ${T.line}`, padding: "0 14px 14px" }}>
                  <table className="lg-table">
                    <thead><tr><th>Customer</th><th style={{ textAlign: "right" }}>Qty sold</th><th style={{ textAlign: "right" }}>Discount given</th><th style={{ textAlign: "right" }}>Sales value</th><th style={{ textAlign: "right" }}>Customer due</th></tr></thead>
                    <tbody>
                      {Object.entries(stats.byCustomer).map(([name, v]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td className="lg-mono" style={{ textAlign: "right" }}>{v.qty}</td>
                          <td className="lg-mono" style={{ textAlign: "right" }}>{fmtMoney(v.discount)}</td>
                          <td className="lg-mono" style={{ textAlign: "right" }}>{fmtMoney(v.total)}</td>
                          <td className="lg-mono" style={{ textAlign: "right", color: T.rule }}>{fmtMoney(mpCustomerBalance(v.customerId))}</td>
                        </tr>
                      ))}
                      {!Object.keys(stats.byCustomer).length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 14, color: T.slateLight }}>No sales yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
        {!db.mpSalesmen.length && <div style={{ textAlign: "center", padding: 30, color: T.slateLight }}>No salesmen added yet.</div>}
      </div>
      {modal && <MpSalesmanModal T={T} initial={modal} onClose={() => setModal(null)} onSave={(d) => { saveMpSalesman(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete salesman?" message={`Remove ${confirmDel.name}?`} onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteMpSalesman(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function MpSalesmanModal({ T, initial, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial.id, name: initial.name || "", mobile: initial.mobile || "",
    commissionPercent: initial.commissionPercent || 10, status: initial.status || "Active",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <ModalShell T={T} title={initial.id ? "Edit salesman" : "Add salesman"} onClose={onClose}>
      <Field T={T} label="Name"><input className="lg-input" value={f.name} onChange={set("name")} /></Field>
      <Field T={T} label="Mobile"><input className="lg-input" value={f.mobile} onChange={set("mobile")} /></Field>
      <Field T={T} label="Commission % (on total sales value)"><input className="lg-input" type="number" value={f.commissionPercent} onChange={set("commissionPercent")} /></Field>
      <Field T={T} label="Status">
        <select className="lg-input" value={f.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select>
      </Field>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        disabled={!f.name} onClick={() => onSave({ ...f, commissionPercent: Number(f.commissionPercent) })}>Save salesman</button>
    </ModalShell>
  );
}

function MpPurchasePage({ T, db, saveMpPurchase, deleteMpPurchase, saveMpProduct, nextMpPurchaseInvoiceNo }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.mpPurchases].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Purchase entry" subtitle="Buying stock from a supplier at DP (Dealer Price) — this adds to stock"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})} disabled={!db.mpSuppliers.length}><Plus size={14} /> New purchase</button>} />
      {!db.mpSuppliers.length && <div style={{ fontSize: 12.5, color: T.slateLight, marginBottom: 12 }}>Add a Multi Plug supplier first (Suppliers tab).</div>}
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Supplier</th><th>Product</th><th>Qty</th><th>DP</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const sup = db.mpSuppliers.find((s) => s.id === p.supplierId);
              return (
                <tr key={p.id}>
                  <td className="lg-mono">{p.invoiceNo}</td>
                  <td className="lg-mono">{fmtDateDMY(p.date)}</td>
                  <td>{sup ? sup.name : "—"}</td>
                  <td>{p.productName}</td>
                  <td className="lg-mono">{p.qty}</td>
                  <td className="lg-mono">{fmtMoney(p.dp)}</td>
                  <td className="lg-mono" style={{ fontWeight: 600 }}>{fmtMoney(Number(p.qty) * Number(p.dp))}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setConfirmDel(p)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No purchases recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && <MpPurchaseModal T={T} db={db} nextMpPurchaseInvoiceNo={nextMpPurchaseInvoiceNo} onClose={() => setModal(null)} onSave={(d) => { saveMpPurchase(d); setModal(null); }} saveMpProduct={saveMpProduct} />}
      {confirmDel && <ConfirmModal T={T} title="Delete purchase?" message="This will reduce stock and the amount owed to this supplier." onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteMpPurchase(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function MpPurchaseModal({ T, db, nextMpPurchaseInvoiceNo, onClose, onSave, saveMpProduct }) {
  const [productMode, setProductMode] = useState(db.mpProducts.length ? "existing" : "new");
  const [f, setF] = useState({
    date: todayISO(), supplierId: db.mpSuppliers[0]?.id || "", productId: db.mpProducts[0]?.id || "",
    newProductName: "", qty: 1, dp: 0, remarks: "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = (Number(f.qty) || 0) * (Number(f.dp) || 0);

  const save = () => {
    let productId = f.productId;
    let productName = db.mpProducts.find((p) => p.id === productId)?.name || "";
    if (productMode === "new") {
      productId = uid("MPPRD");
      productName = f.newProductName;
      saveMpProduct({ id: productId, name: productName, status: "Active" });
    }
    onSave({ date: f.date, supplierId: f.supplierId, productId, productName, qty: Number(f.qty), dp: Number(f.dp), remarks: f.remarks });
  };

  return (
    <ModalShell T={T} title="New purchase entry" onClose={onClose}>
      <div style={{ fontSize: 11.5, color: T.slateLight, marginBottom: 8 }}>Invoice: <span className="lg-mono">{nextMpPurchaseInvoiceNo()}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field T={T} label="Supplier">
          <select className="lg-input" value={f.supplierId} onChange={set("supplierId")}>
            {db.mpSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field T={T} label="Product">
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button type="button" className="lg-btn" onClick={() => setProductMode("existing")} style={{ background: productMode === "existing" ? T.ink : "transparent", color: productMode === "existing" ? "#fff" : T.slate, border: `1px solid ${T.line}`, fontSize: 12 }}>Existing product</button>
          <button type="button" className="lg-btn" onClick={() => setProductMode("new")} style={{ background: productMode === "new" ? T.ink : "transparent", color: productMode === "new" ? "#fff" : T.slate, border: `1px solid ${T.line}`, fontSize: 12 }}>New product</button>
        </div>
        {productMode === "existing" ? (
          <select className="lg-input" value={f.productId} onChange={set("productId")}>
            {db.mpProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <input className="lg-input" placeholder="New product name" value={f.newProductName} onChange={set("newProductName")} />
        )}
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Quantity"><input className="lg-input" type="number" value={f.qty} onChange={set("qty")} /></Field>
        <Field T={T} label="DP (purchase price / unit)"><input className="lg-input" type="number" value={f.dp} onChange={set("dp")} /></Field>
      </div>
      <Field T={T} label="Remarks"><input className="lg-input" value={f.remarks} onChange={set("remarks")} /></Field>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0" }}>
        <span style={{ fontSize: 13, color: T.slate }}>Total (added to payable)</span>
        <span className="lg-mono" style={{ fontSize: 18, fontWeight: 600 }}>{fmtMoney(total)}</span>
      </div>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center" }}
        disabled={!f.supplierId || (productMode === "existing" ? !f.productId : !f.newProductName)}
        onClick={save}>Save purchase</button>
    </ModalShell>
  );
}

function MpSalesPage({ T, db, saveMpSale, deleteMpSale, mpStockReport, nextMpSaleInvoiceNo }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.mpSales].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Sales entry" subtitle="Sell to a Multi Plug customer via a salesman, at TP with an optional discount"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})} disabled={!db.mpCustomers.length || !db.mpProducts.length}><Plus size={14} /> New sale</button>} />
      {(!db.mpCustomers.length || !db.mpProducts.length) && <div style={{ fontSize: 12.5, color: T.slateLight, marginBottom: 12 }}>Add a customer and at least one product (via Purchase entry) first.</div>}
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Salesman</th><th>Product</th><th>Qty</th><th>TP</th><th>Discount</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {rows.map((s) => {
              const cust = db.mpCustomers.find((c) => c.id === s.customerId);
              const sm = db.mpSalesmen.find((x) => x.id === s.salesmanId);
              return (
                <tr key={s.id}>
                  <td className="lg-mono">{s.invoiceNo}</td>
                  <td className="lg-mono">{fmtDateDMY(s.date)}</td>
                  <td>{cust ? cust.name : "—"}</td>
                  <td>{sm ? sm.name : "—"}</td>
                  <td>{s.productName}</td>
                  <td className="lg-mono">{s.qty}</td>
                  <td className="lg-mono">{fmtMoney(s.tp)}</td>
                  <td className="lg-mono" style={{ color: T.rule }}>{fmtMoney(s.discount || 0)}</td>
                  <td className="lg-mono" style={{ fontWeight: 600 }}>{fmtMoney(s.total)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setConfirmDel(s)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={10} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No sales recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && <MpSaleModal T={T} db={db} mpStockReport={mpStockReport} nextMpSaleInvoiceNo={nextMpSaleInvoiceNo} onClose={() => setModal(null)} onSave={(d) => { saveMpSale(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete sale?" message="This will restore stock and reduce the customer's due." onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteMpSale(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function MpSaleModal({ T, db, mpStockReport, nextMpSaleInvoiceNo, onClose, onSave }) {
  const [f, setF] = useState({
    date: todayISO(), customerId: db.mpCustomers[0]?.id || "", salesmanId: db.mpSalesmen[0]?.id || "",
    productId: db.mpProducts[0]?.id || "", qty: 1, tp: 0, discount: 0, remarks: "",
  });
  const stockRow = mpStockReport.find((r) => r.productId === f.productId);

  useEffect(() => {
    if (stockRow) setF((prev) => ({ ...prev, tp: Number(stockRow.autoTP.toFixed(2)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.productId]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const gross = (Number(f.qty) || 0) * (Number(f.tp) || 0);
  const total = Math.max(gross - (Number(f.discount) || 0), 0);
  const availableStock = stockRow ? stockRow.remainingQty : 0;

  return (
    <ModalShell T={T} title="New sale entry" onClose={onClose}>
      <div style={{ fontSize: 11.5, color: T.slateLight, marginBottom: 8 }}>Invoice: <span className="lg-mono">{nextMpSaleInvoiceNo()}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field T={T} label="Customer">
          <select className="lg-input" value={f.customerId} onChange={set("customerId")}>
            {db.mpCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Salesman">
          <select className="lg-input" value={f.salesmanId} onChange={set("salesmanId")}>
            {db.mpSalesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field T={T} label="Product">
          <select className="lg-input" value={f.productId} onChange={set("productId")}>
            {db.mpProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ fontSize: 11.5, color: T.slateLight, marginBottom: 10 }}>In stock: <span className="lg-mono" style={{ fontWeight: 600, color: availableStock > 0 ? T.green : T.rule }}>{availableStock}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Quantity"><input className="lg-input" type="number" value={f.qty} onChange={set("qty")} /></Field>
        <Field T={T} label="TP (selling price / unit)"><input className="lg-input" type="number" value={f.tp} onChange={set("tp")} /></Field>
      </div>
      <Field T={T} label="Discount (total amount, optional)"><input className="lg-input" type="number" value={f.discount} onChange={set("discount")} /></Field>
      <Field T={T} label="Remarks"><input className="lg-input" value={f.remarks} onChange={set("remarks")} /></Field>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0" }}>
        <span style={{ fontSize: 13, color: T.slate }}>Total (added to customer due)</span>
        <span className="lg-mono" style={{ fontSize: 18, fontWeight: 600 }}>{fmtMoney(total)}</span>
      </div>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center" }}
        disabled={!f.customerId || !f.productId || !f.salesmanId}
        onClick={() => onSave({ ...f, qty: Number(f.qty), tp: Number(f.tp), discount: Number(f.discount) || 0, total, productName: db.mpProducts.find((p) => p.id === f.productId)?.name })}>
        Save sale
      </button>
    </ModalShell>
  );
}

function MpPaymentsPage({ T, db, saveMpPayment, deleteMpPayment }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.mpPayments].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Cash receiving" subtitle="Money received from a Multi Plug customer"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})} disabled={!db.mpCustomers.length}><Plus size={14} /> New payment</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th>Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const cust = db.mpCustomers.find((c) => c.id === p.customerId);
              return (
                <tr key={p.id}>
                  <td className="lg-mono">{fmtDateDMY(p.date)}</td>
                  <td>{cust ? cust.name : "—"}</td>
                  <td className="lg-mono" style={{ color: T.green, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                  <td>{p.method}</td>
                  <td className="lg-mono">{p.reference || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setConfirmDel(p)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && (
        <ModalShell T={T} title="New payment" onClose={() => setModal(null)}>
          <MpPaymentForm T={T} db={db} onSave={(d) => { saveMpPayment(d); setModal(null); }} />
        </ModalShell>
      )}
      {confirmDel && <ConfirmModal T={T} title="Delete payment?" message="This will increase the customer's due balance." onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteMpPayment(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function MpPaymentForm({ T, db, onSave }) {
  const [f, setF] = useState({ date: todayISO(), customerId: db.mpCustomers[0]?.id || "", amount: 0, method: "Cash", reference: "", remarks: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
      <Field T={T} label="Customer">
        <select className="lg-input" value={f.customerId} onChange={set("customerId")}>
          {db.mpCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Amount"><input className="lg-input" type="number" value={f.amount} onChange={set("amount")} /></Field>
        <Field T={T} label="Method">
          <select className="lg-input" value={f.method} onChange={set("method")}><option>Cash</option><option>Bank</option><option>Mobile Banking</option><option>Cheque</option></select>
        </Field>
      </div>
      <Field T={T} label="Reference"><input className="lg-input" value={f.reference} onChange={set("reference")} /></Field>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        disabled={!f.customerId || !f.amount} onClick={() => onSave({ ...f, amount: Number(f.amount) })}>Save payment</button>
    </>
  );
}

function MpSupplierPaymentsPage({ T, db, saveMpSupplierPayment, deleteMpSupplierPayment }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.mpSupplierPayments].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Payments to suppliers" subtitle="Money paid out to a Multi Plug supplier"
        action={<button className="lg-btn" style={{ background: T.ink, color: "#fff" }} onClick={() => setModal({})} disabled={!db.mpSuppliers.length}><Plus size={14} /> New payment</button>} />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th>Supplier</th><th>Amount</th><th>Method</th><th>Reference</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const sup = db.mpSuppliers.find((s) => s.id === p.supplierId);
              return (
                <tr key={p.id}>
                  <td className="lg-mono">{fmtDateDMY(p.date)}</td>
                  <td>{sup ? sup.name : "—"}</td>
                  <td className="lg-mono" style={{ color: T.rule, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                  <td>{p.method}</td>
                  <td className="lg-mono">{p.reference || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setConfirmDel(p)} className="lg-btn" style={{ background: "transparent", color: T.rule, padding: 6 }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      {modal && (
        <ModalShell T={T} title="New payment to supplier" onClose={() => setModal(null)}>
          <MpSupplierPaymentForm T={T} db={db} onSave={(d) => { saveMpSupplierPayment(d); setModal(null); }} />
        </ModalShell>
      )}
      {confirmDel && <ConfirmModal T={T} title="Delete payment?" message="This will increase the amount owed to this supplier." onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteMpSupplierPayment(confirmDel.id); setConfirmDel(null); }} />}
    </div>
  );
}

function MpSupplierPaymentForm({ T, db, onSave }) {
  const [f, setF] = useState({ date: todayISO(), supplierId: db.mpSuppliers[0]?.id || "", amount: 0, method: "Cash", reference: "", remarks: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Field T={T} label="Date"><input className="lg-input" type="date" value={f.date} onChange={set("date")} /></Field>
      <Field T={T} label="Supplier">
        <select className="lg-input" value={f.supplierId} onChange={set("supplierId")}>
          {db.mpSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field T={T} label="Amount"><input className="lg-input" type="number" value={f.amount} onChange={set("amount")} /></Field>
        <Field T={T} label="Method">
          <select className="lg-input" value={f.method} onChange={set("method")}><option>Cash</option><option>Bank</option><option>Mobile Banking</option><option>Cheque</option></select>
        </Field>
      </div>
      <Field T={T} label="Reference"><input className="lg-input" value={f.reference} onChange={set("reference")} /></Field>
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
        disabled={!f.supplierId || !f.amount} onClick={() => onSave({ ...f, amount: Number(f.amount) })}>Save payment</button>
    </>
  );
}

function MpSettingsPage({ T, db, saveMpSettings }) {
  const [openingCash, setOpeningCash] = useState(db.mpSettings.openingCash);
  const [marginPercent, setMarginPercent] = useState(db.mpSettings.marginPercent ?? 40);
  return (
    <div>
      <Card T={T} style={{ maxWidth: 420 }}>
        <Field T={T} label="Multi Plug opening cash balance"><input className="lg-input" type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} /></Field>
        <Field T={T} label="Default margin % (used to auto-suggest TP from DP)">
          <input className="lg-input" type="number" value={marginPercent} onChange={(e) => setMarginPercent(e.target.value)} />
        </Field>
        <div style={{ fontSize: 11.5, color: T.slateLight, marginBottom: 12, marginTop: -6 }}>
          এই % দিয়ে Stock Report আর Sales entry-তে TP (বিক্রয়মূল্য) অটোমেটিক suggest হয় (DP + এই %) — এটা শুধু একটা suggestion, প্রতিটা বিক্রির সময় চাইলে TP নিজে বদলে দিতে পারবে।
        </div>
        <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
          onClick={() => saveMpSettings({ openingCash: Number(openingCash), marginPercent: Number(marginPercent) })}>Save</button>
      </Card>
      <div style={{ fontSize: 12, color: T.slateLight, marginTop: 14, maxWidth: 420 }}>
        Multi Plug has its own customers, suppliers, products and cash — completely separate from the main ARHAM TRADERS ledger. Its cash-in-hand also appears as a card on the main Dashboard.
      </div>
    </div>
  );
}

function SettingsPage({ T, db, saveSettings }) {
  const [companyName, setCompanyName] = useState(db.settings.companyName);
  const [openingCash, setOpeningCash] = useState(db.settings.openingCash);
  return (
    <div>
      <PageHeader T={T} title="Settings" subtitle="Business information and starting figures" />
      <Card T={T} style={{ maxWidth: 420 }}>
        <Field T={T} label="Company name"><input className="lg-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></Field>
        <Field T={T} label="Opening cash balance"><input className="lg-input" type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} /></Field>
        <Field T={T} label="Currency"><input className="lg-input" value="BDT (Bangladeshi Taka)" disabled /></Field>
        <Field T={T} label="Date format"><input className="lg-input" value="DD-MM-YYYY" disabled /></Field>
        <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center", marginTop: 6 }}
          onClick={() => saveSettings({ companyName, openingCash: Number(openingCash) })}>Save settings</button>
      </Card>
      <div style={{ fontSize: 12, color: T.slateLight, marginTop: 14, maxWidth: 420 }}>
        Demo note: this prototype stores data in shared artifact storage so the admin and customer views can talk to each other — anyone using this artifact link can see the same records. A production build would use per-account authentication and a real database.
      </div>
    </div>
  );
}

// ================= CUSTOMER PORTAL =================
function CustomerShell(props) {
  const { T, dark, setDark, view, setView, logout } = props;
  const navItems = [
    { key: "profile", label: "My profile", icon: Users, color: "#B8912F", frontColor: "#5FBFB0" },
    { key: "statement", label: "Statement", icon: ScrollText, color: "#2F6B4F", frontColor: "#E0A458" },
    { key: "purchases", label: "Purchases", icon: PackagePlus, color: "#3B6EA5", frontColor: "#E08B76" },
    { key: "paymentHistory", label: "Payments", icon: Wallet, color: "#6B4C9A", frontColor: "#8FCF8F" },
  ];
  return (
    <Shell T={T} dark={dark} setDark={setDark} logout={logout} title="My account" navItems={navItems} view={view} setView={setView}>
      {view === "profile" && <CustomerProfile {...props} />}
      {view === "statement" && <CustomerStatement {...props} />}
      {view === "purchases" && <CustomerPurchases {...props} />}
      {view === "paymentHistory" && <CustomerPayments {...props} />}
    </Shell>
  );
}

function CustomerProfile({ T, db, customerId, customerBalance }) {
  const cust = db.customers.find((c) => c.id === customerId);
  if (!cust) return null;
  const bal = customerBalance(customerId);
  return (
    <div>
      <PageHeader T={T} title={`Welcome, ${cust.name}`} subtitle="Your profile and current balance" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard T={T} label="Current balance" value={fmtMoney(bal)} sub={bal > 0 ? "Amount due" : "No dues"} tone={bal > 0 ? "danger" : "good"} />
        <StatCard T={T} label="Status" value={cust.status} />
        <StatCard T={T} label="Customer ID" value={cust.id} />
      </div>
      <Card T={T} style={{ maxWidth: 420 }}>
        <table className="lg-table">
          <tbody>
            <tr><td style={{ color: T.slate }}>Mobile</td><td className="lg-mono">{cust.mobile}</td></tr>
            <tr><td style={{ color: T.slate }}>Email</td><td>{cust.email || "—"}</td></tr>
            <tr><td style={{ color: T.slate }}>Address</td><td>{cust.address || "—"}</td></tr>
            <tr><td style={{ color: T.slate }}>Company</td><td>{cust.company || "—"}</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function CustomerStatement({ T, db, customerId }) {
  const { rows, opening, closing } = buildStatementRows(db, customerId);
  const cust = db.customers.find((c) => c.id === customerId);
  const exportCSV = () => downloadCSV(`my-statement.csv`, rows.map((r) => ({
    Date: fmtDateDMY(r.date), Type: r.type, Invoice: r.invoiceNo, Description: r.description, Debit: r.debit || "", Credit: r.credit || "", Balance: r.balance,
  })));
  return (
    <div>
      <PageHeader T={T} title="My statement" subtitle="Running ledger of your purchases and payments"
        action={
          <div style={{ display: "flex", gap: 8 }} className="no-print">
            <button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={exportCSV}><Download size={14} /> Download</button>
          </div>
        } />
      <Card T={T} style={{ padding: 24 }}>
        <div className="print-area">
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${T.rule}`, paddingBottom: 12 }}>
            <div className="lg-display" style={{ fontSize: 18, fontWeight: 600 }}>{cust?.name}</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: T.slate }}>Opening balance</div>
              <div className="lg-mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmtMoney(opening)}</div>
            </div>
          </div>
          <div style={{ borderLeft: `2px solid ${T.rule}`, paddingLeft: 14, marginTop: 10 }}>
            <table className="lg-table">
              <thead><tr><th>Date</th><th>Type</th><th>Invoice</th><th>Description</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="lg-mono">{fmtDateDMY(r.date)}</td>
                    <td>{r.type}</td>
                    <td className="lg-mono">{r.invoiceNo}</td>
                    <td>{r.description}</td>
                    <td className="lg-mono" style={{ textAlign: "right", color: r.debit ? T.rule : T.slateLight }}>{r.debit ? fmtMoney(r.debit) : "—"}</td>
                    <td className="lg-mono" style={{ textAlign: "right", color: r.credit ? T.green : T.slateLight }}>{r.credit ? fmtMoney(r.credit) : "—"}</td>
                    <td className="lg-mono" style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.balance)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: T.slateLight }}>No transactions yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, paddingTop: 12, borderTop: `2px solid ${T.rule}` }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: T.slate }}>Closing balance</div>
              <div className="lg-mono" style={{ fontSize: 18, fontWeight: 600, color: closing > 0 ? T.rule : T.green }}>{fmtMoney(closing)}</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CustomerPurchases({ T, db, customerId }) {
  const rows = db.sales.filter((s) => s.customerId === customerId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Purchase history" />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th>Invoice</th><th>Product</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="lg-mono">{fmtDateDMY(s.date)}</td>
                <td className="lg-mono">{s.invoiceNo}</td>
                <td>{s.productName}</td>
                <td className="lg-mono">{s.qty} {s.unit}</td>
                <td className="lg-mono" style={{ fontWeight: 600 }}>{fmtMoney(s.total)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No purchases yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function CustomerPayments({ T, db, customerId }) {
  const rows = db.payments.filter((p) => p.customerId === customerId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Payment history" />
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="lg-mono">{fmtDateDMY(p.date)}</td>
                <td className="lg-mono" style={{ color: T.green, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                <td>{p.method}</td>
                <td className="lg-mono">{p.reference || "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No payments yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ================= SHARED UI =================
function ModalShell({ T, title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40, padding: 16 }}>
      <div style={{ background: T.paperCard, borderRadius: 12, padding: 22, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="lg-display" style={{ fontSize: 17, fontWeight: 600, color: T.ink }}>{title}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.slate }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ T, label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: T.slate, fontWeight: 600, display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function ConfirmModal({ T, title, message, onCancel, onConfirm }) {
  return (
    <ModalShell T={T} title={title} onClose={onCancel}>
      <div style={{ fontSize: 13, color: T.slate, marginBottom: 18 }}>{message}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={onCancel}>Cancel</button>
        <button className="lg-btn" style={{ background: T.rule, color: "#fff" }} onClick={onConfirm}>Delete</button>
      </div>
    </ModalShell>
  );
}
