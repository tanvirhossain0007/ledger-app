import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  LayoutDashboard, Users, PackagePlus, Wallet, Receipt, ScrollText,
  TrendingUp, FileBarChart, Settings, LogOut, Plus, Search, Pencil,
  Trash2, X, Printer, Download, Sun, Moon, ChevronLeft, ArrowUpRight,
  ArrowDownRight, CircleDollarSign, ShieldCheck,
} from "lucide-react";

const DB_KEY = "ledger_db_v1";
const CUR = "BDT";

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

function monthKey(iso) {
  return iso ? iso.slice(0, 7) : "";
}

const emptyDB = () => ({
  customers: [],
  sales: [],
  payments: [],
  expenses: [],
  settings: { companyName: "Amber Trading Co.", openingCash: 50000, invoiceSeq: 1 },
});

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setDb({ ...emptyDB(), ...parsed });
      }
    } catch (e) {
      // no existing data yet
    } finally {
      setLoaded(true);
    }
  }, []);

  const persist = useCallback((nextDb) => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(nextDb));
    } catch (e) {
      console.error("storage save failed", e);
    }
  }, []);

  const updateDb = useCallback(
    (updater) => {
      setDb((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const notify = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  };

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

  const totals = useMemo(() => {
    const totalSales = db.sales.reduce((a, s) => a + Number(s.total), 0);
    const totalCollections = db.payments.reduce((a, p) => a + Number(p.amount), 0);
    const totalExpenses = db.expenses.reduce((a, e) => a + Number(e.amount), 0);
    const totalOutstanding = db.customers.reduce((a, c) => a + customerBalance(c.id), 0);
    const today = todayISO();
    const todaySales = db.sales.filter((s) => s.date === today).reduce((a, s) => a + Number(s.total), 0);
    const todayCollections = db.payments.filter((p) => p.date === today).reduce((a, p) => a + Number(p.amount), 0);
    const todayExpenses = db.expenses.filter((e) => e.date === today).reduce((a, e) => a + Number(e.amount), 0);
    const cashInHand = Number(db.settings.openingCash || 0) + totalCollections - totalExpenses;
    const netCashFlow = totalCollections - totalExpenses;
    const thisMonth = today.slice(0, 7);
    const monthSales = db.sales.filter((s) => monthKey(s.date) === thisMonth).reduce((a, s) => a + Number(s.total), 0);
    const monthExpenses = db.expenses.filter((e) => monthKey(e.date) === thisMonth).reduce((a, e) => a + Number(e.amount), 0);
    return {
      totalSales, totalCollections, totalExpenses, totalOutstanding,
      todaySales, todayCollections, todayExpenses, cashInHand, netCashFlow,
      monthProfit: monthSales - monthExpenses,
    };
  }, [db, customerBalance]);

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
    const sorted = Array.from(dates).sort();
    let bal = Number(db.settings.openingCash || 0);
    return sorted.map((d) => {
      const inAmt = db.payments.filter((p) => p.date === d).reduce((a, p) => a + Number(p.amount), 0);
      const outAmt = db.expenses.filter((e) => e.date === d).reduce((a, e) => a + Number(e.amount), 0);
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
      let sales, settings = prev.settings;
      if (exists) {
        sales = prev.sales.map((s) => (s.id === data.id ? data : s));
      } else {
        const invoiceNo = nextInvoiceNo();
        sales = [...prev.sales, { ...data, id: uid("SAL"), invoiceNo }];
        settings = { ...prev.settings, invoiceSeq: prev.settings.invoiceSeq + 1 };
      }
      return { ...prev, sales, settings };
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

  const saveSettings = (data) => {
    updateDb((prev) => ({ ...prev, settings: { ...prev.settings, ...data } }));
    notify("Settings saved");
  };

  // ---------- auth ----------
  const loginAsAdmin = (u, p) => {
    if (u === "admin" && p === "admin123") {
      setRole("admin");
      setView("dashboard");
      return true;
    }
    return false;
  };

  const loginAsCustomer = (u, p) => {
    const cust = db.customers.find((c) => c.username === u && c.password === p);
    if (cust) {
      setRole("customer");
      setCustomerId(cust.id);
      setView("profile");
      return true;
    }
    return false;
  };

  const logout = () => {
    setRole(null);
    setCustomerId(null);
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
    <div style={{ fontFamily: "'Inter', sans-serif", background: T.paper, minHeight: 600, color: T.ink, transition: "background .2s" }}>
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
          saveCustomer={saveCustomer} deleteCustomer={deleteCustomer}
          saveSale={saveSale} deleteSale={deleteSale}
          savePayment={savePayment} deletePayment={deletePayment}
          saveExpense={saveExpense} deleteExpense={deleteExpense}
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

  const submit = (e) => {
    e.preventDefault();
    const ok = mode === "admin" ? onAdmin(u, p) : onCustomer(u, p);
    if (!ok) setErr("Incorrect username or password.");
  };

  return (
    <div style={{ minHeight: 560, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="lg-display" style={{ fontSize: 28, fontWeight: 600, color: T.ink }}>Ledger &amp; Cash Flow</div>
          <div style={{ fontSize: 13, color: T.slate, marginTop: 4 }}>Customer accounts, sales, payments and cash flow in one book.</div>
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
            <label style={{ fontSize: 12, color: T.slate, fontWeight: 600 }}>Username</label>
            <input className="lg-input" style={{ marginTop: 4, marginBottom: 14 }} value={u} onChange={(e) => setU(e.target.value)} placeholder={mode === "admin" ? "admin" : "e.g. rahim01"} />
            <label style={{ fontSize: 12, color: T.slate, fontWeight: 600 }}>Password</label>
            <input className="lg-input" type="password" style={{ marginTop: 4, marginBottom: 8 }} value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••" />
            {err && <div style={{ color: T.rule, fontSize: 12, marginBottom: 10 }}>{err}</div>}
            {mode === "admin" && <div style={{ fontSize: 11, color: T.slateLight, marginBottom: 14 }}>Demo credentials: admin / admin123</div>}
            <button className="lg-btn" type="submit" style={{ width: "100%", background: T.ink, color: "#fff", justifyContent: "center", padding: "10px 0" }}>
              Sign in
            </button>
          </form>
        </div>
        <button className="lg-btn" onClick={() => setDark(!dark)} style={{ margin: "18px auto 0", background: "transparent", color: T.slate }}>
          {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? "Light mode" : "Dark mode"}
        </button>
      </div>
    </div>
  );
}

// ================= SHELL =================
function Shell({ T, dark, setDark, logout, title, navItems, view, setView, children }) {
  return (
    <div style={{ display: "flex", minHeight: 600 }}>
      <div className="no-print" style={{ width: 220, background: T.ink, color: "#fff", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="lg-display" style={{ fontSize: 18, fontWeight: 600, padding: "0 8px 18px" }}>{title}</div>
        {navItems.map((item) => (
          <button key={item.key} onClick={() => setView(item.key)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none",
              cursor: "pointer", fontSize: 13.5, fontWeight: 500, textAlign: "left",
              background: view === item.key ? "rgba(255,255,255,.12)" : "transparent",
              color: view === item.key ? "#fff" : "rgba(255,255,255,.7)",
            }}>
            <item.icon size={16} /> {item.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setDark(!dark)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, background: "transparent", color: "rgba(255,255,255,.6)" }}>
          {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? "Light mode" : "Dark mode"}
        </button>
        <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13.5, background: "transparent", color: "rgba(255,255,255,.75)" }}>
          <LogOut size={16} /> Log out
        </button>
      </div>
      <div style={{ flex: 1, padding: 24, minWidth: 0 }}>{children}</div>
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

function Card({ T, children, style }) {
  return <div style={{ background: T.paperCard, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18, ...style }}>{children}</div>;
}

function StatCard({ T, label, value, sub, tone }) {
  const color = tone === "danger" ? T.rule : tone === "good" ? T.green : T.ink;
  return (
    <Card T={T} style={{ padding: 14 }}>
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
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "customers", label: "Customers", icon: Users },
    { key: "sales", label: "Sales entry", icon: PackagePlus },
    { key: "payments", label: "Payments", icon: Wallet },
    { key: "expenses", label: "Expenses", icon: Receipt },
    { key: "statements", label: "Statements", icon: ScrollText },
    { key: "cashflow", label: "Cash flow", icon: TrendingUp },
    { key: "reports", label: "Reports", icon: FileBarChart },
    { key: "settings", label: "Settings", icon: Settings },
  ];
  return (
    <Shell T={T} dark={dark} setDark={setDark} logout={logout} title="Admin" navItems={navItems} view={view} setView={setView}>
      {view === "dashboard" && <AdminDashboard {...props} />}
      {view === "customers" && <CustomersPage {...props} />}
      {view === "sales" && <SalesPage {...props} />}
      {view === "payments" && <PaymentsPage {...props} />}
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
    { label: "Total customers", value: db.customers.length, tone: "" },
    { label: "Total sales", value: fmtMoney(totals.totalSales), tone: "" },
    { label: "Total collections", value: fmtMoney(totals.totalCollections), tone: "good" },
    { label: "Total outstanding", value: fmtMoney(totals.totalOutstanding), tone: "danger" },
    { label: "Today's sales", value: fmtMoney(totals.todaySales), tone: "" },
    { label: "Today's collections", value: fmtMoney(totals.todayCollections), tone: "good" },
    { label: "Today's expenses", value: fmtMoney(totals.todayExpenses), tone: "danger" },
    { label: "Cash in hand", value: fmtMoney(totals.cashInHand), tone: "" },
    { label: "Net cash flow", value: fmtMoney(totals.netCashFlow), tone: totals.netCashFlow >= 0 ? "good" : "danger" },
    { label: "Monthly profit / loss", value: fmtMoney(totals.monthProfit), tone: totals.monthProfit >= 0 ? "good" : "danger" },
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
  });
  const total = (Number(f.qty) || 0) * (Number(f.unitPrice) || 0);
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
      <button className="lg-btn" style={{ background: T.ink, color: "#fff", width: "100%", justifyContent: "center" }}
        disabled={!f.customerId || !f.productName}
        onClick={() => onSave({ ...f, qty: Number(f.qty), unitPrice: Number(f.unitPrice), total })}>Save sale</button>
    </ModalShell>
  );
}

function PaymentsPage({ T, db, savePayment, deletePayment }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rows = [...db.payments].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <PageHeader T={T} title="Customer payments" subtitle="Recording a payment reduces the due balance and increases cash in hand"
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

function ReportsPage({ T, db, customerBalance }) {
  const reports = [
    { label: "Sales report", data: () => db.sales.map((s) => ({ Date: fmtDateDMY(s.date), Invoice: s.invoiceNo, Customer: db.customers.find((c) => c.id === s.customerId)?.name || "", Product: s.productName, Qty: s.qty, Total: s.total })), file: "sales-report.csv" },
    { label: "Collection report", data: () => db.payments.map((p) => ({ Date: fmtDateDMY(p.date), Customer: db.customers.find((c) => c.id === p.customerId)?.name || "", Amount: p.amount, Method: p.method, Reference: p.reference })), file: "collection-report.csv" },
    { label: "Expense report", data: () => db.expenses.map((e) => ({ Date: fmtDateDMY(e.date), Category: e.category, Amount: e.amount, Method: e.method, Description: e.description })), file: "expense-report.csv" },
    { label: "Customer due report", data: () => db.customers.map((c) => ({ Customer: c.name, Mobile: c.mobile, Balance: customerBalance(c.id) })), file: "customer-due-report.csv" },
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
    { key: "profile", label: "My profile", icon: Users },
    { key: "statement", label: "Statement", icon: ScrollText },
    { key: "purchases", label: "Purchases", icon: PackagePlus },
    { key: "paymentHistory", label: "Payments", icon: Wallet },
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
