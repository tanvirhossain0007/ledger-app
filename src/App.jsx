import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  LayoutDashboard, Users, PackagePlus, Wallet, Receipt, ScrollText,
  TrendingUp, FileBarChart, Settings, LogOut, Plus, Search, Pencil,
  Trash2, X, Printer, Download, Sun, Moon, ChevronLeft, ArrowUpRight,
  ArrowDownRight, CircleDollarSign, ShieldCheck, Menu, Building2, Truck, CreditCard, Banknote,
} from "lucide-react";

const CUR = "BDT";
const TABLE_KEYS = ["customers", "sales", "payments", "expenses", "suppliers", "purchases", "supplierPayments"];

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
      src="/arham-shield-logo.png"
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
});

async function fetchAllTables() {
  const results = await Promise.all(TABLE_KEYS.map((t) => supabase.from(t).select("*")));
  const errors = results.map((r) => r.error).filter(Boolean);
  if (errors.length) throw errors[0];
  const next = emptyDB();
  TABLE_KEYS.forEach((key, i) => { next[key] = results[i].data || []; });
  const settingsRes = await supabase.from("settings").select("*").eq("id", 1).single();
  if (settingsRes.data) {
    const { id, ...rest } = settingsRes.data;
    next.settings = { ...next.settings, ...rest };
  }
  return next;
}

// Diffs prev vs next for each table and only pushes what actually changed to Supabase,
// instead of re-uploading the entire database on every save.
async function syncToSupabase(prev, next) {
  const jobs = [];
  for (const key of TABLE_KEYS) {
    const prevRows = prev[key] || [];
    const nextRows = next[key] || [];
    if (prevRows === nextRows) continue;
    const nextIds = new Set(nextRows.map((r) => r.id));
    const toDelete = prevRows.filter((r) => !nextIds.has(r.id)).map((r) => r.id);
    const toUpsert = nextRows.filter((r) => {
      const old = prevRows.find((p) => p.id === r.id);
      return !old || JSON.stringify(old) !== JSON.stringify(r);
    });
    if (toDelete.length) jobs.push(supabase.from(key).delete().in("id", toDelete));
    if (toUpsert.length) jobs.push(supabase.from(key).upsert(toUpsert));
  }
  if (prev.settings !== next.settings) {
    jobs.push(supabase.from("settings").upsert({ id: 1, ...next.settings }));
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
          background: hexToRgba(T.paper, 0.72), backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        }}>
          {children}
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
        background: hexToRgba(T.paper, 0.72), backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      }}>
        {children}
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
    { key: "statements", label: "Statements", icon: ScrollText, color: "#C1663B", frontColor: "#7FC2CB" },
    { key: "cashflow", label: "Cash flow", icon: TrendingUp, color: "#2E8B8B", frontColor: "#E29BD1" },
    { key: "reports", label: "Reports", icon: FileBarChart, color: "#4C5B8A", frontColor: "#F0C96B" },
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
      {view === "statements" && <StatementsPage {...props} />}
      {view === "cashflow" && <CashFlowPage {...props} />}
      {view === "reports" && <ReportsPage {...props} />}
      {view === "settings" && <SettingsPage {...props} />}
    </Shell>
  );
}

function AdminDashboard({ T, db, totals, monthlyChartData, cashFlowSeries, topCustomers, outstandingCustomers }) {
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
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sales" fill={T.gold} name="Sales" />
              <Bar dataKey="collections" fill={T.green} name="Collections" />
              <Bar dataKey="expenses" fill={T.rule} name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card T={T}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Cash flow</div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={cashFlowSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="balance" stroke={T.ink} strokeWidth={2} dot={false} name="Cash balance" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card T={T}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top customers by sales</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topCustomers} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
              <Tooltip />
              <Bar dataKey="sales" fill={T.gold} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card T={T}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Outstanding customers</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={outstandingCustomers} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
              <Tooltip />
              <Bar dataKey="due" fill={T.rule} />
            </BarChart>
          </ResponsiveContainer>
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

  const filtered = db.customers.filter((c) => {
    const matchQ = !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.mobile.includes(q);
    const matchStatus = statusFilter === "All" || c.status === statusFilter;
    return matchQ && matchStatus;
  });

  return (
    <div>
      <PageHeader T={T} title="Customers" subtitle={`${db.customers.length} total`}
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
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
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
        </table>
      </Card>

      {modal && <CustomerModal T={T} initial={modal} onClose={() => setModal(null)} onSave={(d) => { saveCustomer(d); setModal(null); }} />}
      {confirmDel && (
        <ConfirmModal T={T} title="Delete customer?" message={`This removes ${confirmDel.name} and cannot be undone.`}
          onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteCustomer(confirmDel.id); setConfirmDel(null); }} />
      )}
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
  const filtered = db.suppliers.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.mobile || "").includes(q));
  return (
    <div>
      <PageHeader T={T} title="Suppliers" subtitle={`${db.suppliers.length} total — businesses you buy stock from`}
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
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
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
        </table>
      </Card>
      {modal && <SupplierModal T={T} initial={modal} onClose={() => setModal(null)} onSave={(d) => { saveSupplier(d); setModal(null); }} />}
      {confirmDel && <ConfirmModal T={T} title="Delete supplier?" message={`This removes ${confirmDel.name} and cannot be undone.`} onCancel={() => setConfirmDel(null)} onConfirm={() => { deleteSupplier(confirmDel.id); setConfirmDel(null); }} />}
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

function StatementsPage({ T, db, customerBalance }) {
  const [custId, setCustId] = useState(db.customers[0]?.id || "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const cust = db.customers.find((c) => c.id === custId);
  const { rows, opening } = buildStatementRows(db, custId);
  const filteredRows = rows.filter((r) => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (q && !r.description.toLowerCase().includes(q.toLowerCase()) && !String(r.invoiceNo).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const closing = filteredRows.length ? filteredRows[filteredRows.length - 1].balance : opening;

  const exportCSV = () => downloadCSV(`statement-${cust?.name || "customer"}.csv`, filteredRows.map((r) => ({
    Date: fmtDateDMY(r.date), Type: r.type, Invoice: r.invoiceNo, Description: r.description,
    Debit: r.debit || "", Credit: r.credit || "", Balance: r.balance,
  })));

  return (
    <div>
      <PageHeader T={T} title="Customer statement" subtitle="Running ledger — automatically built from sales and payments"
        action={
          <div style={{ display: "flex", gap: 8 }} className="no-print">
            <button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="lg-btn" style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink }} onClick={exportCSV}><Download size={14} /> Export CSV</button>
          </div>
        } />
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }} className="no-print">
        <select className="lg-input" style={{ width: 220 }} value={custId} onChange={(e) => setCustId(e.target.value)}>
          {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="lg-input" style={{ width: 150 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="lg-input" style={{ width: 150 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="lg-input" style={{ width: 200 }} placeholder="Search description / invoice" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {cust && (
        <Card T={T} style={{ padding: 24 }}>
          <div className="print-area">
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${T.rule}`, paddingBottom: 12, marginBottom: 4 }}>
              <div>
                <div className="lg-display" style={{ fontSize: 18, fontWeight: 600 }}>{cust.name}</div>
                <div style={{ fontSize: 12, color: T.slate }}>{cust.mobile} {cust.company ? `• ${cust.company}` : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: T.slate }}>Opening balance</div>
                <div className="lg-mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmtMoney(opening)}</div>
              </div>
            </div>
            <div style={{ position: "relative", paddingLeft: 14, borderLeft: `2px solid ${T.rule}`, marginTop: 10 }}>
              <table className="lg-table">
                <thead><tr><th>Date</th><th>Type</th><th>Invoice</th><th>Description</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
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
                <div style={{ fontSize: 11, color: T.slate }}>Closing balance</div>
                <div className="lg-mono" style={{ fontSize: 18, fontWeight: 600, color: closing > 0 ? T.rule : T.green }}>{fmtMoney(closing)}</div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function CashFlowPage({ T, db, cashFlowSeries, totals }) {
  const rows = [...cashFlowSeries].reverse();
  return (
    <div>
      <PageHeader T={T} title="Cash flow" subtitle="Cash in (payments) vs cash out (expenses), with running balance" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard T={T} label="Opening cash" value={fmtMoney(db.settings.openingCash)} />
        <StatCard T={T} label="Cash in hand" value={fmtMoney(totals.cashInHand)} />
        <StatCard T={T} label="Net cash flow" value={fmtMoney(totals.netCashFlow)} tone={totals.netCashFlow >= 0 ? "good" : "danger"} />
      </div>
      <Card T={T} style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={cashFlowSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="in" stroke={T.green} name="Cash in" dot={false} />
            <Line type="monotone" dataKey="out" stroke={T.rule} name="Cash out" dot={false} />
            <Line type="monotone" dataKey="balance" stroke={T.ink} strokeWidth={2} name="Balance" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card T={T} style={{ padding: 0, overflowX: "auto" }}>
        <table className="lg-table">
          <thead><tr><th>Date</th><th style={{ textAlign: "right" }}>Cash in</th><th style={{ textAlign: "right" }}>Cash out</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="lg-mono">{r.date}</td>
                <td className="lg-mono" style={{ textAlign: "right", color: T.green }}>{r.in ? fmtMoney(r.in) : "—"}</td>
                <td className="lg-mono" style={{ textAlign: "right", color: T.rule }}>{r.out ? fmtMoney(r.out) : "—"}</td>
                <td className="lg-mono" style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.balance)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: T.slateLight }}>No cash movements recorded yet.</td></tr>}
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
