import { useState, useCallback, useEffect, useRef } from "react";

// ── SUPABASE REST CLIENT (sin dependencias externas) ─────
const SUPA_URL = "https://pxqbwxoqjzyadlyivkop.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cWJ3eG9xanp5YWRseWl2a29wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDk3NDYsImV4cCI6MjA5NDAyNTc0Nn0.8PU79Wmr9XnOxWb8otvKS6JUpwY9oaO06xgWUepkbzk";

// Token de sesión en memoria
let _token = null;
let _userId = null;

const headers = (extra = {}) => ({
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${_token || SUPA_KEY}`,
  "Prefer": "return=representation",
  ...extra,
});

// Cliente REST simplificado que imita la API de supabase-js
const supa = {
  auth: {
    signInWithPassword: async ({ email, password }) => {
      const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPA_KEY },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.access_token) {
        _token = data.access_token;
        _userId = data.user?.id;
        return { data: { user: data.user, session: data }, error: null };
      }
      return { data: null, error: { message: data.error_description || data.msg || "Error" } };
    },
    signOut: async () => {
      await fetch(`${SUPA_URL}/auth/v1/logout`, {
        method: "POST", headers: headers(),
      });
      _token = null; _userId = null;
    },
  },
  from: (table) => ({
    select: (cols = "*") => ({
      eq: (col, val) => ({
        single: async () => {
          const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}&select=${cols}`, { headers: headers({ "Accept": "application/vnd.pgrst.object+json" }) });
          const data = await res.json();
          return { data: res.ok ? data : null, error: res.ok ? null : data };
        },
        then: async (cb) => {
          const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}&select=${cols}`, { headers: headers() });
          const data = await res.json();
          return cb({ data: res.ok ? data : null, error: res.ok ? null : data });
        },
      }),
      is: (col, val) => ({
        then: async (cb) => {
          const q = val === null ? `${col}=is.null` : `${col}=is.${val}`;
          const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${q}&select=${cols}`, { headers: headers() });
          const data = await res.json();
          return cb({ data: res.ok ? data : [], error: res.ok ? null : data });
        },
      }),
      order: (col, { ascending = true } = {}) => ({
        limit: (n) => ({
          then: async (cb) => {
            const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${cols}&order=${col}.${ascending ? "asc" : "desc"}&limit=${n}`, { headers: headers() });
            const data = await res.json();
            return cb({ data: res.ok ? data : [], error: res.ok ? null : data });
          },
        }),
        then: async (cb) => {
          const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${cols}&order=${col}.${ascending ? "asc" : "desc"}`, { headers: headers() });
          const data = await res.json();
          return cb({ data: res.ok ? data : [], error: res.ok ? null : data });
        },
      }),
      then: async (cb) => {
        const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${cols}`, { headers: headers() });
        const data = await res.json();
        return cb({ data: res.ok ? data : [], error: res.ok ? null : data });
      },
    }),
    insert: async (body) => {
      const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
        method: "POST", headers: headers(), body: JSON.stringify(body),
      });
      const data = res.status === 204 ? [] : await res.json();
      return { data, error: res.ok ? null : data };
    },
    upsert: async (body) => {
      const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
        method: "POST", headers: headers({ "Prefer": "resolution=merge-duplicates,return=representation" }),
        body: JSON.stringify(body),
      });
      const data = res.status === 204 ? [] : await res.json();
      return { data, error: res.ok ? null : data };
    },
    update: (body) => ({
      eq: (col, val) => ({
        is: (col2, val2) => ({
          then: async (cb) => {
            const q2 = val2 === null ? `${col2}=is.null` : `${col2}=is.${val2}`;
            const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}&${q2}`, {
              method: "PATCH", headers: headers(), body: JSON.stringify(body),
            });
            const data = res.status === 204 ? [] : await res.json();
            return cb({ data, error: res.ok ? null : data });
          },
        }),
        then: async (cb) => {
          const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}`, {
            method: "PATCH", headers: headers(), body: JSON.stringify(body),
          });
          const data = res.status === 204 ? [] : await res.json();
          return cb({ data, error: res.ok ? null : data });
        },
      }),
    }),
    delete: () => ({
      eq: (col, val) => fetch(`${SUPA_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}`, {
        method: "DELETE", headers: headers(),
      }),
    }),
  }),
  // Realtime simplificado (polling cada 10s como fallback)
  channel: (name) => ({
    on: (event, filter, cb) => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    subscribe: () => {},
  }),
  removeChannel: () => {},
};

const today = () => new Date().toISOString().split("T")[0];
const nowISO = () => new Date().toISOString();
const nowTime = () => new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
let pc = 0; const genPId = () => "PER-" + String(++pc).padStart(4, "0");
let ec = 0; const genEId = () => "EMP-" + String(++ec).padStart(3, "0");

const AC = [
  { bg: "#E6F1FB", col: "#185FA5" }, { bg: "#EAF3DE", col: "#3B6D11" },
  { bg: "#FAEEDA", col: "#854F0B" }, { bg: "#E1F5EE", col: "#0F6E56" },
];
const EPP = [
  { key: "lentes", label: "Lentes", icon: "👓" }, { key: "casco", label: "Casco", icon: "⛑️" },
  { key: "chaleco", label: "Chaleco", icon: "🦺" }, { key: "zapatos", label: "Zapatos", icon: "👟" },
];
const DOCS_EQ = ["SOAT", "Revisión técnica", "Permiso de operación"];
const RUBROS = ["Construcción", "Electricidad", "Mantenimiento mecánico", "Izaje y transporte", "Servicios generales", "Seguridad industrial", "Otro"];

function sctrSt(f) {
  if (!f) return "sin";
  const d = (new Date(f) - new Date()) / 86400000;
  return d < 0 ? "vencido" : d <= 30 ? "proximo" : "vigente";
}
function indSt(f) {
  if (!f) return "none";
  const exp = new Date(f); exp.setFullYear(exp.getFullYear() + 1);
  const d = (exp - new Date()) / 86400000;
  return d < 0 ? "vencido" : d <= 30 ? "proximo" : "vigente";
}
function indExp(f) {
  if (!f) return null;
  const d = new Date(f); d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

// ── ESTILOS GLOBALES (estilo Sistema de Autorizaciones) ───
function injectStyles() {
  if (document.getElementById("bk-styles")) return;
  const s = document.createElement("style");
  s.id = "bk-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'IBM Plex Sans',system-ui,sans-serif;background:#eef1f6;color:#0f1923;font-size:14px}
    :root{
      --bg:#eef1f6;--sf:#ffffff;--sf2:#f5f7fa;--sf3:#e4e8f0;
      --bd:rgba(0,0,0,0.08);--bd2:rgba(0,0,0,0.15);
      --tx:#0f1923;--tx2:#374558;--tx3:#6b7a8d;
      --ac:#1a52a0;--ac-bg:rgba(26,82,160,0.07);--ac-bd:rgba(26,82,160,0.25);
      --gn:#15803d;--gn-bg:rgba(21,128,61,0.08);--gn-bd:rgba(21,128,61,0.3);
      --rd:#b91c1c;--rd-bg:rgba(185,28,28,0.07);--rd-bd:rgba(185,28,28,0.3);
      --am:#b45309;--am-bg:rgba(180,83,9,0.07);--am-bd:rgba(180,83,9,0.3);
      --mono:'IBM Plex Mono',monospace;
      --color-background-primary:#ffffff;--color-background-secondary:#f5f7fa;
      --color-background-inverse:#0f1923;--color-text-primary:#0f1923;
      --color-text-secondary:#6b7a8d;--color-text-inverse:#ffffff;
      --color-border-primary:#0f1923;--color-border-secondary:rgba(0,0,0,0.15);
      --color-border-tertiary:rgba(0,0,0,0.08);
    }
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
    input,select,textarea{font-family:'IBM Plex Sans',sans-serif}
  `;
  document.head.appendChild(s);
}
injectStyles();

// ── STYLES ────────────────────────────────────────────────
const SI = { width: "100%", padding: "7px 11px", border: "1px solid var(--bd2)", borderRadius: 8, fontSize: 13, background: "var(--sf2)", color: "var(--tx)", fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
const SC = { background: "var(--sf)", border: "1px solid var(--bd2)", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };
const STH = { textAlign: "left", padding: "8px 12px", fontWeight: 600, fontSize: 10, color: "var(--tx2)", borderBottom: "2px solid var(--bd2)", textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--sf2)", fontFamily: "var(--mono)" };
const STD = { padding: "9px 12px", borderBottom: "1px solid var(--bd)", verticalAlign: "middle", fontSize: 13 };

// Badge estilo Autorizaciones — fondo tenue con borde
const BC = {
  green: ["var(--gn-bg)","var(--gn)","var(--gn-bd)"],
  amber: ["var(--am-bg)","var(--am)","var(--am-bd)"],
  red:   ["var(--rd-bg)","var(--rd)","var(--rd-bd)"],
  blue:  ["var(--ac-bg)","var(--ac)","var(--ac-bd)"],
  gray:  ["var(--sf3)","var(--tx3)","var(--bd2)"],
  teal:  ["rgba(21,128,100,0.08)","#15705a","rgba(21,128,100,0.3)"],
  amber: ["var(--am-bg)","var(--am)","var(--am-bd)"],
};

function Badge({ t = "gray", children }) {
  const [bg, col, bd] = BC[t] || BC.gray;
  return <span style={{ background: bg, color: col, border: "1px solid " + bd, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontFamily: "var(--mono)", fontWeight: 500 }}>{children}</span>;
}
function IDB({ id }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--ac-bg)", color: "var(--ac)", border: "1px solid var(--ac-bd)", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontFamily: "var(--mono)", fontWeight: 500 }}>{id}</span>;
}
function Btn({ c = "def", sm, onClick, disabled, children }) {
  const M = {
    def:   ["var(--sf)","var(--tx2)","var(--bd2)"],
    blue:  ["var(--ac)","#fff","var(--ac)"],
    green: ["var(--gn)","#fff","var(--gn)"],
    red:   ["var(--rd)","#fff","var(--rd)"],
    amber: ["var(--am)","#fff","var(--am)"],
  };
  const [bg, fg, border] = M[c] || M.def;
  return <button onClick={onClick} disabled={disabled} style={{ padding: sm ? "4px 10px" : "7px 14px", fontSize: sm ? 11 : 13, fontWeight: 500, background: bg, color: fg, border: "1px solid " + border, borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, fontFamily: "inherit", whiteSpace: "nowrap" }}>{children}</button>;
}
function Avt({ nombre, color, size = 36 }) {
  const ini = (nombre || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--ac-bg)", color: "var(--ac)", border: "1px solid var(--ac-bd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.floor(size * 0.28), fontWeight: 500, flexShrink: 0, fontFamily: "var(--mono)" }}>{ini}</div>;
}
function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--bd2)", marginBottom: "1.5rem", flexWrap: "wrap" }}>
      {tabs.map(([id, lbl]) => (
        <div key={id} onClick={() => onSelect(id)} style={{ padding: "8px 16px", fontSize: 12, cursor: "pointer", color: active === id ? "var(--ac)" : "var(--tx3)", borderBottom: active === id ? "2px solid var(--ac)" : "2px solid transparent", fontWeight: active === id ? 600 : 400, marginBottom: -1, fontFamily: active === id ? "inherit" : "inherit", letterSpacing: active === id ? "0.01em" : "normal" }}>{lbl}</div>
      ))}
    </div>
  );
}

// ── CONTRATISTAS ──────────────────────────────────────────
function ModContratistas({ empresas, onGuardar, onEstado, userRol, onSolicitarBloqueoEmp }) {
  const [modalEmp, setModalEmp] = useState(null);
  const [modalMotivo, setModalMotivo] = useState("");
  const [modalFecha, setModalFecha] = useState("");
  const [modalSolicitante, setModalSolicitante] = useState("");
  const [tab, setTab] = useState("dir");
  const [editId, setEditId] = useState(null);
  const [busqRuc, setBusqRuc] = useState("");
  const [f, setF] = useState({ ruc: "", razonSocial: "", rubro: "Mantenimiento mecánico", contactoNombre: "", contactoEmail: "", observacion: "" });
  const upd = (k, v) => setF(x => ({ ...x, [k]: v }));
  const lista = Object.values(empresas);
  const listaFiltrada = busqRuc.trim() ? lista.filter(e => e.ruc.includes(busqRuc.trim()) || e.razonSocial.toLowerCase().includes(busqRuc.toLowerCase())) : lista;

  // Permisos por rol
  const puedeCrear = ["admin","safety","almacenes"].includes(userRol);
  const puedeBloquear = ["admin","safety","almacenes"].includes(userRol);
  const esAdmin = userRol === "admin";

  const guardar = () => {
    if (!f.ruc || f.ruc.length < 8) { alert("RUC inválido."); return; }
    if (!f.razonSocial) { alert("Ingresa la razón social."); return; }
    if (!editId && lista.find(e => e.ruc === f.ruc)) { alert("Ya existe una empresa con ese RUC."); return; }
    onGuardar({ ...f, id: editId || genEId(), estado: "activo", fechaReg: today() }, editId);
    setF({ ruc: "", razonSocial: "", rubro: "Mantenimiento mecánico", contactoNombre: "", contactoEmail: "", observacion: "" });
    setEditId(null); setTab("dir");
  };
  const editar = e => { setF({ ruc: e.ruc, razonSocial: e.razonSocial, rubro: e.rubro, contactoNombre: e.contactoNombre || "", contactoEmail: e.contactoEmail || "", observacion: e.observacion || "" }); setEditId(e.id); setTab("form"); };

  const confirmarEmp = () => {
    if (!modalMotivo.trim()) { alert("Escribe el motivo."); return; }
    if (!modalSolicitante.trim()) { alert("Ingresa tu nombre."); return; }
    if (esAdmin) {
      // Admin ejecuta directamente
      onEstado(modalEmp.id, modalEmp.accion, { motivo: modalMotivo, fecha: modalFecha || today(), solicitante: modalSolicitante });
    } else {
      // Otros roles generan solicitud para aprobación del admin
      onSolicitarBloqueoEmp({ empresaId: modalEmp.id, empresaNombre: modalEmp.nombre, accion: modalEmp.accion, motivo: modalMotivo, fecha: modalFecha || today(), solicitante: modalSolicitante, estado: "pendiente", tipo: "empresa" });
    }
    setModalEmp(null); setModalMotivo(""); setModalFecha(""); setModalSolicitante("");
  };

  const tabsDisp = [["dir","Directorio"], ...(puedeCrear ? [["form", editId ? "Editar empresa" : "Nueva empresa"]] : [])];

  return (
    <div>
      {modalEmp && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
          <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, padding:"1.5rem", width:400, maxWidth:"90vw" }}>
            <p style={{ fontWeight:600, fontSize:15, marginBottom:4 }}>{modalEmp.accion === "bloqueado" ? "🚫 Bloquear empresa" : "⚠ Restringir empresa"}</p>
            <p style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:12 }}>{modalEmp.nombre}</p>
            {!esAdmin && <div style={{ padding:"8px 12px", background:"#FAEEDA", borderRadius:8, fontSize:12, color:"#854F0B", marginBottom:12 }}>⚠ Esta acción generará una solicitud de aprobación al Administrador.</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Tu nombre (quien solicita) *</label>
                <input value={modalSolicitante} onChange={e => setModalSolicitante(e.target.value)} placeholder="Nombres y apellidos..." style={{ padding:"7px 10px", border:"0.5px solid var(--color-border-tertiary)", borderRadius:8, fontSize:13, background:"var(--color-background-primary)", color:"var(--color-text-primary)" }} />
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Fecha *</label>
                <input type="date" value={modalFecha} onChange={e => setModalFecha(e.target.value)} style={{ padding:"7px 10px", border:"0.5px solid var(--color-border-tertiary)", borderRadius:8, fontSize:13, background:"var(--color-background-primary)", color:"var(--color-text-primary)" }} />
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Motivo *</label>
                <textarea rows={3} value={modalMotivo} onChange={e => setModalMotivo(e.target.value)} placeholder="Describe el motivo..." style={{ padding:"7px 10px", border:"0.5px solid var(--color-border-tertiary)", borderRadius:8, fontSize:13, background:"var(--color-background-primary)", color:"var(--color-text-primary)", resize:"vertical", fontFamily:"inherit", width:"100%", boxSizing:"border-box" }} />
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={() => { setModalEmp(null); setModalMotivo(""); setModalSolicitante(""); }} style={{ padding:"7px 14px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:8, cursor:"pointer", fontSize:13 }}>Cancelar</button>
                <button onClick={confirmarEmp} style={{ padding:"7px 14px", background: modalEmp.accion === "bloqueado" ? "#A32D2D" : "#854F0B", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:500 }}>{esAdmin ? (modalEmp.accion === "bloqueado" ? "Confirmar bloqueo" : "Confirmar restricción") : "Enviar solicitud"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>Módulo de contratistas</p>
      <TabBar tabs={tabsDisp} active={tab} onSelect={t => { setTab(t); if (t === "dir") { setEditId(null); setF({ ruc: "", razonSocial: "", rubro: "Mantenimiento mecánico", contactoNombre: "", contactoEmail: "", observacion: "" }); } }} />

      {tab === "dir" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: 10, flexWrap: "wrap" }}>
            {/* Cambio 10: Filtro por RUC */}
            <input style={{ ...SI, maxWidth: 280 }} placeholder="Buscar por RUC o razón social..." value={busqRuc} onChange={e => setBusqRuc(e.target.value)} />
            {puedeCrear && <Btn c="blue" sm onClick={() => { setEditId(null); setTab("form"); }}>+ Nueva empresa</Btn>}
          </div>
          {listaFiltrada.length === 0 && <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>{busqRuc ? "Sin resultados para esa búsqueda." : "Sin empresas registradas."}</div>}
          {listaFiltrada.map(e => (
            <div key={e.id} style={{ ...SC, borderLeft: e.estado === "bloqueado" ? "3px solid #A32D2D" : e.estado === "restringido" ? "3px solid #854F0B" : "3px solid #3B6D11" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontWeight: 500 }}>{e.razonSocial}</span>
                    <Badge t={e.estado === "activo" ? "green" : e.estado === "restringido" ? "amber" : "red"}>{e.estado}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>RUC: {e.ruc} — {e.rubro}{e.contactoNombre ? " — " + e.contactoNombre : ""}</div>
                  {e.observacion && <div style={{ marginTop: 6, padding: "6px 10px", background: e.estado === "bloqueado" ? "#FCEBEB" : e.estado === "restringido" ? "#FAEEDA" : "var(--color-background-secondary)", borderRadius: 6, fontSize: 12, color: e.estado === "bloqueado" ? "#A32D2D" : e.estado === "restringido" ? "#854F0B" : "var(--color-text-secondary)" }}>📋 {e.observacion}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Btn sm onClick={() => editar(e)}>✏ Editar</Btn>
                  {puedeBloquear && e.estado === "activo" && <Btn sm c="amber" onClick={() => setModalEmp({ id: e.id, nombre: e.razonSocial, accion: "restringido" })}>⚠ Restringir</Btn>}
                  {puedeBloquear && e.estado !== "bloqueado" && <Btn sm c="red" onClick={() => setModalEmp({ id: e.id, nombre: e.razonSocial, accion: "bloqueado" })}>⛔ Bloquear</Btn>}
                  {e.estado !== "activo" && <Btn sm c="green" onClick={() => onEstado(e.id, "activo", "Acceso reactivado.")}>✔ Reactivar</Btn>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "form" && (
        <div style={SC}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>{editId ? "Editar empresa" : "Nueva empresa contratista"}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["ruc", "RUC *", "20xxxxxxxxx"], ["razonSocial", "Razón social *", "Nombre legal"]].map(([k, lbl, ph]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{lbl}</label>
                <input style={SI} placeholder={ph} value={f[k]} onChange={e => upd(k, e.target.value)} />
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Rubro</label>
              <select style={SI} value={f.rubro} onChange={e => upd("rubro", e.target.value)}>{RUBROS.map(r => <option key={r}>{r}</option>)}</select>
            </div>
            {[["contactoNombre", "Contacto principal", "Nombre"], ["contactoEmail", "Email", "email@empresa.com"]].map(([k, lbl, ph]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{lbl}</label>
                <input style={SI} placeholder={ph} value={f[k]} onChange={e => upd(k, e.target.value)} />
              </div>
            ))}
            <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Observación</label>
              <textarea style={{ ...SI, resize: "vertical" }} rows={2} value={f.observacion} onChange={e => upd("observacion", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "1rem" }}>
            <Btn onClick={() => { setTab("dir"); setEditId(null); }}>Cancelar</Btn>
            <Btn c="blue" onClick={guardar}>{editId ? "Guardar cambios" : "✔ Registrar"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FORMULARIO RECEPCIÓN DE DESPACHO ─────────────────────────────────────────
function FormDespacho({ empresas, onRegistrarDespacho }) {
  const empLista = Object.values(empresas).filter(e => e.estado !== "bloqueado");
  const [empBusq, setEmpBusq] = useState("");
  const [empSel, setEmpSel] = useState(null);
  const [ok, setOk] = useState("");
  const [chofer, setChofer] = useState({ nombre: "", tipoDoc: "DNI", dni: "", tel: "", licencia: "", sctrPoliza: "", sctrVenc: "", sctrAseg: "" });
  const [vehiculo, setVehiculo] = useState({ placa: "", marca: "", soat: "", soatVenc: "", licencia: "", licVenc: "", inspeccion: "", inspVenc: "", seguro: "", segVenc: "" });
  const [mercancia, setMercancia] = useState({ po: "", descripcion: "" });
  const [fechaLlegada, setFechaLlegada] = useState(new Date().toISOString().split("T")[0]);
  const matches = empBusq.length >= 2 ? empLista.filter(e => e.ruc.includes(empBusq) || e.razonSocial.toLowerCase().includes(empBusq.toLowerCase())) : [];
  const updC = (k, v) => setChofer(f => ({ ...f, [k]: v }));
  const updV = (k, v) => setVehiculo(f => ({ ...f, [k]: v }));
  const SI2 = { width: "100%", padding: "7px 11px", border: "1px solid var(--bd2)", borderRadius: 8, fontSize: 13, background: "var(--sf2)", color: "var(--tx)", fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
  const registrar = () => {
    if (!empSel) { alert("Selecciona la empresa (debe tener RUC registrado)."); return; }
    if (!chofer.nombre.trim()) { alert("Ingresa el nombre del chofer."); return; }
    if (!chofer.dni.trim()) { alert("Ingresa el N° de documento del chofer."); return; }
    if (!vehiculo.placa.trim()) { alert("Ingresa la placa del vehículo."); return; }
    if (!mercancia.po.trim()) { alert("Ingresa el N° de PO de la mercancía."); return; }
    if (!mercancia.descripcion.trim()) { alert("Ingresa la descripción de la mercancía."); return; }
    if (!fechaLlegada) { alert("Ingresa la fecha prevista de llegada."); return; }
    onRegistrarDespacho({ id: "DSP-" + String(Date.now()).slice(-4), empresaId: empSel.id, fechaRegistro: fechaLlegada, chofer: { ...chofer }, vehiculo: { ...vehiculo }, mercancia: { ...mercancia }, estado: "Pendiente", guia: "", ingresoHora: "", salidaHora: "" });
    setOk("Despacho registrado. Vigilancia verá la información cuando llegue el vehículo.");
    setEmpSel(null); setEmpBusq("");
    setChofer({ nombre: "", tipoDoc: "DNI", dni: "", tel: "", licencia: "", sctrPoliza: "", sctrVenc: "", sctrAseg: "" });
    setVehiculo({ placa: "", marca: "", soat: "", soatVenc: "", licencia: "", licVenc: "", inspeccion: "", inspVenc: "", seguro: "", segVenc: "" });
    setMercancia({ po: "", descripcion: "" });
    setTimeout(() => setOk(""), 6000);
  };
  return (
    <div>
      <div style={{ padding: "10px 14px", background: "#E6F1FB", border: "1px solid var(--ac-bd)", borderRadius: 10, fontSize: 12, color: "var(--ac)", marginBottom: "1rem" }}>
        🚛 Este sub-módulo es para el <strong>Personal de Almacenes</strong>. Registra el despacho antes de que llegue el vehículo. Vigilancia verá el despacho y le dará ingreso/salida cuando llegue.
      </div>
      {ok && <div style={{ padding: "10px 14px", background: "#EAF3DE", border: "1px solid var(--gn-bd)", borderRadius: 10, fontSize: 12, color: "var(--gn)", marginBottom: "1rem" }}>✅ {ok}</div>}
      {/* Empresa */}
      <div style={SC}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)", marginBottom: 8 }}>1. Empresa (debe tener RUC registrado) *</p>
        {empSel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--sf2)", borderRadius: 8 }}>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 13 }}>{empSel.razonSocial}</div><div style={{ fontSize: 12, color: "var(--tx3)" }}>RUC: {empSel.ruc}</div></div>
            <Btn sm onClick={() => { setEmpSel(null); setEmpBusq(""); }}>Cambiar</Btn>
          </div>
        ) : (
          <div>
            <input style={SI2} placeholder="Buscar por RUC o razón social..." value={empBusq} onChange={e => setEmpBusq(e.target.value)} />
            {empBusq.length >= 2 && matches.length > 0 && (
              <div style={{ border: "1px solid var(--bd2)", borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
                {matches.map(e => (
                  <div key={e.id} onClick={() => { setEmpSel(e); setEmpBusq(""); }} style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid var(--bd)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><div style={{ fontWeight: 500, fontSize: 13 }}>{e.razonSocial}</div><div style={{ fontSize: 11, color: "var(--tx3)" }}>RUC: {e.ruc}</div></div>
                    <Badge t="blue">Seleccionar</Badge>
                  </div>
                ))}
              </div>
            )}
            {empBusq.length >= 2 && matches.length === 0 && <div style={{ fontSize: 12, color: "var(--am)", marginTop: 8 }}>⚠ No encontrada. La empresa debe estar registrada en el módulo Contratistas.</div>}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Fecha prevista de llegada *</label>
          <input type="date" style={SI2} value={fechaLlegada} onChange={e => setFechaLlegada(e.target.value)} />
        </div>
      </div>
      {/* Chofer */}
      <div style={SC}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)", marginBottom: 10 }}>2. Datos del Chofer</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Nombre completo *</label><input style={SI2} value={chofer.nombre} onChange={e => updC("nombre", e.target.value)} placeholder="Nombres y apellidos" /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--tx3)" }}>Tipo de documento</label>
            <select style={SI2} value={chofer.tipoDoc} onChange={e => updC("tipoDoc", e.target.value)}><option value="DNI">DNI</option><option value="CE">CE</option><option value="PAS">PAS</option></select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--tx3)" }}>N° de documento *</label>
            <input style={SI2} value={chofer.dni} onChange={e => updC("dni", e.target.value)} placeholder="N° de documento" />
          </div>
          <div><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Teléfono</label><input style={SI2} value={chofer.tel} onChange={e => updC("tel", e.target.value)} placeholder="+51 9xx xxx xxx" /></div>
          <div><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Licencia de conducir</label><input style={SI2} value={chofer.licencia} onChange={e => updC("licencia", e.target.value)} placeholder="A-IIb, B-IIb..." /></div>
          <div><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>N° póliza SCTR</label><input style={SI2} value={chofer.sctrPoliza} onChange={e => updC("sctrPoliza", e.target.value)} placeholder="SCTR-2026-xxxxx" /></div>
          <div><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Aseguradora SCTR</label><input style={SI2} value={chofer.sctrAseg} onChange={e => updC("sctrAseg", e.target.value)} placeholder="Ej. Rímac" /></div>
          <div><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Vencimiento SCTR</label><input type="date" style={SI2} value={chofer.sctrVenc} onChange={e => updC("sctrVenc", e.target.value)} /></div>
        </div>
      </div>
      {/* Vehículo */}
      <div style={SC}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)", marginBottom: 10 }}>3. Datos del Vehículo</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["placa","Placa *","ABC-123"],["marca","Marca / Modelo","Mercedes Benz"],["soat","N° SOAT",""],["soatVenc","Venc. SOAT","date"],["licencia","N° Licencia de circulación",""],["licVenc","Venc. Licencia","date"],["inspeccion","N° Inspección técnica",""],["inspVenc","Venc. Inspección","date"],["seguro","N° Seguro (póliza)",""],["segVenc","Venc. Seguro","date"]].map(([k, lbl, ph]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--tx3)" }}>{lbl}</label>
              {ph === "date"
                ? <input type="date" style={SI2} value={vehiculo[k]} onChange={e => updV(k, e.target.value)} />
                : <input style={SI2} placeholder={ph} value={vehiculo[k]} onChange={e => updV(k, e.target.value)} />}
            </div>
          ))}
        </div>
      </div>
      {/* Mercancía */}
      <div style={SC}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)", marginBottom: 10 }}>4. Datos de la Mercancía</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>N° de PO (Purchase Order) *</label><input style={SI2} value={mercancia.po} onChange={e => setMercancia(m => ({ ...m, po: e.target.value }))} placeholder="PO-2026-xxxxx" /></div>
          <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Descripción de la mercancía *</label><textarea style={{ ...SI2, resize: "vertical" }} rows={3} value={mercancia.descripcion} onChange={e => setMercancia(m => ({ ...m, descripcion: e.target.value }))} placeholder="Describe el contenido del despacho..." /></div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn c="blue" onClick={registrar}>🚛 Registrar Recepción de Despacho</Btn>
      </div>
    </div>
  );
}

// ── REGISTRO ──────────────────────────────────────────────
function ModRegistro({ empresas, personas, onRegistrar, onActualizarSctr, irAContratistas, user, onRegistrarDespacho }) {
  const [regTab, setRegTab] = useState("nuevo");
  const [sctrBusq, setSctrBusq] = useState("");
  const [nuevaPoliza, setNuevaPoliza] = useState({ poliza: "", aseg: "", vencimiento: "", personas: [], sctrUrl: "", msg: "" });
  const pLista = Object.values(personas || {});
  const [empSel, setEmpSel] = useState(null);
  const [busq, setBusq] = useState("");
  const [rows, setRows] = useState([{ dniQ: "", dniStatus: "idle", nombre: "", cargo: "", tipo: "contratista", tipoDoc: "DNI", existingId: null }]);
  const [form, setForm] = useState({ responsable: "", respEmail: "", respTel: "", tipoVisita: "Contratista - Mantenimiento", fechaIng: today(), diasEnPlanta: 1, poliza: "", aseg: "", sctrFecha: "", sctrUrl: "", registradoPor: "bradken", regNombre: "", regCargo: "" });
  const [emailSim, setEmailSim] = useState(null);
  const [misRegistros, setMisRegistros] = useState([]);  // historial de registros del usuario
  const [editando, setEditando] = useState(null);        // id de persona en edición
  const upd = (k, v) => setForm(x => ({ ...x, [k]: v }));
  const updR = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const empLista = Object.values(empresas);
  const matches = busq.length >= 2 ? empLista.filter(e => e.ruc.includes(busq) || e.razonSocial.toLowerCase().includes(busq.toLowerCase())) : [];

  const registrar = () => {
    // Empresa
    if (!empSel) { alert("Selecciona una empresa."); return; }
    if (empSel.estado === "bloqueado") { alert("Empresa bloqueada. No se puede registrar."); return; }
    // Responsable Bradken
    if (!form.responsable.trim()) { alert("Ingresa el nombre del Responsable Bradken."); return; }
    if (!form.respTel.trim()) { alert("Ingresa el teléfono del Responsable Bradken."); return; }
    // Quién registra
    if (form.registradoPor === "contratista" && !form.regNombre.trim()) { alert("Ingresa el nombre de quien realiza el registro."); return; }
    // Personas
    const val = rows.filter(r => r.dniStatus === "listo");
    if (!val.length) { alert("Debes buscar y confirmar al menos una persona."); return; }
    const sinConfirmar = rows.filter(r => r.dniStatus !== "listo");
    if (sinConfirmar.length > 0) { alert("Tienes " + sinConfirmar.length + " persona(s) sin confirmar. Completa la búsqueda o elimínalas con ✕."); return; }
    // SCTR
    if (!form.poliza.trim()) { alert("Ingresa el N° de póliza SCTR."); return; }
    if (!form.aseg.trim()) { alert("Ingresa la aseguradora del SCTR."); return; }
    if (!form.sctrFecha) { alert("Ingresa la fecha de vencimiento del SCTR."); return; }
    // Fecha prevista
    if (!form.fechaIng) { alert("Ingresa la fecha prevista de ingreso."); return; }

    const result = onRegistrar(empSel, form, val.map(r => ({ ...r, dni: r.dniQ, tipoPersona: r.tipo })));
    const ids = result.personas.map(p => p.id + " — " + p.nombre).join("\n  ");

    // Guardar en historial del usuario
    const nuevoReg = {
      id: result.regId,
      fecha: nowISO(),
      empresa: empSel.razonSocial,
      ruc: empSel.ruc,
      personas: result.personas,
      form: { ...form },
      empId: empSel.id,
    };
    setMisRegistros(prev => [nuevoReg, ...prev]);

    setEmailSim({
      to: form.respEmail || "responsable@bradken.com",
      asunto: "Registro confirmado: " + empSel.razonSocial,
      body: "Estimado/a " + form.responsable + ",\n\nEmpresa: " + empSel.razonSocial + " (RUC: " + empSel.ruc + ")\nFecha prevista: " + form.fechaIng + "\n\nPersonas registradas/actualizadas:\n  " + ids + "\n\nSCTR: " + form.poliza + " — " + form.aseg + " — Vence: " + form.sctrFecha + "\n\nResponsable Bradken: " + form.responsable + " · Tel: " + form.respTel + "\nRegistrado por: " + (form.registradoPor === "bradken" ? form.responsable : form.regNombre + (form.regCargo ? " (" + form.regCargo + ")" : "")) + "\n\nAtentamente,\nControl de Acceso — Bradken Chilca"
    });
    setEmpSel(null); setBusq("");
    setRows([{ dniQ: "", dniStatus: "idle", nombre: "", cargo: "", tipo: "contratista", tipoDoc: "DNI", existingId: null }]);
    setForm({ responsable: "", respEmail: "", respTel: "", tipoVisita: "Contratista - Mantenimiento", fechaIng: today(), diasEnPlanta: 1, poliza: "", aseg: "", sctrFecha: "", sctrUrl: "", registradoPor: "bradken", regNombre: "", regCargo: "" });
  };

  const SI_R = { width:"100%", padding:"7px 10px", border:"0.5px solid var(--color-border-tertiary)", borderRadius:8, fontSize:13, background:"var(--color-background-primary)", color:"var(--color-text-primary)", fontFamily:"inherit", boxSizing:"border-box" };
  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>Registro de ingreso</p>
      <div style={{ display:"flex", borderBottom:"0.5px solid var(--color-border-tertiary)", marginBottom:"1.5rem" }}>
        {[["nuevo","📋 Nuevo registro"],["despacho","🚛 Recepción de Despacho"],["misreg","📁 Mis registros"],["sctr","🔄 Gestionar SCTR"]].map(([id,l]) => (
          <div key={id} onClick={() => setRegTab(id)} style={{ padding:"8px 16px", fontSize:13, cursor:"pointer", color: regTab===id ? "var(--color-text-primary)" : "var(--color-text-secondary)", borderBottom: regTab===id ? "2px solid #185FA5" : "2px solid transparent", fontWeight: regTab===id ? 500 : 400, marginBottom:-0.5 }}>{l}</div>
        ))}
      </div>

      {regTab === "despacho" && (
        <FormDespacho empresas={empresas} onRegistrarDespacho={onRegistrarDespacho} />
      )}

      {regTab === "misreg" && (
        <div>
          {misRegistros.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
              <div>Aún no has realizado ningún registro en esta sesión.</div>
            </div>
          ) : misRegistros.map(reg => {
            const emp = empresas[reg.empId];
            return (
              <div key={reg.id} style={SC}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{reg.empresa}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>RUC: {reg.ruc} · {new Date(reg.fecha).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                      Fecha prevista: {reg.form.fechaIng} · SCTR: {reg.form.poliza || "—"} · Vence: {reg.form.sctrFecha || "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                      Responsable: {reg.form.responsable} · Tel: {reg.form.respTel || "—"}
                    </div>
                  </div>
                  <Badge t="blue">{reg.id}</Badge>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>Personas registradas ({reg.personas.length}):</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {reg.personas.map(p => {
                      const persona = Object.values(personas).find(x => x.id === p.id);
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: 8 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{p.nombre}</span>
                            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 8 }}>{p.id}</span>
                            <Badge t={p.accion === "nuevo" ? "green" : "blue"} >{p.accion === "nuevo" ? "Nuevo" : "Actualizado"}</Badge>
                          </div>
                          {persona && (
                            <Btn sm onClick={() => {
                              // Cargar la persona en modo edición
                              setEmpSel(emp || empresas[persona.empId]);
                              setRows([{
                                dniQ: persona.dni, dniStatus: "listo",
                                nombre: persona.nombre, cargo: persona.cargo,
                                tipo: persona.tipo, existingId: persona.id,
                              }]);
                              setForm({ ...reg.form });
                              setRegTab("nuevo");
                            }}>✏ Editar</Btn>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {regTab === "sctr" && (
        <div>
          <p style={{ fontSize:13, color:"var(--color-text-secondary)", marginBottom:"1rem" }}>Busca una poliza existente por numero para ver y actualizar todas las personas que cubre, o carga una nueva poliza grupal.</p>

          <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, padding:"1.25rem", marginBottom:"1rem" }}>
            <p style={{ fontSize:12, fontWeight:600, color:"var(--color-text-secondary)", marginBottom:8 }}>Buscar poliza existente</p>
            <input style={SI_R} placeholder="Numero de poliza (ej. SCTR-2025-00456)..." value={sctrBusq} onChange={e => setSctrBusq(e.target.value)} />
            {sctrBusq.length >= 3 && (() => {
              const covered = pLista.filter(p => p.sctr && p.sctr.poliza && p.sctr.poliza.toLowerCase().includes(sctrBusq.toLowerCase()));
              if (!covered.length) return <p style={{ fontSize:13, color:"var(--color-text-secondary)", marginTop:8 }}>No se encontro ninguna persona con esa poliza.</p>;
              const sample = covered[0];
              const allOk = covered.every(p => sctrSt(p.sctr.vencimiento) !== "vencido");
              return (
                <div style={{ marginTop:10 }}>
                  <div style={{ padding:"10px 14px", background:"var(--color-background-secondary)", borderRadius:8, marginBottom:10 }}>
                    <div style={{ fontWeight:500, fontSize:13 }}>Poliza: {sample.sctr.poliza} — {sample.sctr.aseguradora}</div>
                    <div style={{ fontSize:12, color: sctrSt(sample.sctr.vencimiento) === "vencido" ? "#A32D2D" : "var(--color-text-secondary)" }}>Vence: {sample.sctr.vencimiento || "—"} {sctrSt(sample.sctr.vencimiento) === "vencido" ? "— VENCIDO" : ""}</div>
                  </div>
                  <p style={{ fontSize:12, fontWeight:600, color:"var(--color-text-secondary)", marginBottom:6 }}>Personas cubiertas ({covered.length}):</p>
                  <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
                    {covered.map(p => (
                      <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:500 }}>{p.nombre}</div>
                          <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>{p.cargo} — {(empresas[p.empId] && empresas[p.empId].razonSocial) || "—"}</div>
                        </div>
                        <span style={{ padding:"3px 8px", borderRadius:6, fontSize:11, fontWeight:500, background: sctrSt(p.sctr.vencimiento) === "vigente" ? "#EAF3DE" : "#FCEBEB", color: sctrSt(p.sctr.vencimiento) === "vigente" ? "#3B6D11" : "#A32D2D" }}>{sctrSt(p.sctr.vencimiento) === "vigente" ? "Vigente" : sctrSt(p.sctr.vencimiento) === "proximo" ? "Por vencer" : "Vencido"}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize:12, fontWeight:600, color:"var(--color-text-secondary)", marginBottom:8 }}>Actualizar SCTR para todas las personas:</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:10 }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>N° de poliza</label><input style={SI_R} defaultValue={sample.sctr.poliza} id="sc_poliza" /></div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Aseguradora</label><input style={SI_R} defaultValue={sample.sctr.aseguradora} id="sc_aseg" /></div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Nueva fecha de vencimiento *</label><input type="date" style={SI_R} id="sc_venc" /></div>
                  </div>
                  <button onClick={() => {
                    const pol = document.getElementById("sc_poliza").value || sample.sctr.poliza;
                    const aseg = document.getElementById("sc_aseg").value || sample.sctr.aseguradora;
                    const venc = document.getElementById("sc_venc").value;
                    if (!venc) { alert("Ingresa la nueva fecha de vencimiento."); return; }
                    covered.forEach(p => onActualizarSctr(p.id, { poliza: pol, aseg: aseg, vencimiento: venc }));
                    setSctrBusq("");
                    alert("SCTR actualizado para " + covered.length + " persona(s).");
                  }} style={{ padding:"8px 16px", background:"#185FA5", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:500 }}>
                    Actualizar SCTR para todas las personas ({covered.length})
                  </button>
                </div>
              );
            })()}
          </div>

          <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, padding:"1.25rem", marginBottom:"1rem" }}>
            <p style={{ fontSize:12, fontWeight:600, color:"var(--color-text-secondary)", marginBottom:4 }}>Cargar nueva póliza SCTR</p>
            <p style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:12 }}>Una sola póliza puede cubrir a varias personas. Busca por nombre o DNI y agrégalas con el botón +.</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>N° de póliza *</label><input style={SI_R} placeholder="SCTR-2025-xxxxx" value={nuevaPoliza.poliza} onChange={e => setNuevaPoliza(p => ({...p, poliza: e.target.value}))} /></div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Aseguradora *</label><input style={SI_R} placeholder="Ej. Pacifico Seguros" value={nuevaPoliza.aseg} onChange={e => setNuevaPoliza(p => ({...p, aseg: e.target.value}))} /></div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Fecha de vencimiento *</label><input type="date" style={SI_R} value={nuevaPoliza.vencimiento} onChange={e => setNuevaPoliza(p => ({...p, vencimiento: e.target.value}))} /></div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Link SCTR en Google Drive</label>
                <input style={{ ...SI_R, borderColor: nuevaPoliza.sctrUrl ? (nuevaPoliza.sctrUrl.includes("drive.google.com") ? "#97C459" : "#F09595") : "var(--color-border-tertiary)" }} placeholder="https://drive.google.com/file/d/..." value={nuevaPoliza.sctrUrl || ""} onChange={e => setNuevaPoliza(p => ({...p, sctrUrl: e.target.value}))} />
                {nuevaPoliza.sctrUrl && nuevaPoliza.sctrUrl.includes("drive.google.com") && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"#EAF3DE", border:"0.5px solid #97C459", borderRadius:6 }}>
                    <span style={{ fontSize:12, color:"#3B6D11", flex:1 }}>✅ Link de Drive registrado — Vigilancia podrá revisarlo.</span>
                    <button onClick={() => window.open(nuevaPoliza.sctrUrl, "_blank")} style={{ padding:"3px 8px", fontSize:11, fontWeight:500, background:"#185FA5", color:"#fff", border:"none", borderRadius:5, cursor:"pointer" }}>Verificar ↗</button>
                  </div>
                )}
                {nuevaPoliza.sctrUrl && !nuevaPoliza.sctrUrl.includes("drive.google.com") && (
                  <div style={{ fontSize:11, color:"#A32D2D", padding:"5px 8px", background:"#FCEBEB", borderRadius:6 }}>⚠ El link no parece ser de Google Drive.</div>
                )}
                {!nuevaPoliza.sctrUrl && <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>💡 Obtén el link del formulario de carga de SCTR y pégalo aquí.</div>}
              </div>
            </div>

            <p style={{ fontSize:12, fontWeight:600, color:"var(--color-text-secondary)", marginBottom:6 }}>Personas que cubre esta póliza ({(nuevaPoliza.personas || []).length} seleccionadas):</p>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              <input style={{ ...SI_R, flex:1 }} placeholder="Buscar por nombre, DNI o ID..." value={nuevaPoliza.busqPer || ""} onChange={e => setNuevaPoliza(p => ({...p, busqPer: e.target.value}))} />
            </div>
            {(nuevaPoliza.busqPer || "").length >= 2 && (() => {
              const q2 = (nuevaPoliza.busqPer || "").toLowerCase();
              const results = pLista.filter(p =>
                p.nombre.toLowerCase().includes(q2) ||
                (p.dni && p.dni.includes(q2)) ||
                p.id.toLowerCase().includes(q2)
              ).slice(0, 8);
              if (!results.length) return <p style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:8 }}>Sin resultados.</p>;
              return (
                <div style={{ border:"0.5px solid var(--color-border-tertiary)", borderRadius:8, overflow:"hidden", marginBottom:12 }}>
                  {results.map(p => {
                    const sel = (nuevaPoliza.personas || []).includes(p.id);
                    const emp = empresas[p.empId];
                    return (
                      <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderBottom:"0.5px solid var(--color-border-tertiary)", background: sel ? "#EAF3DE" : "var(--color-background-primary)" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:500 }}>{p.nombre} <span style={{ fontSize:11, color:"var(--color-text-secondary)", fontWeight:400 }}>· DNI {p.dni || "—"} · {p.id}</span></div>
                          <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>{p.cargo || "Sin cargo"} — {(emp && emp.razonSocial) || "—"}</div>
                        </div>
                        {sel
                          ? <button onClick={() => setNuevaPoliza(prev => ({...prev, personas: (prev.personas || []).filter(x => x !== p.id)}))} style={{ padding:"4px 10px", fontSize:12, fontWeight:500, background:"#A32D2D", color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>✕ Quitar</button>
                          : <button onClick={() => setNuevaPoliza(prev => ({...prev, personas: [...(prev.personas || []), p.id]}))} style={{ padding:"4px 10px", fontSize:12, fontWeight:500, background:"#185FA5", color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>+ Agregar</button>
                        }
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {(nuevaPoliza.personas || []).length > 0 && (
              <div style={{ border:"0.5px solid #97C459", borderRadius:8, padding:"10px 12px", marginBottom:12, background:"#EAF3DE" }}>
                <p style={{ fontSize:12, fontWeight:500, color:"#3B6D11", marginBottom:6 }}>Seleccionados ({(nuevaPoliza.personas || []).length}):</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {(nuevaPoliza.personas || []).map(pid => {
                    const p = pLista.find(x => x.id === pid);
                    if (!p) return null;
                    return (
                      <span key={pid} style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#fff", border:"0.5px solid #97C459", borderRadius:6, padding:"3px 8px", fontSize:12, color:"#3B6D11" }}>
                        {p.nombre}
                        <button onClick={() => setNuevaPoliza(prev => ({...prev, personas: (prev.personas || []).filter(x => x !== pid)}))} style={{ background:"transparent", border:"none", cursor:"pointer", color:"#A32D2D", fontSize:14, lineHeight:1, padding:0 }}>✕</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {nuevaPoliza.msg && <div style={{ padding:"8px 12px", background:"#EAF3DE", borderRadius:8, fontSize:12, color:"#3B6D11", marginBottom:8 }}>{nuevaPoliza.msg}</div>}
            <button onClick={() => {
              if (!nuevaPoliza.poliza || !nuevaPoliza.aseg || !nuevaPoliza.vencimiento) { alert("Completa poliza, aseguradora y fecha."); return; }
              if (!nuevaPoliza.personas || nuevaPoliza.personas.length === 0) { alert("Selecciona al menos una persona."); return; }
              nuevaPoliza.personas.forEach(pid => onActualizarSctr(pid, { poliza: nuevaPoliza.poliza, aseg: nuevaPoliza.aseg, vencimiento: nuevaPoliza.vencimiento }));
              setNuevaPoliza({ poliza: "", aseg: "", vencimiento: "", personas: [], sctrUrl: "", msg: "Póliza asignada a " + nuevaPoliza.personas.length + " persona(s). Vigilancia puede verificarla." });
            }} style={{ padding:"8px 16px", background:"#3B6D11", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:500 }}>
              Asignar poliza a las personas seleccionadas
            </button>
          </div>
        </div>
      )}

      {regTab === "nuevo" && (
      <div>
      <div style={SC}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>Paso 1 — Empresa contratista</p>
        {empSel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--color-background-secondary)", borderRadius: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{empSel.razonSocial}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>RUC: {empSel.ruc} — {empSel.rubro}</div>
            </div>
            <Badge t={empSel.estado === "activo" ? "green" : empSel.estado === "restringido" ? "amber" : "red"}>{empSel.estado}</Badge>
            <Btn sm onClick={() => { setEmpSel(null); setBusq(""); }}>Cambiar</Btn>
          </div>
        ) : (
          <div>
            <input style={{ ...SI, marginBottom: 8 }} placeholder="Buscar por RUC o razón social..." value={busq} onChange={e => setBusq(e.target.value)} />
            {busq.length >= 2 && matches.length > 0 && (
              <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                {matches.map(e => (
                  <div key={e.id} onClick={() => { if (e.estado === "bloqueado") { alert("Empresa bloqueada. " + (e.observacion || "Sin detalle.")); return; } setEmpSel(e); setBusq(""); }} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{e.razonSocial}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>RUC: {e.ruc}</div>
                    </div>
                    <Badge t={e.estado === "activo" ? "green" : e.estado === "restringido" ? "amber" : "red"}>{e.estado}</Badge>
                  </div>
                ))}
              </div>
            )}
            {busq.length >= 2 && matches.length === 0 && (
              <div style={{ padding: "12px 14px", background: "#FAEEDA", border: "0.5px solid #FAC775", borderRadius: 8, fontSize: 13, color: "#854F0B" }}>
                ⚠ RUC o empresa no encontrada en el directorio.<br />
                <span style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                  Contacta al <strong>Administrador</strong> para que registre la empresa antes de continuar. No puedes crear empresas desde este módulo.
                </span>
              </div>
            )}
            {busq.length < 2 && <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Escribe al menos 2 caracteres para buscar.</p>}
          </div>
        )}
        {(empSel && empSel.estado === "restringido") && <div style={{ marginTop: 8, padding: "8px 10px", background: "#FAEEDA", borderRadius: 6, fontSize: 12, color: "#854F0B" }}>⚠ Restricción activa: {empSel.observacion}</div>}
      </div>

      {empSel && (
        <div style={SC}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>Paso 2 — Personas</p>
            <Btn sm onClick={() => setRows(r => [...r, { dniQ: "", dniStatus: "idle", nombre: "", cargo: "", tipo: "contratista", existingId: null }])}>+ Agregar persona</Btn>
          </div>
          {rows.map((r, i) => {
            const updRI = (k, v) => updR(i, k, v);
            const bloqueado = r.dniStatus !== "listo";
            return (
              <div key={i} style={{ border: "0.5px solid " + (r.dniStatus === "existe" ? "#85B7EB" : r.dniStatus === "nuevo" || r.dniStatus === "listo" ? "#97C459" : "var(--color-border-tertiary)"), borderRadius: 10, padding: "1rem", marginBottom: 10 }}>

                {/* — Búsqueda por documento — */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 80 }}>
                    <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Tipo doc.</label>
                    <select style={{ ...SI, padding: "7px 6px" }} value={r.tipoDoc || "DNI"} onChange={e => updRI("tipoDoc", e.target.value)}>
                      <option value="DNI">DNI</option>
                      <option value="CE">CE</option>
                      <option value="PAS">PAS</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>N° de documento *</label>
                    <input
                      style={{ ...SI, borderColor: r.dniStatus === "existe" ? "#85B7EB" : r.dniStatus === "nuevo" ? "#97C459" : "var(--color-border-tertiary)" }}
                      placeholder="Ingresa el número de documento..."
                      value={r.dniQ || ""}
                      onChange={e => {
                        const val = e.target.value.trim();
                        updRI("dniQ", val);
                        updRI("dniStatus", "idle");
                        updRI("existingId", null);
                      }}
                    />
                  </div>
                  <Btn c="blue" sm onClick={() => {
                    const val = (r.dniQ || "").trim();
                    if (val.length < 6) { alert("Ingresa al menos 6 caracteres."); return; }
                    const found = Object.values(personas).find(p => p.dni === val);
                    if (found) {
                      // Persona existente — pre-llenar con sus datos
                      const empFound = empresas[found.empId];
                      updRI("dniStatus", "existe");
                      updRI("existingId", found.id);
                      updRI("nombre", found.nombre);
                      updRI("cargo", found.cargo || "");
                      updRI("tipo", found.tipo || "contratista");
                      updRI("_empAnterior", (empFound && empFound.razonSocial) || "—");
                    } else {
                      updRI("dniStatus", "nuevo");
                      updRI("existingId", null);
                      updRI("nombre", "");
                      updRI("cargo", "");
                    }
                  }}>🔍 Buscar</Btn>
                  {rows.length > 1 && <button onClick={() => setRows(r => r.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#A32D2D", fontSize: 18, lineHeight: 1 }}>✕</button>}
                </div>

                {/* — Banner de resultado — */}
                {r.dniStatus === "existe" && (
                  <div style={{ padding: "8px 12px", background: "#E6F1FB", border: "0.5px solid #85B7EB", borderRadius: 8, fontSize: 12, color: "#185FA5", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🔄</span>
                    <div>
                      <strong>Persona encontrada</strong> — {r._empAnterior}
                      <div style={{ fontSize: 11, marginTop: 2 }}>Los campos están pre-llenados. Edita lo que haya cambiado y confirma.</div>
                    </div>
                    <Btn sm c="blue" onClick={() => updRI("dniStatus", "listo")}>✔ Confirmar</Btn>
                  </div>
                )}
                {r.dniStatus === "nuevo" && (
                  <div style={{ padding: "8px 12px", background: "#EAF3DE", border: "0.5px solid #97C459", borderRadius: 8, fontSize: 12, color: "#3B6D11", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>✨</span>
                    <div><strong>Documento no registrado</strong> — completa los datos y confirma.</div>
                    <Btn sm c="green" onClick={() => { if (!r.nombre.trim()) { alert("Ingresa el nombre."); return; } updRI("dniStatus", "listo"); }}>✔ Confirmar</Btn>
                  </div>
                )}
                {r.dniStatus === "listo" && (
                  <div style={{ padding: "6px 12px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    ✅ <strong>{r.nombre}</strong> · <Badge t="blue">{r.tipoDoc || "DNI"}</Badge> {r.dniQ} · {r.tipo}
                    <button onClick={() => updRI("dniStatus", r.existingId ? "existe" : "nuevo")} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: "#185FA5", textDecoration: "underline" }}>Editar</button>
                  </div>
                )}

                {/* — Formulario de datos (visible mientras no esté en estado listo) — */}
                {r.dniStatus !== "idle" && r.dniStatus !== "listo" && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Categoría</label>
                        <select style={SI} value={r.tipo} onChange={e => updRI("tipo", e.target.value)}>
                          <option value="contratista">Contratista — viene a trabajar, inducción vigente</option>
                          <option value="induccion">Inducción de sitio — primera vez o renovación</option>
                          <option value="visitante">Visita — requiere capacitación virtual Safety</option>
                        </select>
                        {r.tipo === "induccion" && <div style={{ marginTop: 4, padding: "5px 10px", background: "#FAEEDA", borderRadius: 6, fontSize: 11, color: "#854F0B" }}>⚠ Ingresa solo a charla. Si Safety da visto bueno ese día, puede quedarse a trabajar.</div>}
                        {r.tipo === "visitante" && <div style={{ marginTop: 4, padding: "5px 10px", background: "#E6F1FB", borderRadius: 6, fontSize: 11, color: "#185FA5" }}>🖥 Debe completar capacitación virtual antes de ingresar. Safety aprueba el acceso.</div>}
                      </div>
                      <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Nombre completo *</label>
                        <input style={SI} placeholder="Nombre completo" value={r.nombre} onChange={e => updRI("nombre", e.target.value)} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Cargo</label>
                        <input style={SI} placeholder="Cargo o función" value={r.cargo} onChange={e => updRI("cargo", e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
            {/* Responsable Bradken */}
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Responsable Bradken *</label>
              <input style={SI} placeholder="Nombre completo del responsable" value={form.responsable} onChange={e => upd("responsable", e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Email responsable</label>
              <input style={SI} placeholder="responsable@bradken.com" value={form.respEmail} onChange={e => upd("respEmail", e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Teléfono responsable</label>
              <input style={SI} placeholder="+51 9xx xxx xxx" value={form.respTel} onChange={e => upd("respTel", e.target.value)} />
            </div>

            {/* Quién realiza el registro */}
            <div style={{ gridColumn: "1/-1", marginTop: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>¿Quién realiza este registro? *</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[["bradken", "👷 Responsable Bradken"], ["contratista", "🏢 Personal de la empresa"]].map(([val, lbl]) => (
                  <div key={val} onClick={() => {
                    upd("registradoPor", val);
                    if (val === "contratista" && empSel) {
                      upd("regNombre", empSel.contactoNombre || "");
                      upd("regCargo", "Representante");
                    } else if (val === "bradken") {
                      upd("regNombre", form.responsable || "");
                      upd("regCargo", "Responsable Bradken");
                    }
                  }} style={{ flex: 1, padding: "10px 12px", border: "0.5px solid " + (form.registradoPor === val ? "#185FA5" : "var(--color-border-tertiary)"), borderRadius: 8, cursor: "pointer", background: form.registradoPor === val ? "#E6F1FB" : "var(--color-background-primary)", textAlign: "center", fontSize: 13, fontWeight: form.registradoPor === val ? 500 : 400, color: form.registradoPor === val ? "#185FA5" : "var(--color-text-secondary)" }}>
                    {lbl}
                  </div>
                ))}
              </div>
              {form.registradoPor === "bradken" && (
                <div style={{ padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  Registrado por: <strong>{form.responsable || "— (completa el nombre del responsable arriba)"}</strong>
                </div>
              )}
              {form.registradoPor === "contratista" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Nombre quien registra *</label>
                    <input style={SI} placeholder="Nombre del representante" value={form.regNombre} onChange={e => upd("regNombre", e.target.value)} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Cargo</label>
                    <input style={SI} placeholder="Cargo o función" value={form.regCargo} onChange={e => upd("regCargo", e.target.value)} />
                  </div>
                  {empSel && empSel.contactoNombre && (
                    <div style={{ gridColumn: "1/-1", fontSize: 11, color: "#185FA5" }}>
                      💡 Contacto registrado en empresa: <strong>{empSel.contactoNombre}</strong> — <button onClick={() => { upd("regNombre", empSel.contactoNombre); upd("regCargo", "Contacto empresa"); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#185FA5", fontSize: 11, textDecoration: "underline", padding: 0 }}>usar este</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Tipo de visita</label>
              <select style={SI} value={form.tipoVisita} onChange={e => upd("tipoVisita", e.target.value)}>
                {["Contratista - Trabajo en caliente","Contratista - Mantenimiento","Contratista - Construcción","Visita técnica","Proveedor","Visita administrativa"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Fecha prevista de ingreso *</label>
              <input type="date" style={SI} value={form.fechaIng} onChange={e => upd("fechaIng", e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Días en planta *
                <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11 }}>(Inducción = 1 día fijo)</span>
              </label>
              {rows.some(r => r.tipo === "induccion") ? (
                <div style={{ padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: 8, fontSize: 13, color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                  1 día — Inducción de sitio
                </div>
              ) : (
                <input
                  type="number" min={1} max={365}
                  style={SI}
                  value={form.diasEnPlanta}
                  onChange={e => upd("diasEnPlanta", Math.max(1, parseInt(e.target.value) || 1))}
                  placeholder="Ej: 30"
                />
              )}
              {form.fechaIng && form.diasEnPlanta > 0 && (
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                  Vence el {(() => { const d = new Date(form.fechaIng + "T12:00:00"); d.setDate(d.getDate() + (rows.some(r => r.tipo === "induccion") ? 1 : Number(form.diasEnPlanta))); return d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }); })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {empSel && (
        <div style={SC}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Paso 3 — SCTR</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["poliza", "N° de póliza *"], ["aseg", "Aseguradora *"]].map(([k, lbl]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{lbl}</label>
                <input style={SI} value={form[k]} onChange={e => upd(k, e.target.value)} />
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Vencimiento *</label>
              <input type="date" style={SI} value={form.sctrFecha} onChange={e => upd("sctrFecha", e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Link SCTR en Google Drive
                <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--color-text-secondary)", fontSize: 11 }}>(obtenido del formulario de carga)</span>
              </label>
              <input
                style={{ ...SI, borderColor: form.sctrUrl ? (form.sctrUrl.includes("drive.google.com") || form.sctrUrl.includes("docs.google.com") ? "#97C459" : "#F09595") : "var(--color-border-tertiary)" }}
                placeholder="https://drive.google.com/file/d/..."
                value={form.sctrUrl || ""}
                onChange={e => upd("sctrUrl", e.target.value)}
              />
              {/* Sin link */}
              {!form.sctrUrl && (
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", padding: "6px 10px", background: "var(--color-background-secondary)", borderRadius: 6 }}>
                  💡 Usa el <strong>formulario de carga de SCTR</strong> para subir el PDF a Google Drive y obtén el link que aparece al final. Pégalo aquí para que Vigilancia pueda revisarlo.
                </div>
              )}
              {/* Link válido */}
              {form.sctrUrl && (form.sctrUrl.includes("drive.google.com") || form.sctrUrl.includes("docs.google.com")) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#EAF3DE", border: "0.5px solid #97C459", borderRadius: 8 }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#3B6D11" }}>Link de Google Drive registrado</div>
                    <div style={{ fontSize: 11, color: "#5F5E5A" }}>Vigilancia verá el botón "📄 Ver SCTR en Drive" en Programados</div>
                  </div>
                  <button
                    onClick={() => window.open(form.sctrUrl, "_blank")}
                    style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: "#185FA5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
                    Verificar ↗
                  </button>
                </div>
              )}
              {/* Link inválido */}
              {form.sctrUrl && !form.sctrUrl.includes("drive.google.com") && !form.sctrUrl.includes("docs.google.com") && (
                <div style={{ fontSize: 11, color: "#A32D2D", padding: "6px 10px", background: "#FCEBEB", borderRadius: 6 }}>
                  ⚠ El link no parece ser de Google Drive. Verifica que sea el link correcto del formulario de carga.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {empSel && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}><Btn c="blue" onClick={registrar}>✔ Confirmar registro</Btn></div>}

      {emailSim && (
        <div style={{ background: "var(--color-background-secondary)", borderLeft: "3px solid #185FA5", borderRadius: "0 8px 8px 0", padding: "1rem" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 8 }}>📧 Correo simulado → {emailSim.to}</div>
          <strong>Asunto:</strong> {emailSim.asunto}<br /><br />
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{emailSim.body}</pre>
        </div>
      )}
      </div>
      )}
    </div>
  );
}

// ── VIGILANCIA ────────────────────────────────────────────
function ModVigilancia({ personas, empresas, accesos, equipos, herramientas, despachos, setDespachos, onIngreso, onSalida, onEPP, onAddEq, onSalEq, onAddHer, onSalHer, onShowQR, onVistoBuenoSctr, onInspeccion, onSolicitarBloqueo }) {
  const [tab, setTab] = useState("programados");
  const [agenteNombre, setAgenteNombre] = useState("");
  const [agenteConfirmado, setAgenteConfirmado] = useState(false);
  const [modalAgente, setModalAgente] = useState(null); // { accion, onConfirm }
  const [q, setQ] = useState("");
  const [eqF, setEqF] = useState({ desc: "", serie: "", empId: "", opDni: "", opId: "", docs: { SOAT: false, "Revisión técnica": false, "Permiso de operación": false } });
  const [showEq, setShowEq] = useState(false);
  const [hItems, setHItems] = useState([{ desc: "", cant: 1 }]);
  const [hOperador, setHOperador] = useState("");
  const [showH, setShowH] = useState(false);
  const [salidaFlujo, setSalidaFlujo] = useState({});  // pid -> "maq"|"her"|"confirm"|null
  const [incidentesIngreso, setIncidentesIngreso] = useState([]);
  const [incidenteForm, setIncidenteForm] = useState({ dniQ: "", personaId: "", nombre: "", empresa: "", causas: { epp: false, alcohol: false, armas: false, otro: false }, detalle: "" });
  const [incidenteTab, setIncidenteTab] = useState("registrar");
  const [salidaConfs, setSalidaConfs] = useState({});  // pid -> { maqOk, herOk: {hid: bool} }
  const [sctrVisto, setSctrVisto] = useState({}); // pid -> true cuando abrió el PDF
  const [inspecPaso, setInspecPaso] = useState({});
  const [inspecData, setInspecData] = useState({});
  // maquinaria y herramientas vinculadas por persona (durante el flujo)
  const [flujoEq, setFlujoEq] = useState({});   // pid -> { desc, serie, docs }
  const [flujoHer, setFlujoHer] = useState({});  // pid -> [{ desc, cant }]
  const [flujoQ, setFlujoQ] = useState({});      // pid -> { traeMaq: null, traeHer: null }

  // Helper: pide nombre del agente antes de ejecutar una acción
  const conAgente = (descripcion, onConfirm) => {
    if (agenteConfirmado && agenteNombre.trim()) {
      onConfirm(agenteNombre);
    } else {
      setModalAgente({ descripcion, onConfirm });
    }
  };

  const pLista = Object.values(personas);
  const empActivas = Object.values(empresas).filter(e => e.estado !== "bloqueado");
  const opsDisp = eqF.empId ? pLista.filter(p => p.empId === eqF.empId) : pLista;
  const matches = q.length > 1 ? pLista.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()) || (p.dni && p.dni.includes(q)) || ((empresas[p.empId] && empresas[p.empId].razonSocial) || "").toLowerCase().includes(q.toLowerCase())) : [];
  const activos = accesos.filter(a => !a.salida);

  // Helpers de inspección local
  const getPaso = (pid) => inspecPaso[pid] || "sctr";
  const getData = (pid) => inspecData[pid] || { epp: { lentes: false, casco: false, chaleco: false, zapatos: false, ropa: false }, alcohol: null, objetos: { armas: false, otros: false } };
  const setPaso = (pid, paso) => setInspecPaso(p => ({ ...p, [pid]: paso }));
  const setData = (pid, fn) => setInspecData(p => ({ ...p, [pid]: fn(getData(pid)) }));

  // ── MÓDULO PROGRAMADOS ────────────────────────────────────
  const TabProgramados = () => {
    const hoy = today();
    const enPlantaIds = new Set(accesos.filter(a => !a.salida).map(a => a.pid));

    // Solo personas que AÚN NO han ingresado
    const programados = pLista
      .filter(p => !enPlantaIds.has(p.id))
      .sort((a, b) => {
        if (!a.fechaPrevista && !b.fechaPrevista) return 0;
        if (!a.fechaPrevista) return 1;
        if (!b.fechaPrevista) return -1;
        return a.fechaPrevista.localeCompare(b.fechaPrevista);
      });

    const pasados  = programados.filter(p => p.fechaPrevista && p.fechaPrevista < hoy);
    const hoyL     = programados.filter(p => p.fechaPrevista === hoy);
    const proximos = programados.filter(p => p.fechaPrevista && p.fechaPrevista > hoy);
    const sinFecha = programados.filter(p => !p.fechaPrevista);

    const Row = ({ p, highlight }) => {
      const emp = empresas[p.empId];
      const sc = sctrSt(p.sctr && p.sctr.vencimiento);
      const BADGE_TIPO = { contratista: ["blue","Contratista"], induccion: ["amber","Inducción de sitio"], visitante: ["teal","Visita"] };
      const [bt, bl] = BADGE_TIPO[p.tipo] || ["gray", p.tipo];
      const sctrOk = p.sctrVerificado;
      const borde = highlight === "hoy" ? "#185FA5" : highlight === "pasado" ? "#A32D2D" : "var(--color-border-tertiary)";
      return (
        <div style={{ ...SC, borderLeft: "3px solid " + borde, opacity: highlight === "pasado" ? 0.75 : 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Avt nombre={p.nombre} color={p.color} size={40} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{p.nombre}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{p.cargo || "—"} · {(emp && emp.razonSocial) || "—"} · {p.tipoDoc || "DNI"} {p.dni || "—"}</div>
              <div style={{ marginTop: 4, display: "flex", gap: 5, flexWrap: "wrap" }}>
                <Badge t={bt}>{bl}</Badge>
                {p.fechaPrevista && (
                  <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, fontWeight: 500,
                    background: highlight === "hoy" ? "#E6F1FB" : highlight === "pasado" ? "#FCEBEB" : "var(--color-background-secondary)",
                    color: highlight === "hoy" ? "#185FA5" : highlight === "pasado" ? "#A32D2D" : "var(--color-text-secondary)" }}>
                    📅 {p.fechaPrevista}
                  </span>
                )}
              </div>
            </div>
            {/* Acción SCTR */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              {/* Botón Ver SCTR — abre en Drive */}
              <button onClick={() => {
                setSctrVisto(prev => ({ ...prev, [p.id]: true }));
                const url = p.sctr && p.sctr.url;
                if (url) window.open(url, "_blank");
              }} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 500, background: (p.sctr && p.sctr.url) ? "#185FA5" : "var(--color-background-secondary)", color: (p.sctr && p.sctr.url) ? "#fff" : "var(--color-text-secondary)", border: "0.5px solid " + ((p.sctr && p.sctr.url) ? "#185FA5" : "var(--color-border-secondary)"), borderRadius: 8, cursor: (p.sctr && p.sctr.url) ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6 }}>
                📄 {(p.sctr && p.sctr.url) ? "Ver SCTR en Drive" : "Sin link de SCTR"}
              </button>
              {/* Check de conformidad — solo si ya abrió el link */}
              {sctrOk
                ? <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", fontWeight: 500 }}>✅ SCTR conforme</div>
                : sctrVisto[p.id]
                  ? (
                    <button onClick={() => conAgente("Verificar SCTR de " + p.nombre, (agente) => onVistoBuenoSctr(p.id, agente))} disabled={sc === "vencido"} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 500, background: sc === "vencido" ? "#A32D2D" : "#3B6D11", color: "#fff", border: "none", borderRadius: 8, cursor: sc === "vencido" ? "not-allowed" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span>☑ Marcar SCTR conforme</span>
                      {sc === "vencido" && <span style={{ fontSize: 10, opacity: 0.85 }}>Vencido — no puede ingresar</span>}
                    </button>
                  )
                  : <div style={{ fontSize: 11, color: "var(--color-text-secondary)", textAlign: "right", maxWidth: 160 }}>{(p.sctr && p.sctr.url) ? "Abre el SCTR para poder marcarlo como conforme" : "Pide el link de SCTR al coordinador"}</div>

              }
            </div>
          </div>
          {/* Detalle SCTR + Responsable */}
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, fontSize: 12, padding: "8px 12px", background: sctrOk ? "#EAF3DE" : "var(--color-background-secondary)", borderRadius: 8, border: "0.5px solid " + (sctrOk ? "#97C459" : "var(--color-border-tertiary)") }}>
            <div><span style={{ color: "var(--color-text-secondary)" }}>Póliza: </span><strong>{(p.sctr && p.sctr.poliza) || "—"}</strong></div>
            <div><span style={{ color: "var(--color-text-secondary)" }}>Aseguradora: </span>{(p.sctr && p.sctr.aseguradora) || "—"}</div>
            <div><span style={{ color: "var(--color-text-secondary)" }}>Vence: </span>
              <span style={{ color: sc === "vencido" ? "#A32D2D" : sc === "proximo" ? "#854F0B" : "#3B6D11", fontWeight: 500 }}>
                {(p.sctr && p.sctr.vencimiento) || "—"}
              </span>
            </div>
            {p.respBradken && p.respBradken.nombre && (
              <>
                <div style={{ gridColumn: "1/-1", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 6, marginTop: 2 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Responsable Bradken: </span>
                  <strong>{p.respBradken.nombre}</strong>
                  {p.respBradken.tel && <span> · <a href={"tel:" + p.respBradken.tel} style={{ color: "#185FA5", textDecoration: "none" }}>📞 {p.respBradken.tel}</a></span>}
                  {p.respBradken.email && <span style={{ color: "var(--color-text-secondary)" }}> · {p.respBradken.email}</span>}
                </div>
                {p.registradoPor && p.registradoPor.nombre && (
                  <div style={{ gridColumn: "1/-1", fontSize: 11, color: "var(--color-text-secondary)" }}>
                    Registrado por: {p.registradoPor.nombre}{p.registradoPor.cargo ? " (" + p.registradoPor.cargo + ")" : ""}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    };

    const total = programados.length;
    return (
      <div>
        <div style={{ display: "flex", gap: 10, marginBottom: "1rem", fontSize: 12, color: "var(--color-text-secondary)" }}>
          <span>{total} persona{total !== 1 ? "s" : ""} pendiente{total !== 1 ? "s" : ""} de ingresar</span>
          <span>·</span>
          <span style={{ color: "#3B6D11" }}>{programados.filter(p => p.sctrVerificado).length} con SCTR verificado</span>
          <span>·</span>
          <span style={{ color: "#854F0B" }}>{programados.filter(p => !p.sctrVerificado).length} pendientes</span>
        </div>
        {hoyL.length > 0 && (<>
          <p style={{ fontSize: 13, fontWeight: 500, color: "#185FA5", marginBottom: 8 }}>📅 Hoy ({hoyL.length})</p>
          {hoyL.map(p => <Row key={p.id} p={p} highlight="hoy" />)}
        </>)}
        {proximos.length > 0 && (<>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginTop: 16, marginBottom: 8 }}>🔜 Próximos ({proximos.length})</p>
          {proximos.map(p => <Row key={p.id} p={p} highlight="proximo" />)}
        </>)}
        {pasados.length > 0 && (<>
          <p style={{ fontSize: 13, fontWeight: 500, color: "#A32D2D", marginTop: 16, marginBottom: 8 }}>⚠ Fecha pasada sin ingresar ({pasados.length})</p>
          {pasados.map(p => <Row key={p.id} p={p} highlight="pasado" />)}
        </>)}
        {sinFecha.length > 0 && (<>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginTop: 16, marginBottom: 8 }}>Sin fecha prevista ({sinFecha.length})</p>
          {sinFecha.map(p => <Row key={p.id} p={p} highlight="" />)}
        </>)}
        {total === 0 && <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>✅ Todas las personas registradas están en planta o ya salieron.</div>}
      </div>
    );
  };

  const PCard = ({ p }) => {
    const emp = empresas[p.empId];
    const acc = accesos.find(a => a.pid === p.id && !a.salida);
    const sc = sctrSt((p.sctr && p.sctr.v) || (p.sctr && p.sctr.vencimiento));
    const ind = indSt(p.ind || p.induccion);
    const tipo = p.tipo;
    const paso = getPaso(p.id);
    const data = getData(p.id);
    const fq = flujoQ[p.id] || { traeMaq: null, traeHer: null };
    const feq = flujoEq[p.id] || { desc: "", serie: "", docs: { SOAT: false, "Revisión técnica": false, "Permiso de operación": false } };
    const fher = flujoHer[p.id] || [{ desc: "", cant: 1 }];

    const setFQ = (k, v) => setFlujoQ(prev => ({ ...prev, [p.id]: { ...(prev[p.id] || {}), [k]: v } }));
    const setFEq = (upd) => setFlujoEq(prev => ({ ...prev, [p.id]: { ...(prev[p.id] || feq), ...upd } }));
    const setFEqDoc = (d) => setFlujoEq(prev => ({ ...prev, [p.id]: { ...(prev[p.id] || feq), docs: { ...(prev[p.id] || feq).docs, [d]: !(prev[p.id] || feq).docs[d] } } }));
    const setFHer = (fn) => setFlujoHer(prev => ({ ...prev, [p.id]: fn(prev[p.id] || fher) }));

    const BADGE_TIPO = { contratista: ["blue","Contratista"], induccion: ["amber","Inducción de sitio"], visitante: ["teal","Visita"] };
    const [badgeT, badgeL] = BADGE_TIPO[tipo] || ["gray", tipo];

    const eppKeys = ["lentes","casco","chaleco","zapatos","ropa"];
    const eppLabels = { lentes: "👓 Lentes", casco: "⛑ Casco", chaleco: "🦺 Chaleco", zapatos: "👟 Zapatos de seguridad", ropa: "👕 Ropa en buen estado" };
    const eppOk = eppKeys.every(k => data.epp[k]);
    const alcoholOk = data.alcohol === "negativo";
    const objetosOk = !data.objetos.armas && !data.objetos.otros;

    // ── PASOS DINÁMICOS SEGÚN CATEGORÍA ──────────────────────
    // Maquinaria y Herramientas se gestionan en sus propios módulos
    const PASOS = ["sctr","autorizar","done"];
    const pasoIdx = PASOS.indexOf(paso);

    // ── BLOQUEOS ABSOLUTOS (impiden iniciar el flujo) ────────
    const indOk = ind === "vigente" || ind === "proximo";
    const capOk = !!(p.cap || p.capacitacionVirtual);
    const personaBloqueada = p.bloqueado === true;
    const empresaBloqueada = (emp && emp.estado) === "bloqueado";

    // Vencimiento de días en planta
    const plantaVencida = (() => {
      if (!p.fechaVencPlanta) return false;
      return new Date(p.fechaVencPlanta + "T23:59:59") < new Date();
    })();
    const diasRestantes = (() => {
      if (!p.fechaVencPlanta) return null;
      return Math.ceil((new Date(p.fechaVencPlanta + "T23:59:59") - new Date()) / 86400000);
    })();
    const empresaRestringida = (emp && emp.estado) === "restringido";

    const bloqueosAbsolutos = (() => {
      const lista = [];
      if (personaBloqueada) lista.push({ icon: "🚫", color: "#A32D2D", bg: "#FCEBEB", msg: "Trabajador suspendido.", sub: p.motivoBloqueo ? "Motivo: " + p.motivoBloqueo : "Solicitar detalles al Administrador." });
      if (empresaBloqueada) lista.push({ icon: "⛔", color: "#A32D2D", bg: "#FCEBEB", msg: "Empresa bloqueada.", sub: (emp.observacion || "Sin detalle.") });
      if (plantaVencida) lista.push({ icon: "📅", color: "#854F0B", bg: "#FAEEDA", msg: "Registro vencido — días en planta agotados.", sub: "Venció el " + p.fechaVencPlanta + ". Debe pasar por Registro nuevamente para renovar su autorización." });
      // Cambio 5: Bloqueo por fecha prevista de ingreso
      if (p.fechaPrevista && p.fechaPrevista > today()) lista.push({ icon: "🔒", color: "#854F0B", bg: "#FAEEDA", msg: "Ingreso no habilitado aún.", sub: "La fecha de ingreso registrada es " + p.fechaPrevista + ". No puede ingresar antes de esa fecha." });
      // Cambio 4: Bloqueo por SCTR
      if (!p.sctr || !p.sctr.poliza) lista.push({ icon: "📋", color: "#A32D2D", bg: "#FCEBEB", msg: "Sin SCTR registrado.", sub: "La persona no tiene póliza SCTR en el sistema. El coordinador debe registrarla antes de ingresar." });
      else if (sc === "vencido") lista.push({ icon: "📋", color: "#A32D2D", bg: "#FCEBEB", msg: "SCTR vencido — no puede ingresar.", sub: "Venció el " + (p.sctr.vencimiento || "—") + ". El coordinador debe actualizar la póliza." });
      else if (!p.sctrVerificado) lista.push({ icon: "📋", color: "#854F0B", bg: "#FAEEDA", msg: "SCTR no verificado por Vigilancia.", sub: "El agente de vigilancia debe verificar el documento SCTR en la pestaña Programados antes de autorizar el ingreso." });
      // Cambio 4: Bloqueo por inducción
      if (tipo === "contratista" && !indOk) lista.push({ icon: "📋", color: "#854F0B", bg: "#FAEEDA", msg: "Sin inducción de sitio vigente.", sub: ind === "vencido" ? "Vencida — debe renovar con Safety." : "Sin inducción registrada — debe completar la charla primero." });
      if (tipo === "visitante" && !capOk) lista.push({ icon: "🖥", color: "#854F0B", bg: "#FAEEDA", msg: "Sin aprobación de curso virtual.", sub: "Safety debe aprobar la capacitación virtual antes del ingreso." });
      return lista;
    })();

    const hayBloqueoAbsoluto = bloqueosAbsolutos.length > 0;

    // ── PRE-REQUISITOS DE INGRESO (usados solo en paso autorizar) ──
    const bloqueoPorCategoria = { bloqueado: false, msg: "" }; // ya manejado en bloqueosAbsolutos

    const siguientePaso = (actual) => {
      const idx = PASOS.indexOf(actual);
      return PASOS[idx + 1] || "done";
    };
    const anteriorPaso = (actual) => {
      const idx = PASOS.indexOf(actual);
      return PASOS[idx - 1] || "sctr";
    };

    const resetFlujo = () => {
      setPaso(p.id, "sctr");
      setData(p.id, () => ({ epp: { lentes: false, casco: false, chaleco: false, zapatos: false, ropa: false }, alcohol: null, objetos: { armas: false, otros: false } }));
      setFlujoQ(prev => ({ ...prev, [p.id]: { traeMaq: null, traeHer: null } }));
      setFlujoEq(prev => ({ ...prev, [p.id]: { desc: "", serie: "", docs: { SOAT: false, "Revisión técnica": false, "Permiso de operación": false } } }));
      setFlujoHer(prev => ({ ...prev, [p.id]: [{ desc: "", cant: 1 }] }));
    };

    const PASO_LABELS = { sctr: "SCTR", epp: "EPP", alcohol: "Alcohol", objetos: "Objetos", maquinaria: "Maquinaria", herramientas: "Herramientas", autorizar: "Ingreso", done: "Listo" };

    const StepBar = () => (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(" + PASOS.length + ",1fr)", gap: 3, marginBottom: 14 }}>
        {PASOS.map((key, idx) => (
          <div key={key} style={{ textAlign: "center", fontSize: 9, fontWeight: 500, padding: "3px 1px", borderRadius: 5,
            background: pasoIdx > idx ? "#EAF3DE" : pasoIdx === idx ? "#E6F1FB" : "var(--color-background-secondary)",
            color: pasoIdx > idx ? "#3B6D11" : pasoIdx === idx ? "#185FA5" : "var(--color-text-secondary)",
            border: pasoIdx === idx ? "0.5px solid #85B7EB" : "0.5px solid transparent" }}>
            {pasoIdx > idx ? "✓" : PASO_LABELS[key]}
          </div>
        ))}
      </div>
    );

    return (
      <div style={{ ...SC, borderLeft: (emp && emp.estado) === "bloqueado" ? "3px solid #A32D2D" : tipo === "induccion" ? "3px solid #D88C30" : "none" }}>
        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Avt nombre={p.nombre} color={p.color} size={48} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 15 }}>{p.nombre}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{p.cargo || "Sin cargo"} · {(emp && emp.razonSocial) || "—"} · {p.tipoDoc || "DNI"} {p.dni || "—"}</div>
            <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Badge t={badgeT}>{badgeL}</Badge>
              <IDB id={p.id} />
              {emp && <Badge t={emp.estado === "activo" ? "green" : emp.estado === "restringido" ? "amber" : "red"}>{emp.estado}</Badge>}
            </div>
          </div>
          <button onClick={() => onShowQR(p)} style={{ background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, padding: "5px 8px", cursor: "pointer", fontSize: 16 }}>🪪</button>
        </div>

        {(emp && emp.estado) === "restringido" && <div style={{ padding: "8px 12px", background: "#FAEEDA", borderRadius: 8, fontSize: 12, color: "#854F0B", marginBottom: 10 }}>⚠ Restricción en empresa: {emp.observacion}</div>}

        {/* Si ya está en planta */}
        {acc ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", background: "#EAF3DE", borderRadius: 8 }}>
            <Btn c="red" sm onClick={() => onSalida(p.id)}>🚪 Registrar salida</Btn>
            <Badge t={acc.tipoIngreso === "Trabajos en planta" ? "green" : acc.tipoIngreso === "Inducción de sitio" ? "amber" : "blue"}>{acc.tipoIngreso}</Badge>
            {acc.tipoIngreso === "Inducción de sitio" && (ind === "vigente" || ind === "proximo") && (
              <Btn c="green" sm onClick={() => onIngreso(p.id, "Trabajos en planta")}>🔧 Safety aprobó — pasar a Trabajos</Btn>
            )}
          </div>
        ) : hayBloqueoAbsoluto ? (
          /* Panel de bloqueos — impide iniciar el flujo */
          <div>
            {bloqueosAbsolutos.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", background: b.bg, border: "0.5px solid " + b.color + "55", borderRadius: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{b.icon}</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13, color: b.color }}>{b.msg}</div>
                  <div style={{ fontSize: 12, color: b.color, opacity: 0.85 }}>{b.sub}</div>
                </div>
              </div>
            ))}
            {/* Botón solicitar suspensión solo si NO está ya bloqueado */}
            {!personaBloqueada && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: 8 }}>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>¿Necesitas reportar un incidente o solicitar la suspensión de este trabajador?</p>
                <Btn c="red" sm onClick={() => onSolicitarBloqueo(p.id, { nombre: p.nombre, motivo: "", fecha: today(), solicitante: "Vigilancia" })}>🚫 Solicitar suspensión al Administrador</Btn>
              </div>
            )}
          </div>
        ) : (emp && emp.estado) === "bloqueado" ? null : (
          <div>
            {/* Banner de pre-requisito bloqueante */}
            {bloqueoPorCategoria.bloqueado && (
              <div style={{ padding: "12px 14px", background: "#FCEBEB", border: "0.5px solid #F09595", borderRadius: 8, fontSize: 12, color: "#A32D2D", marginBottom: 12 }}>
                {bloqueoPorCategoria.msg}
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85 }}>
                  {tipo === "contratista" && "Safety debe confirmar el visto bueno de inducción antes de que esta persona pueda ingresar a trabajos."}
                  {tipo === "visitante" && "Safety debe aprobar el curso virtual antes de autorizar el ingreso."}
                </div>
              </div>
            )}
            <StepBar />

            {/* PASO 1: SCTR */}
            {paso === "sctr" && (
              <div style={SC}>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>1. Verificación de SCTR</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, marginBottom: 12 }}>
                  <div><span style={{ color: "var(--color-text-secondary)" }}>Póliza: </span><strong>{(p.sctr && p.sctr.poliza) || "—"}</strong></div>
                  <div><span style={{ color: "var(--color-text-secondary)" }}>Aseguradora: </span>{(p.sctr && p.sctr.aseguradora) || "—"}</div>
                  <div><span style={{ color: "var(--color-text-secondary)" }}>Vencimiento: </span>
                    <span style={{ color: sc === "vencido" ? "#A32D2D" : sc === "proximo" ? "#854F0B" : "#3B6D11", fontWeight: 500 }}>
                      {(p.sctr && p.sctr.vencimiento) || "—"}
                    </span>
                  </div>
                  <div><Badge t={sc === "vigente" ? "green" : sc === "proximo" ? "amber" : "red"}>{sc === "vigente" ? "Vigente" : sc === "proximo" ? "Por vencer" : "Vencido / Sin SCTR"}</Badge></div>
                </div>
                {p.sctrVerificado
                  ? (
                    <div style={{ padding: "8px 12px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", marginBottom: 10 }}>
                      ✅ SCTR verificado en Programados — se omite esta confirmación.
                    </div>
                  )
                  : sc === "vencido"
                    ? <div style={{ padding: "8px 12px", background: "#FCEBEB", borderRadius: 8, fontSize: 12, color: "#A32D2D", marginBottom: 10 }}>⛔ SCTR vencido. No puede ingresar hasta renovar.</div>
                    : null
                }
                {/* Botón Ver SCTR en Drive */}
                {(p.sctr && p.sctr.url) && (
                  <button onClick={() => { setSctrVisto(prev => ({ ...prev, [p.id]: true })); window.open(p.sctr.url, "_blank"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#E6F1FB", color: "#185FA5", border: "0.5px solid #85B7EB", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 500, marginBottom: 10 }}>📄 Ver SCTR en Google Drive ↗</button>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  {p.sctrVerificado
                    ? <Btn c="green" onClick={() => setPaso(p.id, siguientePaso("sctr"))}>Continuar →</Btn>
                    : sc !== "vencido"
                      ? <Btn c="green" onClick={() => conAgente("Verificar SCTR de " + p.nombre, (agente) => { onVistoBuenoSctr(p.id, agente); setPaso(p.id, siguientePaso("sctr")); })}>☑ SCTR conforme — continuar</Btn>
                      : <Btn c="amber" onClick={() => setPaso(p.id, siguientePaso("sctr"))}>Continuar con observación</Btn>
                  }
                </div>
              </div>
            )}

            {/* EPP/ALCOHOL/ARMAS se gestionan ahora en "Incidente de Ingreso" */}

            {paso === "autorizar" && (
              <div style={SC}>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
                  {PASOS.indexOf("autorizar") + 1}. Autorizar ingreso
                </p>

                {/* Resumen de lo verificado */}
                <div style={{ padding: "10px 14px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", marginBottom: 12 }}>
                  ✅ Inspecciones completadas:<br />
                  <span style={{ fontSize: 11, color: "#5F5E5A", display: "block", marginTop: 4 }}>
                    SCTR ✓ · EPP ✓ · Alcohol negativo ✓ · Sin objetos extraños ✓
                    {tipo === "contratista" && (fq.traeMaq ? " · Maquinaria registrada ✓" : " · Sin maquinaria")}
                    {(tipo === "contratista" || tipo === "visitante") && (fq.traeHer ? " · Herramientas registradas ✓" : " · Sin herramientas")}
                  </span>
                </div>

                {/* Validación de pre-requisito Safety — bloquea el botón */}
                {bloqueoPorCategoria.bloqueado && (
                  <div style={{ padding: "10px 14px", background: "#FCEBEB", border: "0.5px solid #F09595", borderRadius: 8, fontSize: 12, color: "#A32D2D", marginBottom: 12 }}>
                    {bloqueoPorCategoria.msg}
                  </div>
                )}

                {/* Botón de autorización — deshabilitado si hay bloqueo */}
                {!bloqueoPorCategoria.bloqueado && tipo === "contratista" &&
                  <Btn c="green" onClick={() => conAgente("Autorizar ingreso de " + p.nombre, (agente) => { onIngreso(p.id, "Trabajos en planta", agente); setPaso(p.id, "done"); })}>🔧 Autorizar — Trabajos en planta</Btn>}
                {!bloqueoPorCategoria.bloqueado && tipo === "induccion" &&
                  <Btn c="amber" onClick={() => conAgente("Autorizar ingreso de " + p.nombre, (agente) => { onIngreso(p.id, "Inducción de sitio", agente); setPaso(p.id, "done"); })}>📚 Autorizar — Inducción de sitio</Btn>}
                {!bloqueoPorCategoria.bloqueado && tipo === "visitante" &&
                  <Btn c="blue" onClick={() => conAgente("Autorizar ingreso de " + p.nombre, (agente) => { onIngreso(p.id, "Visita", agente); setPaso(p.id, "done"); })}>✅ Autorizar — Visita</Btn>}

                <div style={{ marginTop: 8 }}><Btn sm onClick={() => setPaso(p.id, anteriorPaso("autorizar"))}>← Atrás</Btn></div>
              </div>
            )}
            {paso === "maquinaria" && (
              <div style={SC}>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>5. ¿Trae maquinaria o equipos?</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>Registra el equipo ahora para no tener que ir a la columna Maquinaria.</p>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  {[["Sí, trae maquinaria", true], ["No trae maquinaria", false]].map(([lbl, val]) => (
                    <div key={String(val)} onClick={() => setFQ("traeMaq", val)} style={{ flex: 1, padding: "12px", border: "0.5px solid " + (fq.traeMaq === val ? (val ? "#97C459" : "#85B7EB") : "var(--color-border-tertiary)"), borderRadius: 10, cursor: "pointer", textAlign: "center", background: fq.traeMaq === val ? (val ? "#EAF3DE" : "#E6F1FB") : "var(--color-background-primary)" }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{val ? "⚙" : "—"}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: fq.traeMaq === val ? (val ? "#3B6D11" : "#185FA5") : "var(--color-text-secondary)" }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                {fq.traeMaq === true && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Descripción *</label>
                      <input style={SI} placeholder="Ej. Retroexcavadora CAT 320" value={feq.desc} onChange={e => setFEq({ desc: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>N° serie / placa *</label>
                      <input style={SI} placeholder="ABC-123" value={feq.serie} onChange={e => setFEq({ serie: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Documentos</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {DOCS_EQ.map(d => (
                          <div key={d} onClick={() => setFEqDoc(d)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 8px", border: "0.5px solid " + (feq.docs[d] ? "#97C459" : "var(--color-border-tertiary)"), borderRadius: 6, cursor: "pointer", background: feq.docs[d] ? "#EAF3DE" : "transparent", fontSize: 11 }}>
                            <div style={{ width: 14, height: 14, borderRadius: 3, background: feq.docs[d] ? "#3B6D11" : "transparent", border: feq.docs[d] ? "none" : "0.5px solid var(--color-border-secondary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9 }}>{feq.docs[d] ? "✓" : ""}</div>
                            {d}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  {fq.traeMaq === false && (
                    <Btn c="blue" onClick={() => setPaso(p.id, siguientePaso("maquinaria"))}>Continuar →</Btn>
                  )}
                  {fq.traeMaq === true && (
                    <Btn c="green" onClick={() => {
                      if (!feq.desc || !feq.serie) { alert("Completa descripción y N° serie."); return; }
                      const emp2 = empresas[p.empId];
                      onAddEq({ ...feq, id: "EQ-" + String(Date.now()).slice(-4), empId: p.empId, empNombre: (emp2 && emp2.razonSocial), opNombre: p.nombre, opDni: p.dni, pid: p.id, ingreso: nowISO(), salida: null });
                      setPaso(p.id, siguientePaso("maquinaria"));
                    }}>✔ Registrar equipo y continuar</Btn>
                  )}
                  <Btn sm onClick={() => setPaso(p.id, anteriorPaso("maquinaria"))}>← Atrás</Btn>
                </div>
              </div>
            )}

            {/* PASO 7: ¿TRAE HERRAMIENTAS? */}
            {paso === "herramientas" && (
              <div style={SC}>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>6. ¿Trae herramientas?</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>Registra las herramientas ahora, directamente desde este flujo.</p>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  {[["Sí, trae herramientas", true], ["No trae herramientas", false]].map(([lbl, val]) => (
                    <div key={String(val)} onClick={() => setFQ("traeHer", val)} style={{ flex: 1, padding: "12px", border: "0.5px solid " + (fq.traeHer === val ? (val ? "#97C459" : "#85B7EB") : "var(--color-border-tertiary)"), borderRadius: 10, cursor: "pointer", textAlign: "center", background: fq.traeHer === val ? (val ? "#EAF3DE" : "#E6F1FB") : "var(--color-background-primary)" }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{val ? "🔧" : "—"}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: fq.traeHer === val ? (val ? "#3B6D11" : "#185FA5") : "var(--color-text-secondary)" }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                {fq.traeHer === true && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 24px", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Herramienta</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Cant.</span>
                      <span />
                    </div>
                    {fher.map((h, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 24px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <input style={SI} placeholder='Ej. Llave stilson 24"' value={h.desc} onChange={e => setFHer(items => items.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                        <input type="number" min={1} style={SI} value={h.cant} onChange={e => setFHer(items => items.map((x, j) => j === i ? { ...x, cant: e.target.value } : x))} />
                        {fher.length > 1 ? <button onClick={() => setFHer(items => items.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#A32D2D", fontSize: 16 }}>✕</button> : <span />}
                      </div>
                    ))}
                    <Btn sm onClick={() => setFHer(items => [...items, { desc: "", cant: 1 }])}>+ Ítem</Btn>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn sm onClick={() => setPaso(p.id, anteriorPaso("herramientas"))}>← Atrás</Btn>
                  {fq.traeHer === false && (
                    <Btn c="green" onClick={() => setPaso(p.id, siguientePaso("herramientas"))}>Continuar →</Btn>
                  )}
                  {fq.traeHer === true && (
                    <Btn c="green" onClick={() => {
                      const val = fher.filter(h => h.desc.trim());
                      if (!val.length) { alert("Agrega al menos una herramienta."); return; }
                      val.forEach(h => onAddHer({ ...h, operador: p.nombre, operadorId: p.id, operadorDni: p.dni, pid: p.id, id: "HER-" + String(Date.now()).slice(-4) + Math.random().toString(36).slice(2,4), ingreso: nowISO(), salida: null }));
                      setPaso(p.id, siguientePaso("herramientas"));
                    }}>✔ Registrar herramientas y continuar</Btn>
                  )}
                </div>
              </div>
            )}

            {/* PASO 8: DONE */}
            {paso === "done" && (
              <div style={{ padding: "16px", background: "#EAF3DE", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#3B6D11", marginBottom: 4 }}>Ingreso completado</div>
                <div style={{ fontSize: 12, color: "#5F5E5A" }}>
                  {p.nombre} está en planta.
                  {fq.traeMaq ? " · Maquinaria registrada." : ""}
                  {fq.traeHer ? " · Herramientas registradas." : ""}
                </div>
                <div style={{ marginTop: 10 }}><Btn sm onClick={resetFlujo}>Nueva inspección</Btn></div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };


  return (
    <div>
      {/* ── MODAL NOMBRE AGENTE ── */}
      {modalAgente && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--color-background-primary)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>🛡 Identificación del agente</div>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
              Acción: <strong>{modalAgente.descripcion}</strong><br />
              Ingresa tu nombre completo para registrar esta acción.
            </p>
            <input
              autoFocus
              style={{ ...SI, marginBottom: 16 }}
              placeholder="Nombres y apellidos..."
              value={agenteNombre}
              onChange={e => setAgenteNombre(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && agenteNombre.trim().length >= 3) {
                  setAgenteConfirmado(true);
                  modalAgente.onConfirm(agenteNombre.trim());
                  setModalAgente(null);
                }
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setModalAgente(null)} style={{ flex: 1, padding: "9px 0", background: "var(--color-background-secondary)", border: "1px solid var(--color-border-secondary)", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={() => {
                if (agenteNombre.trim().length < 3) { alert("Ingresa tu nombre completo."); return; }
                setAgenteConfirmado(true);
                modalAgente.onConfirm(agenteNombre.trim());
                setModalAgente(null);
              }} style={{ flex: 2, padding: "9px 0", background: "#1B5CA8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>✔ Confirmar y registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BANNER AGENTE ACTIVO ── */}
      {agenteConfirmado && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "#EAF3DE", border: "1px solid #A3D4B5", borderRadius: 10, marginBottom: "1rem" }}>
          <span style={{ fontSize: 16 }}>🛡</span>
          <span style={{ fontSize: 12, color: "#3B6D11", fontWeight: 600 }}>Agente en turno:</span>
          <span style={{ fontSize: 13, color: "#1A2332", fontWeight: 500, flex: 1 }}>{agenteNombre}</span>
          <button onClick={() => { setAgenteConfirmado(false); setAgenteNombre(""); }} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: "#3B6D11", textDecoration: "underline" }}>Cambiar</button>
        </div>
      )}

      {/* Modal visor PDF SCTR */}

      <TabBar tabs={[["programados","📅 Programados"],["verificar","🔍 Verificar"],["activos","✅ En planta"],["equipos","⚙ Maquinaria"],["herramientas","🔧 Herramientas"],["incidentes","⚠ Incidente Ingreso"],["despachos","🚛 Despachos"],["historial","📋 Historial"]]} active={tab} onSelect={setTab} />

      {tab === "programados" && <TabProgramados />}

      {tab === "verificar" && (
        <div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, DNI o empresa..." style={{ ...SI, marginBottom: "1rem" }} />
          {q.length < 2 ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)" }}>Ingresa al menos 2 caracteres.</div>
            : matches.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)" }}>⚠ Persona no registrada en el sistema.</div>
              : matches.map(p => <PCard key={p.id} p={p} />)}
        </div>
      )}

      {tab === "activos" && (
        <div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>✅ En planta ahora — {activos.length} persona{activos.length !== 1 ? "s" : ""}</p>
          {activos.length === 0
            ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>No hay personas en planta.</div>
            : activos.map(a => {
                const p = pLista.find(x => x.id === a.pid);
                const emp = p ? empresas[p.empId] : null;
                const dur = Math.floor((new Date() - new Date(a.ingreso)) / 60000);
                const eqVinc = equipos.filter(e => !e.salida && (e.pid === a.pid || e.opId === a.pid));
                const herVinc = herramientas.filter(h => !h.salida && (h.pid === a.pid || h.operadorId === a.pid));
                const tieneVinc = eqVinc.length > 0 || herVinc.length > 0;

                // Estado del flujo de salida por persona
                const salidaPaso = salidaFlujo[a.pid] || null; // null | "maq" | "her" | "confirm"
                const salidaConf = salidaConfs[a.pid] || { maqOk: null, herOk: {} };

                const setSalidaPaso = (paso) => setSalidaFlujo(prev => ({ ...prev, [a.pid]: paso }));
                const setMaqOk = (v) => setSalidaConfs(prev => ({ ...prev, [a.pid]: { ...(prev[a.pid] || {}), maqOk: v } }));
                const setHerCheck = (hid, v) => setSalidaConfs(prev => ({
                  ...prev, [a.pid]: { ...(prev[a.pid] || {}), herOk: { ...((prev[a.pid] || {}).herOk || {}), [hid]: v } }
                }));
                const herTodas = herVinc.every(h => salidaConf.herOk[h.id]);

                return (
                  <div key={a.pid} style={SC}>
                    {/* Cabecera */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: salidaPaso ? 12 : 0 }}>
                      {p && <Avt nombre={p.nombre} color={p.color} size={44} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{a.nombre}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{(emp && emp.razonSocial) || "—"} · Ingresó {new Date(a.ingreso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })} · {dur} min</div>
                        <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Badge t={a.tipoIngreso === "Trabajos en planta" ? "green" : a.tipoIngreso === "Visita" ? "blue" : "amber"}>{a.tipoIngreso}</Badge>
                          {eqVinc.length > 0 && <Badge t="amber">⚙ {eqVinc.length} equipo{eqVinc.length > 1 ? "s" : ""} activo{eqVinc.length > 1 ? "s" : ""}</Badge>}
                          {herVinc.length > 0 && <Badge t="teal">🔧 {herVinc.length} herramienta{herVinc.length > 1 ? "s" : ""}</Badge>}
                          {a.tipoIngreso === "Inducción de sitio" && (() => {
                            const ind = p ? indSt(p.ind || p.induccion) : "none";
                            return (ind === "vigente" || ind === "proximo")
                              ? <Btn c="green" sm onClick={() => conAgente("Cambiar a Trabajos en planta a " + (personas[a.pid]?.nombre || a.nombre), (agente) => onIngreso(a.pid, "Trabajos en planta", agente))}>🔧 Safety aprobó — pasar a Trabajos</Btn>
                              : null;
                          })()}
                        </div>
                      </div>
                      {/* Botón iniciar salida */}
                      {!salidaPaso && (
                        <Btn c="red" sm onClick={() => {
                          if (tieneVinc) {
                            setSalidaPaso(eqVinc.length > 0 ? "maq" : "her");
                          } else {
                            conAgente("Registrar salida de " + a.nombre, (agente) => onSalida(a.pid, agente));
                          }
                        }}>🚪 Registrar salida</Btn>
                      )}
                    </div>

                    {/* FLUJO DE SALIDA */}
                    {salidaPaso && (
                      <div>
                        {/* Barra de pasos */}
                        <div style={{ display: "grid", gridTemplateColumns: eqVinc.length > 0 && herVinc.length > 0 ? "repeat(3,1fr)" : "repeat(2,1fr)", gap: 4, marginBottom: 12 }}>
                          {[
                            ...(eqVinc.length > 0 ? [["Maquinaria","maq"]] : []),
                            ...(herVinc.length > 0 ? [["Herramientas","her"]] : []),
                            ["Confirmar salida","confirm"]
                          ].map(([lbl, key], idx, arr) => {
                            const done = arr.findIndex(x => x[1] === salidaPaso) > idx;
                            const active = salidaPaso === key;
                            return (
                              <div key={key} style={{ textAlign: "center", fontSize: 11, fontWeight: 500, padding: "4px", borderRadius: 6,
                                background: done ? "#EAF3DE" : active ? "#E6F1FB" : "var(--color-background-secondary)",
                                color: done ? "#3B6D11" : active ? "#185FA5" : "var(--color-text-secondary)",
                                border: active ? "0.5px solid #85B7EB" : "0.5px solid transparent" }}>
                                {done ? "✓ " : ""}{lbl}
                              </div>
                            );
                          })}
                        </div>

                        {/* PASO: MAQUINARIA */}
                        {salidaPaso === "maq" && (
                          <div style={{ ...SC, background: "var(--color-background-secondary)" }}>
                            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>⚙ Verificación de maquinaria</p>
                            {eqVinc.map(eq => (
                              <div key={eq.id} style={{ padding: "10px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, marginBottom: 8 }}>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{eq.desc}</div>
                                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>Placa/Serie: {eq.serie} · Ingresó: {new Date(eq.ingreso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</div>
                                <p style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>¿El equipo sale en buen estado y sin incidentes?</p>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <div onClick={() => setMaqOk(true)} style={{ flex: 1, padding: "10px", border: "0.5px solid " + (salidaConf.maqOk === true ? "#97C459" : "var(--color-border-tertiary)"), borderRadius: 8, cursor: "pointer", textAlign: "center", background: salidaConf.maqOk === true ? "#EAF3DE" : "var(--color-background-primary)" }}>
                                    <div style={{ fontSize: 18 }}>✅</div>
                                    <div style={{ fontSize: 12, fontWeight: 500, color: salidaConf.maqOk === true ? "#3B6D11" : "var(--color-text-secondary)" }}>Conforme</div>
                                  </div>
                                  <div onClick={() => setMaqOk(false)} style={{ flex: 1, padding: "10px", border: "0.5px solid " + (salidaConf.maqOk === false ? "#F09595" : "var(--color-border-tertiary)"), borderRadius: 8, cursor: "pointer", textAlign: "center", background: salidaConf.maqOk === false ? "#FCEBEB" : "var(--color-background-primary)" }}>
                                    <div style={{ fontSize: 18 }}>⚠️</div>
                                    <div style={{ fontSize: 12, fontWeight: 500, color: salidaConf.maqOk === false ? "#A32D2D" : "var(--color-text-secondary)" }}>Con observación</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {salidaConf.maqOk === false && (
                              <div style={{ padding: "8px 12px", background: "#FCEBEB", borderRadius: 8, fontSize: 12, color: "#A32D2D", marginBottom: 8 }}>⚠ Registra la observación en Bitácora antes de continuar.</div>
                            )}
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <Btn sm onClick={() => setSalidaFlujo(prev => ({ ...prev, [a.pid]: null }))}>✕ Cancelar</Btn>
                              <Btn c="blue" disabled={salidaConf.maqOk === null || salidaConf.maqOk === undefined} onClick={() => setSalidaPaso(herVinc.length > 0 ? "her" : "confirm")}>Continuar →</Btn>
                            </div>
                          </div>
                        )}

                        {/* PASO: HERRAMIENTAS */}
                        {salidaPaso === "her" && (
                          <div style={{ ...SC, background: "var(--color-background-secondary)" }}>
                            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>🔧 Verificación de herramientas</p>
                            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>Confirma que cada herramienta declarada al ingreso está siendo retirada.</p>
                            {herVinc.map(h => {
                              const checked = !!salidaConf.herOk[h.id];
                              return (
                                <div key={h.id} onClick={() => setHerCheck(h.id, !checked)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "0.5px solid " + (checked ? "#97C459" : "var(--color-border-tertiary)"), borderRadius: 8, cursor: "pointer", background: checked ? "#EAF3DE" : "var(--color-background-primary)", marginBottom: 6 }}>
                                  <div style={{ width: 20, height: 20, borderRadius: 4, background: checked ? "#3B6D11" : "transparent", border: checked ? "0.5px solid #3B6D11" : "0.5px solid var(--color-border-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", flexShrink: 0 }}>{checked ? "✓" : ""}</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{h.desc}</div>
                                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Cantidad declarada: {h.cant}</div>
                                  </div>
                                  <Badge t={checked ? "green" : "gray"}>{checked ? "Verificada" : "Pendiente"}</Badge>
                                </div>
                              );
                            })}
                            {!herTodas && (
                              <div style={{ padding: "8px 12px", background: "#FAEEDA", borderRadius: 8, fontSize: 12, color: "#854F0B", marginBottom: 8 }}>⚠ Confirma todas las herramientas antes de continuar.</div>
                            )}
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <Btn sm onClick={() => setSalidaPaso(eqVinc.length > 0 ? "maq" : null)}>← Atrás</Btn>
                              <Btn c="blue" disabled={!herTodas} onClick={() => setSalidaPaso("confirm")}>Continuar →</Btn>
                            </div>
                          </div>
                        )}

                        {/* PASO: CONFIRMAR SALIDA */}
                        {salidaPaso === "confirm" && (
                          <div style={{ ...SC, background: "var(--color-background-secondary)" }}>
                            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>🚪 Confirmar salida</p>
                            <div style={{ padding: "10px 14px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", marginBottom: 12 }}>
                              ✅ Todo verificado:
                              {eqVinc.length > 0 && <span> Maquinaria {salidaConf.maqOk ? "conforme" : "con observación"}.</span>}
                              {herVinc.length > 0 && <span> {herVinc.length} herramienta{herVinc.length > 1 ? "s" : ""} verificada{herVinc.length > 1 ? "s" : ""}.</span>}
                            </div>
                            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
                              Se registrará la salida de <strong>{a.nombre}</strong> y de todo lo vinculado.
                            </p>
                            <div style={{ display: "flex", gap: 8 }}>
                              <Btn sm onClick={() => setSalidaPaso(herVinc.length > 0 ? "her" : "maq")}>← Atrás</Btn>
                              <Btn c="red" onClick={() => {
                                conAgente("Confirmar salida total de " + a.nombre, (agente) => {
                                  onSalida(a.pid, agente);
                                  setSalidaFlujo(prev => { const n = { ...prev }; delete n[a.pid]; return n; });
                                  setSalidaConfs(prev => { const n = { ...prev }; delete n[a.pid]; return n; });
                                });
                              }}>🚪 Confirmar salida total</Btn>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
          }
        </div>
      )}

      {tab === "equipos" && (
        <div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>⚙ Maquinaria y equipos</p>
          {/* Buscador de persona para registrar maquinaria */}
          <RegistradorEquipo personas={personas} empresas={empresas} equipos={equipos} onAddEq={eq => { onAddEq(eq); }} />
          <div style={{ overflowX: "auto", marginTop: "1rem" }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8 }}>Registro actual de maquinaria</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["ID","Descripción","Placa/Serie","Empresa","Operador (Identificación)","Docs","Ingreso","Salida","Estado"].map(h => <th key={h} style={STH}>{h}</th>)}</tr></thead>
              <tbody>
                {equipos.length === 0 ? <tr><td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)" }}>Sin equipos registrados.</td></tr>
                  : equipos.map(eq => {
                    const op = Object.values(personas).find(p => p.id === eq.opId);
                    return (
                      <tr key={eq.id}>
                        <td style={STD}><span style={{ background: "#FAEEDA", color: "#854F0B", padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 500 }}>⚙ {eq.id}</span></td>
                        <td style={{ ...STD, fontWeight: 500 }}>{eq.desc}</td>
                        <td style={STD}>{eq.serie}</td>
                        <td style={STD}>{eq.empNombre || "—"}</td>
                        <td style={STD}>{eq.opNombre || "—"}{op ? <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{op.tipoDoc || "DNI"}: {op.dni}</div> : null}</td>
                        <td style={STD}><Badge t={DOCS_EQ.every(d => eq.docs[d]) ? "green" : "amber"}>{DOCS_EQ.every(d => eq.docs[d]) ? "Completos" : "Incompletos"}</Badge></td>
                        <td style={STD}>{new Date(eq.ingreso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td style={STD}>{eq.salida ? new Date(eq.salida).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={STD}><Badge t={eq.salida ? "green" : "amber"}>{eq.salida ? "Retirado" : "En planta"}</Badge></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "herramientas" && (
        <div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>🔧 Herramientas</p>
          {/* Buscador de persona para registrar herramientas */}
          <RegistradorHerramienta personas={personas} empresas={empresas} herramientas={herramientas} onAddHer={h => { onAddHer(h); }} />
          <div style={{ overflowX: "auto", marginTop: "1rem" }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8 }}>Registro actual de herramientas</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["ID","Herramienta","Cant.","Operador","N° Documento","Ingreso","Salida","Estado"].map(h => <th key={h} style={STH}>{h}</th>)}</tr></thead>
              <tbody>
                {herramientas.length === 0 ? <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)" }}>Sin herramientas registradas.</td></tr>
                  : herramientas.map(h => {
                    const op = Object.values(personas).find(p => p.id === h.operadorId);
                    return (
                      <tr key={h.id}>
                        <td style={STD}><span style={{ background: "#E1F5EE", color: "#0F6E56", padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 500 }}>🔧 {h.id}</span></td>
                        <td style={{ ...STD, fontWeight: 500 }}>{h.desc}</td>
                        <td style={STD}>{h.cant}</td>
                        <td style={STD}>{h.operador || "—"}</td>
                        <td style={{ ...STD, fontFamily: "var(--mono)", fontSize: 12 }}>{op ? (op.tipoDoc || "DNI") + ": " + op.dni : (h.operadorDni || "—")}</td>
                        <td style={STD}>{new Date(h.ingreso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td style={STD}>{h.salida ? new Date(h.salida).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={STD}><Badge t={h.salida ? "green" : "amber"}>{h.salida ? "Retirada" : "En planta"}</Badge></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "incidentes" && (
        <TabIncidenteIngreso
          personas={personas} empresas={empresas}
          incidentesIngreso={incidentesIngreso}
          onRegistrar={(inc) => {
            setIncidentesIngreso(prev => [{ ...inc, id: "INC-" + String(Date.now()).slice(-4), fecha: today(), hora: nowTime() }, ...prev]);
            // Bloquear persona si se marcó como bloquear
            if (inc.bloquear) onSolicitarBloqueo(inc.personaId, { nombre: inc.nombre, motivo: "Incidente de Ingreso: " + inc.causasTexto, fecha: today(), solicitante: "Vigilancia" });
          }}
        />
      )}

      {tab === "despachos" && (
        <TabDespachos
          personas={personas} empresas={empresas}
          despachos={despachos}
          onIngresoDespacho={(id, guia, hora) => setDespachos(prev => prev.map(d => d.id === id ? { ...d, guia, ingresoHora: hora, estado: "En planta" } : d))}
          onSalidaDespacho={(id, hora) => setDespachos(prev => prev.map(d => d.id === id ? { ...d, salidaHora: hora, estado: "Salió" } : d))}
        />
      )}

      {tab === "historial" && (
        <div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>Historial de accesos</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["ID","Nombre","Empresa","Tipo ingreso","Agente ingreso","Ingreso","Agente salida","Salida","Duración"].map(h => <th key={h} style={STH}>{h}</th>)}</tr></thead>
              <tbody>
                {accesos.length === 0 ? <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)" }}>Sin historial.</td></tr>
                  : accesos.map((a, i) => {
                    const ing = new Date(a.ingreso); const sal = a.salida ? new Date(a.salida) : null;
                    return (
                      <tr key={i}>
                        <td style={STD}><IDB id={a.pid} /></td>
                        <td style={{ ...STD, fontWeight: 500 }}>{a.nombre}</td>
                        <td style={STD}>{a.empresa}</td>
                        <td style={STD}><Badge t={a.tipoIngreso === "Trabajos en planta" ? "green" : a.tipoIngreso === "Visita" ? "blue" : "amber"}>{a.tipoIngreso}</Badge></td>
                        <td style={{ ...STD, fontSize: 11, color: "var(--color-text-secondary)" }}>{a.agente || a.agente_ingreso || "—"}</td>
                        <td style={STD}>{ing.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td style={{ ...STD, fontSize: 11, color: "var(--color-text-secondary)" }}>{a.agenteSalida || a.agente_salida || "—"}</td>
                        <td style={STD}>{sal ? sal.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={STD}>{sal ? Math.floor((sal - ing) / 60000) + " min" : "En planta"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── REGISTRADOR MAQUINARIA (busca persona por n° de identificación) ──────────
function RegistradorEquipo({ personas, empresas, equipos, onAddEq }) {
  const [busqDoc, setBusqDoc] = useState("");
  const [personaSel, setPersonaSel] = useState(null);
  const [form, setForm] = useState({ desc: "", serie: "", docs: { SOAT: false, "Revisión técnica": false, "Permiso de operación": false } });
  const [ok, setOk] = useState("");
  const pLista = Object.values(personas);
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const matches = busqDoc.length >= 4 ? pLista.filter(p => p.dni && p.dni.includes(busqDoc)) : [];
  const registrar = () => {
    if (!personaSel) { alert("Busca y selecciona una persona."); return; }
    if (!form.desc.trim()) { alert("Ingresa la descripción del equipo."); return; }
    if (!form.serie.trim()) { alert("Ingresa N° de serie o placa."); return; }
    const emp = empresas[personaSel.empId];
    onAddEq({ ...form, id: "EQ-" + String(Date.now()).slice(-4), empId: personaSel.empId, empNombre: (emp && emp.razonSocial) || "—", opNombre: personaSel.nombre, opDni: personaSel.dni, opId: personaSel.id, pid: personaSel.id, ingreso: new Date().toISOString(), salida: null });
    setOk("Equipo registrado para " + personaSel.nombre);
    setPersonaSel(null); setBusqDoc(""); setForm({ desc: "", serie: "", docs: { SOAT: false, "Revisión técnica": false, "Permiso de operación": false } });
    setTimeout(() => setOk(""), 4000);
  };
  return (
    <div style={{ ...SC, marginBottom: "1rem" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 10 }}>Registrar maquinaria — buscar responsable por N° de documento</p>
      {ok && <div style={{ padding: "8px 12px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", marginBottom: 10 }}>✅ {ok}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input style={{ ...SI, flex: 1 }} placeholder="N° DNI / CE / PAS del operador..." value={busqDoc} onChange={e => { setBusqDoc(e.target.value); setPersonaSel(null); }} />
      </div>
      {matches.length > 0 && !personaSel && (
        <div style={{ border: "1px solid var(--bd2)", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
          {matches.map(p => {
            const emp = empresas[p.empId];
            return (
              <div key={p.id} onClick={() => { setPersonaSel(p); setBusqDoc(p.dni); }} style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid var(--bd)", display: "flex", gap: 10, alignItems: "center", background: "var(--sf)" }}>
                <Avt nombre={p.nombre} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)" }}>{p.tipoDoc || "DNI"}: {p.dni} — {(emp && emp.razonSocial) || "—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {busqDoc.length >= 4 && !personaSel && matches.length === 0 && <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 8 }}>No se encontró ninguna persona con ese número.</div>}
      {personaSel && (
        <div>
          <div style={{ padding: "8px 12px", background: "#E6F1FB", borderRadius: 8, fontSize: 12, color: "#185FA5", marginBottom: 10 }}>
            ✔ Operador: <strong>{personaSel.nombre}</strong> — {personaSel.tipoDoc || "DNI"}: {personaSel.dni}
            <button onClick={() => { setPersonaSel(null); setBusqDoc(""); }} style={{ marginLeft: 10, background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: "#185FA5", textDecoration: "underline" }}>Cambiar</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Descripción del equipo *</label><input style={SI} value={form.desc} onChange={e => upd("desc", e.target.value)} placeholder="Ej. Retroexcavadora CAT 320" /></div>
            <div><label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>N° Serie / Placa *</label><input style={SI} value={form.serie} onChange={e => upd("serie", e.target.value)} placeholder="ABC-123" /></div>
            <div>
              <label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Documentos</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {["SOAT", "Revisión técnica", "Permiso de operación"].map(d => (
                  <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!form.docs[d]} onChange={() => setForm(f => ({ ...f, docs: { ...f.docs, [d]: !f.docs[d] } }))} />
                    {d}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <Btn c="green" onClick={registrar}>⚙ Registrar equipo</Btn>
        </div>
      )}
    </div>
  );
}

// ── REGISTRADOR HERRAMIENTAS (busca persona por n° de identificación) ────────
function RegistradorHerramienta({ personas, empresas, herramientas, onAddHer }) {
  const [busqDoc, setBusqDoc] = useState("");
  const [personaSel, setPersonaSel] = useState(null);
  const [items, setItems] = useState([{ desc: "", cant: 1 }]);
  const [ok, setOk] = useState("");
  const pLista = Object.values(personas);
  const matches = busqDoc.length >= 4 ? pLista.filter(p => p.dni && p.dni.includes(busqDoc)) : [];
  const registrar = () => {
    if (!personaSel) { alert("Busca y selecciona una persona."); return; }
    const val = items.filter(h => h.desc.trim());
    if (!val.length) { alert("Agrega al menos una herramienta."); return; }
    val.forEach(h => onAddHer({ ...h, operador: personaSel.nombre, operadorId: personaSel.id, operadorDni: personaSel.dni, pid: personaSel.id, id: "HER-" + String(Date.now()).slice(-4) + Math.random().toString(36).slice(2,4), ingreso: new Date().toISOString(), salida: null }));
    setOk(val.length + " herramienta(s) registradas para " + personaSel.nombre);
    setPersonaSel(null); setBusqDoc(""); setItems([{ desc: "", cant: 1 }]);
    setTimeout(() => setOk(""), 4000);
  };
  return (
    <div style={{ ...SC, marginBottom: "1rem" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 10 }}>Registrar herramientas — buscar responsable por N° de documento</p>
      {ok && <div style={{ padding: "8px 12px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", marginBottom: 10 }}>✅ {ok}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input style={{ ...SI, flex: 1 }} placeholder="N° DNI / CE / PAS del responsable..." value={busqDoc} onChange={e => { setBusqDoc(e.target.value); setPersonaSel(null); }} />
      </div>
      {matches.length > 0 && !personaSel && (
        <div style={{ border: "1px solid var(--bd2)", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
          {matches.map(p => {
            const emp = empresas[p.empId];
            return (
              <div key={p.id} onClick={() => { setPersonaSel(p); setBusqDoc(p.dni); }} style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid var(--bd)", display: "flex", gap: 10, alignItems: "center" }}>
                <Avt nombre={p.nombre} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)" }}>{p.tipoDoc || "DNI"}: {p.dni} — {(emp && emp.razonSocial) || "—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {busqDoc.length >= 4 && !personaSel && matches.length === 0 && <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 8 }}>No se encontró ninguna persona con ese número.</div>}
      {personaSel && (
        <div>
          <div style={{ padding: "8px 12px", background: "#E6F1FB", borderRadius: 8, fontSize: 12, color: "#185FA5", marginBottom: 10 }}>
            ✔ Responsable: <strong>{personaSel.nombre}</strong> — {personaSel.tipoDoc || "DNI"}: {personaSel.dni}
            <button onClick={() => { setPersonaSel(null); setBusqDoc(""); }} style={{ marginLeft: 10, background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: "#185FA5", textDecoration: "underline" }}>Cambiar</button>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 24px", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", textTransform: "uppercase" }}>Herramienta</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", textTransform: "uppercase" }}>Cant.</span>
              <span />
            </div>
            {items.map((item, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 24px", gap: 8, marginBottom: 6, alignItems: "center" }}>
                <input style={SI} placeholder='Ej. Llave stilson 24"' value={item.desc} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                <input type="number" min={1} style={SI} value={item.cant} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, cant: e.target.value } : x))} />
                {items.length > 1 ? <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--rd)", fontSize: 16 }}>✕</button> : <span />}
              </div>
            ))}
            <Btn sm onClick={() => setItems(prev => [...prev, { desc: "", cant: 1 }])}>+ Ítem</Btn>
          </div>
          <Btn c="green" onClick={registrar}>🔧 Registrar herramientas</Btn>
        </div>
      )}
    </div>
  );
}

// ── TAB INCIDENTE DE INGRESO ──────────────────────────────────────────────────
function TabIncidenteIngreso({ personas, empresas, incidentesIngreso, onRegistrar }) {
  const [tab, setTab] = useState("registrar");
  const [busqDoc, setBusqDoc] = useState("");
  const [personaSel, setPersonaSel] = useState(null);
  const [causas, setCausas] = useState({ epp: false, alcohol: false, armas: false, otro: false });
  const [detalle, setDetalle] = useState("");
  const [bloquear, setBloquear] = useState(false);
  const [ok, setOk] = useState("");
  const pLista = Object.values(personas);
  const matches = busqDoc.length >= 4 ? pLista.filter(p => p.dni && p.dni.includes(busqDoc)) : [];
  const causaLabels = { epp: "🦺 EPP incompleto o inadecuado", alcohol: "🍺 Resultado positivo en alcohol test", armas: "🔫 Portación de armas blancas u objetos prohibidos", otro: "📝 Otro (especificar en detalle)" };
  const registrar = () => {
    if (!personaSel) { alert("Selecciona la persona involucrada."); return; }
    const causasSel = Object.entries(causas).filter(([, v]) => v).map(([k]) => causaLabels[k]);
    if (!causasSel.length && !detalle.trim()) { alert("Selecciona al menos una causa o escribe un detalle."); return; }
    const causasTexto = causasSel.join(", ") || "Sin causa específica";
    const emp = empresas[personaSel.empId];
    onRegistrar({ personaId: personaSel.id, nombre: personaSel.nombre, dni: personaSel.dni, tipoDoc: personaSel.tipoDoc || "DNI", empresa: (emp && emp.razonSocial) || "—", causas, causasTexto, detalle, bloquear });
    setOk("Incidente registrado para " + personaSel.nombre + (bloquear ? ". Se solicitó suspensión al Administrador." : "."));
    setPersonaSel(null); setBusqDoc(""); setCausas({ epp: false, alcohol: false, armas: false, otro: false }); setDetalle(""); setBloquear(false);
    setTimeout(() => setOk(""), 5000);
    setTab("historial");
  };
  return (
    <div>
      <TabBar tabs={[["registrar","📋 Registrar incidente"],["historial","📒 Historial (" + incidentesIngreso.length + ")"]]} active={tab} onSelect={setTab} />
      {tab === "registrar" && (
        <div>
          <div style={{ padding: "10px 14px", background: "#FAEEDA", border: "1px solid var(--am-bd)", borderRadius: 10, fontSize: 12, color: "var(--am)", marginBottom: "1rem" }}>
            ⚠ Este módulo registra cuando una persona <strong>no cumple</strong> con las condiciones de ingreso (EPP, alcohol, armas blancas u otros). El registro bloquea el ingreso hasta que se levante el incidente.
          </div>
          {ok && <div style={{ padding: "10px 14px", background: "#EAF3DE", border: "1px solid var(--gn-bd)", borderRadius: 10, fontSize: 12, color: "var(--gn)", marginBottom: "1rem" }}>✅ {ok}</div>}
          <div style={SC}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)", marginBottom: 10 }}>1. Buscar persona por N° de documento</p>
            <input style={{ ...SI, marginBottom: 8 }} placeholder="N° DNI / CE / PAS..." value={busqDoc} onChange={e => { setBusqDoc(e.target.value); setPersonaSel(null); }} />
            {matches.length > 0 && !personaSel && (
              <div style={{ border: "1px solid var(--bd2)", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                {matches.map(p => {
                  const emp = empresas[p.empId];
                  return (
                    <div key={p.id} onClick={() => { setPersonaSel(p); setBusqDoc(p.dni); }} style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid var(--bd)", display: "flex", gap: 10, alignItems: "center" }}>
                      <Avt nombre={p.nombre} size={32} />
                      <div><div style={{ fontWeight: 500, fontSize: 13 }}>{p.nombre}</div><div style={{ fontSize: 11, color: "var(--tx3)" }}>{p.tipoDoc || "DNI"}: {p.dni} — {(emp && emp.razonSocial) || "—"}</div></div>
                    </div>
                  );
                })}
              </div>
            )}
            {personaSel && (
              <div style={{ padding: "8px 12px", background: "#FCEBEB", border: "1px solid var(--rd-bd)", borderRadius: 8, fontSize: 12, color: "var(--rd)", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                ⚠ <strong>{personaSel.nombre}</strong> — {personaSel.tipoDoc || "DNI"}: {personaSel.dni}
                <button onClick={() => { setPersonaSel(null); setBusqDoc(""); }} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: "var(--rd)", textDecoration: "underline" }}>Cambiar</button>
              </div>
            )}
          </div>
          {personaSel && (
            <div style={SC}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)", marginBottom: 10 }}>2. Causa del incidente</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {Object.entries(causaLabels).map(([k, lbl]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid " + (causas[k] ? "var(--rd-bd)" : "var(--bd2)"), borderRadius: 8, cursor: "pointer", background: causas[k] ? "var(--rd-bg)" : "var(--sf)", fontSize: 13 }}>
                    <input type="checkbox" checked={!!causas[k]} onChange={() => setCausas(c => ({ ...c, [k]: !c[k] }))} style={{ width: 16, height: 16 }} />
                    <span style={{ color: causas[k] ? "var(--rd)" : "var(--tx)" }}>{lbl}</span>
                  </label>
                ))}
              </div>
              <label style={{ fontSize: 12, color: "var(--tx3)", display: "block", marginBottom: 4 }}>Detalle adicional</label>
              <textarea style={{ ...SI, resize: "vertical", marginBottom: 12 }} rows={3} value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Describe el incidente con más detalle..." />
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid " + (bloquear ? "var(--rd-bd)" : "var(--bd2)"), borderRadius: 8, cursor: "pointer", background: bloquear ? "var(--rd-bg)" : "var(--sf)", fontSize: 13, marginBottom: 12 }}>
                <input type="checkbox" checked={bloquear} onChange={() => setBloquear(b => !b)} style={{ width: 16, height: 16 }} />
                <span style={{ color: bloquear ? "var(--rd)" : "var(--tx)" }}>🚫 Solicitar suspensión al Administrador</span>
              </label>
              <Btn c="red" onClick={registrar}>⚠ Registrar incidente de ingreso</Btn>
            </div>
          )}
        </div>
      )}
      {tab === "historial" && (
        <div>
          {incidentesIngreso.length === 0
            ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--tx3)" }}>Sin incidentes registrados.</div>
            : incidentesIngreso.map(inc => (
              <div key={inc.id} style={{ ...SC, borderLeft: "3px solid var(--rd)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{inc.nombre}</div>
                    <div style={{ fontSize: 12, color: "var(--tx3)" }}>{inc.tipoDoc || "DNI"}: {inc.dni} — {inc.empresa}</div>
                    <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 2 }}>{inc.fecha} {inc.hora}</div>
                    <div style={{ marginTop: 6, padding: "6px 10px", background: "var(--rd-bg)", borderRadius: 6, fontSize: 12, color: "var(--rd)" }}>
                      ⚠ {inc.causasTexto}
                    </div>
                    {inc.detalle && <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 4 }}>{inc.detalle}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <IDB id={inc.id} />
                    {inc.bloquear && <Badge t="red">Suspensión solicitada</Badge>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── TAB DESPACHOS ─────────────────────────────────────────────────────────────
function TabDespachos({ personas, empresas, despachos, onIngresoDespacho, onSalidaDespacho }) {
  const [tab, setTab] = useState("pendientes");
  const [guiaBuf, setGuiaBuf] = useState({});
  const hoy = new Date().toISOString().split("T")[0];
  const pendientes = despachos.filter(d => d.estado === "Pendiente");
  const enPlanta = despachos.filter(d => d.estado === "En planta");
  const salidos = despachos.filter(d => d.estado === "Salió");
  const empNombre = (id) => { const e = empresas[id]; return e ? e.razonSocial : "—"; };
  const sctrColor = (venc) => {
    if (!venc) return "var(--rd)";
    const d = Math.floor((new Date(venc) - new Date()) / 86400000);
    return d < 0 ? "var(--rd)" : d <= 30 ? "var(--am)" : "var(--gn)";
  };
  const DespachoCard = ({ d }) => (
    <div style={{ ...SC, borderLeft: d.estado === "En planta" ? "3px solid var(--gn)" : d.estado === "Salió" ? "3px solid var(--tx3)" : "3px solid var(--ac)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{empNombre(d.empresaId)}</div>
          <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 6 }}>PO: {d.mercancia.po} — {d.mercancia.descripcion}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <Badge t={d.estado === "En planta" ? "green" : d.estado === "Salió" ? "gray" : "blue"}>{d.estado}</Badge>
            <Badge t="gray">📅 Llegada esperada: {d.fechaRegistro}</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
            <div style={{ background: "var(--sf2)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontWeight: 500, marginBottom: 4, color: "var(--tx2)" }}>🚗 Vehículo</div>
              <div>Placa: <strong>{d.vehiculo.placa}</strong> — {d.vehiculo.marca}</div>
              <div style={{ color: "var(--tx3)", fontSize: 11 }}>SOAT: {d.vehiculo.soatVenc} · Lic: {d.vehiculo.licVenc}</div>
              <div style={{ color: "var(--tx3)", fontSize: 11 }}>Insp: {d.vehiculo.inspVenc} · Seg: {d.vehiculo.segVenc}</div>
            </div>
            <div style={{ background: "var(--sf2)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontWeight: 500, marginBottom: 4, color: "var(--tx2)" }}>👤 Chofer</div>
              <div>{d.chofer.nombre}</div>
              <div style={{ color: "var(--tx3)", fontSize: 11 }}>{d.chofer.tipoDoc || "DNI"}: {d.chofer.dni} · Tel: {d.chofer.tel}</div>
              <div style={{ color: sctrColor(d.chofer.sctrVenc), fontSize: 11 }}>SCTR: {d.chofer.sctrPoliza} — Vence: {d.chofer.sctrVenc}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", minWidth: 160 }}>
          {d.estado === "Pendiente" && (
            <div style={{ width: "100%" }}>
              <label style={{ fontSize: 11, color: "var(--tx3)", display: "block", marginBottom: 4 }}>N° de guía de remisión</label>
              <input style={{ ...SI, marginBottom: 6 }} placeholder="GR-2026-xxxxx" value={guiaBuf[d.id] || ""} onChange={e => setGuiaBuf(g => ({ ...g, [d.id]: e.target.value }))} />
              <Btn c="green" onClick={() => {
                const guia = guiaBuf[d.id] || "";
                if (!guia.trim()) { alert("Ingresa el N° de guía de remisión."); return; }
                const hora = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
                onIngresoDespacho(d.id, guia, hora);
              }}>🔓 Dar ingreso al vehículo</Btn>
            </div>
          )}
          {d.estado === "En planta" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--gn)", fontWeight: 500, marginBottom: 4 }}>✅ Ingresó: {d.ingresoHora}</div>
              <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 6 }}>Guía: {d.guia}</div>
              <Btn c="red" onClick={() => {
                const hora = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
                onSalidaDespacho(d.id, hora);
              }}>🚪 Registrar salida</Btn>
            </div>
          )}
          {d.estado === "Salió" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 500 }}>Ingresó: {d.ingresoHora}</div>
              <div style={{ fontSize: 12, color: "var(--rd)", fontWeight: 500 }}>Salió: {d.salidaHora}</div>
              <div style={{ fontSize: 11, color: "var(--tx3)" }}>Guía: {d.guia}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return (
    <div>
      <TabBar tabs={[["pendientes","🔵 Pendientes (" + pendientes.length + ")"],["enplanta","✅ En planta (" + enPlanta.length + ")"],["historial","📒 Historial (" + salidos.length + ")"]]} active={tab} onSelect={setTab} />
      {tab === "pendientes" && (pendientes.length === 0 ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--tx3)" }}>Sin despachos pendientes de ingreso.</div> : pendientes.map(d => <DespachoCard key={d.id} d={d} />))}
      {tab === "enplanta" && (enPlanta.length === 0 ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--tx3)" }}>Sin vehículos en planta ahora.</div> : enPlanta.map(d => <DespachoCard key={d.id} d={d} />))}
      {tab === "historial" && (salidos.length === 0 ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--tx3)" }}>Sin historial de despachos.</div> : salidos.map(d => <DespachoCard key={d.id} d={d} />))}
    </div>
  );
}

// ── SAFETY ────────────────────────────────────────────────
function ModSafety({ personas, onInd, onCap }) {
  const [tab, setTab] = useState("cont");
  const [modo, setModo] = useState("pendientes"); // "pendientes" | "buscar"
  const [q, setQ] = useState("");
  const [dates, setDates] = useState({});
  const [confirmados, setConfirmados] = useState({});
  const onVistoBueno = (pid, fecha) => { onInd(pid, fecha); };
  const onAprobacionVirtual = (pid, fecha) => { onCap(pid, fecha); };
  const STAB = { padding: "6px 14px", fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: "pointer", border: "0.5px solid var(--color-border-secondary)" };
  const lista = Object.values(personas);

  const BADGE_TIPO = {
    contratista: ["blue",  "Contratista"],
    induccion:   ["amber", "Inducción de sitio"],
    visitante:   ["teal",  "Visita"],
  };

  // Tarjeta reutilizable para contratista/induccion
  const CardCont = ({ p }) => {
    const tipo = p.tipo;
    const [badgeT, badgeL] = BADGE_TIPO[tipo] || ["gray", tipo];
    const ind = indSt(p.ind || p.induccion); const exp = indExp(p.ind || p.induccion); const dv = dates[p.id] || today();
    const IC = {
      vigente:  ["#EAF3DE","#97C459","✅","Inducción vigente","Válida hasta: " + exp],
      proximo:  ["#FAEEDA","#FAC775","⚠️","Por vencer","Vence: " + exp],
      vencido:  ["#FCEBEB","#F09595","❌","Inducción vencida","Venció: " + exp],
      none:     ["var(--color-background-secondary)","var(--color-border-tertiary)","🕐","Sin inducción","Pendiente de completar inducción de sitio"],
    };
    const [bg, border, ico, title, sub] = IC[ind] || IC.none;
    const aprobadoAhora = !!confirmados[p.id];
    return (
      <div style={SC}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Avt nombre={p.nombre} color={p.color} size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{p.nombre}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{p.cargo || "Sin cargo"} · DNI {p.dni || "—"}</div>
            <div style={{ marginTop: 4 }}><Badge t={badgeT}>{badgeL}</Badge></div>
          </div>
          <IDB id={p.id} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 8, background: bg, border: "0.5px solid " + border, marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>{ico}</span>
          <div><strong>{title}</strong><div style={{ fontSize: 12 }}>{sub}</div></div>
        </div>
        {aprobadoAhora
          ? (
            <div style={{ padding: "8px 12px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11" }}>
              ✅ Inducción confirmada en esta sesión — válida hasta {indExp(confirmados[p.id])}
              {tipo === "induccion" && <div style={{ marginTop: 4, fontWeight: 500 }}>🔧 Puede pasar a trabajos en planta hoy. Vigilancia puede autorizar el cambio.</div>}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Fecha de inducción:</label>
              <input type="date" value={dv} onChange={e => setDates(d => ({ ...d, [p.id]: e.target.value }))} style={{ padding: "5px 8px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, fontSize: 12, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
              <button onClick={() => { onVistoBueno(p.id, dv); setConfirmados(prev => ({ ...prev, [p.id]: dv })); }} style={{ padding: "7px 14px", background: "#3B6D11", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>✔ Confirmar visto bueno Safety</button>
            </div>
          )
        }
      </div>
    );
  };

  // Tarjeta reutilizable para visitante
  const CardVis = ({ p }) => (
    <div style={SC}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <Avt nombre={p.nombre} color={p.color} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{p.nombre}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{p.cargo || "Sin cargo"} · DNI {p.dni || "—"}</div>
        </div>
        <IDB id={p.id} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 8, background: p.cap ? "#EAF3DE" : "var(--color-background-secondary)", border: p.cap ? "0.5px solid #97C459" : "0.5px solid var(--color-border-tertiary)", marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{p.cap ? "✅" : "🖥"}</span>
        <div>
          <strong>{p.cap ? "Capacitación virtual aprobada" : "Pendiente de aprobación"}</strong>
          <div style={{ fontSize: 12 }}>{p.cap ? "Aprobada el " + p.cap : "Safety confirma que el visitante completó la capacitación."}</div>
        </div>
      </div>
      {!p.cap && <button onClick={() => onAprobacionVirtual(p.id, today())} style={{ padding: "7px 14px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>✔ Confirmar aprobación capacitación virtual</button>}
      {p.cap && <Badge t="green">Acceso habilitado por Safety</Badge>}
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>❤️ Panel Safety</p>
      <TabBar tabs={[["cont","Contratistas e Inducción"],["vis","Visitantes — cap. virtual"]]} active={tab} onSelect={t => { setTab(t); setQ(""); setModo("pendientes"); }} />

      {/* Selector de modo */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <button onClick={() => { setModo("pendientes"); setQ(""); }} style={{ ...STAB, background: modo === "pendientes" ? "var(--color-background-inverse)" : "var(--color-background-primary)", color: modo === "pendientes" ? "var(--color-text-inverse)" : "var(--color-text-secondary)" }}>
          📋 Pendientes
        </button>
        <button onClick={() => setModo("buscar")} style={{ ...STAB, background: modo === "buscar" ? "var(--color-background-inverse)" : "var(--color-background-primary)", color: modo === "buscar" ? "var(--color-text-inverse)" : "var(--color-text-secondary)" }}>
          🔍 Buscar persona
        </button>
      </div>

      {/* MODO PENDIENTES */}
      {modo === "pendientes" && tab === "cont" && (() => {
        const todos = lista.filter(p => p.tipo === "contratista" || p.tipo === "induccion");
        const pendientes = todos.filter(p => !confirmados[p.id] && indSt(p.ind || p.induccion) !== "vigente" && indSt(p.ind || p.induccion) !== "proximo");
        const aprobadosHoy = todos.filter(p => confirmados[p.id]);
        return (
          <>
            {pendientes.length === 0 && aprobadosHoy.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>Sin pendientes. Todos los contratistas están al día.</div>
            )}
            {pendientes.length === 0 && aprobadosHoy.length > 0 && (
              <div style={{ padding: "10px 14px", background: "#EAF3DE", borderRadius: 8, fontSize: 13, color: "#3B6D11", marginBottom: "1rem" }}>
                ✅ Todos los contratistas tienen inducción al día.
              </div>
            )}
            {pendientes.map(p => <CardCont key={p.id} p={p} />)}
            {aprobadosHoy.length > 0 && (
              <div style={{ marginTop: 8, padding: "10px 14px", background: "var(--color-background-secondary)", borderRadius: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                ✅ Confirmados en esta sesión: {aprobadosHoy.map(p => p.nombre).join(", ")}
              </div>
            )}
          </>
        );
      })()}

      {modo === "pendientes" && tab === "vis" && (() => {
        const pendientes = lista.filter(p => p.tipo === "visitante" && !p.cap);
        return pendientes.length === 0
          ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>Sin visitantes pendientes de aprobación.</div>
          : pendientes.map(p => <CardVis key={p.id} p={p} />);
      })()}

      {/* MODO BÚSQUEDA */}
      {modo === "buscar" && (
        <div>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, DNI o ID..."
            style={{ ...SI, marginBottom: "1rem" }}
            autoFocus
          />
          {q.length < 2 && (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)" }}>Ingresa al menos 2 caracteres para buscar.</div>
          )}
          {q.length >= 2 && (() => {
            const tipo = tab === "cont" ? ["contratista","induccion"] : ["visitante"];
            const results = lista.filter(p =>
              tipo.includes(p.tipo) && (
                p.nombre.toLowerCase().includes(q.toLowerCase()) ||
                (p.dni && p.dni.includes(q)) ||
                p.id.toLowerCase().includes(q.toLowerCase())
              )
            );
            if (!results.length) return (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)" }}>⚠ Persona no encontrada en el registro.</div>
            );
            return results.map(p => tab === "cont" ? <CardCont key={p.id} p={p} /> : <CardVis key={p.id} p={p} />);
          })()}
        </div>
      )}
    </div>
  );
}

// ── BITÁCORA ──────────────────────────────────────────────
function ModBitacora() {
  const [obs, setObs] = useState([]);
  const [txt, setTxt] = useState(""); const [tipo, setTipo] = useState("Novedad general");
  const [turno, setTurno] = useState("dia"); const [fecha, setFecha] = useState(today());
  const [oficial, setOficial] = useState("");
  const filtradas = obs.filter(o => o.turno === turno && o.fecha === fecha);
  const TC = { "Novedad general": "gray", "Incidente de seguridad": "red", "Ingreso fuera de horario": "amber", "SCTR vencido": "red", "Sin inducción": "amber", "EPP incompleto": "amber", "Herramienta no retirada": "red", "Empresa restringida": "red", "Otro": "gray" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <p style={{ fontSize: 15, fontWeight: 500 }}>📒 Bitácora de turnos</p>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={turno} onChange={e => setTurno(e.target.value)} style={{ ...SI, width: "auto" }}>
            <option value="dia">Día (06:00-14:00)</option><option value="tarde">Tarde (14:00-22:00)</option><option value="noche">Noche (22:00-06:00)</option>
          </select>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...SI, width: "auto" }} />
        </div>
      </div>
      <div style={SC}>
        {/* Campo obligatorio de oficial */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Oficial de Vigilancia *</label>
          <input
            value={oficial}
            onChange={e => setOficial(e.target.value)}
            placeholder="Nombre completo del oficial que realiza el registro..."
            style={{ ...SI, borderColor: oficial.trim() ? "var(--color-border-tertiary)" : "#F09595" }}
          />
          {!oficial.trim() && <div style={{ fontSize: 11, color: "#A32D2D", marginTop: 4 }}>⚠ Campo obligatorio para registrar en la bitácora.</div>}
        </div>
        <textarea value={txt} onChange={e => setTxt(e.target.value)} rows={3} placeholder="Registrar novedad u observación del turno..." style={{ ...SI, resize: "vertical" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...SI, width: "auto" }}>{Object.keys(TC).map(t => <option key={t}>{t}</option>)}</select>
          <Btn c="blue" sm onClick={() => {
            if (!oficial.trim()) { alert("Ingresa el nombre del oficial de vigilancia."); return; }
            if (!txt.trim()) return;
            setObs(o => [{ txt, tipo, turno, fecha, hora: nowTime(), oficial: oficial.trim() }, ...o]);
            setTxt("");
          }}>+ Registrar</Btn>
        </div>
      </div>
      <div style={SC}>
        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: "1rem" }}>Registro del turno</p>
        {filtradas.length === 0 ? <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--color-text-secondary)" }}>Sin observaciones en este turno.</div>
          : filtradas.map((o, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: i < filtradas.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <Badge t={TC[o.tipo] || "gray"}>{o.tipo}</Badge>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>🛡 {o.oficial}</span>
              </div>
              <div style={{ fontSize: 13 }}>{o.txt}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>🕐 {o.hora}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── REPORTES ──────────────────────────────────────────────
function ModReportes({ personas, empresas, accesos, equipos, herramientas }) {
  const pL = Object.values(personas); const eL = Object.values(empresas);
  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>📊 Resumen general</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: "1.5rem" }}>
        {[["Empresas registradas",eL.length],["Bloqueadas / restringidas",eL.filter(e=>e.estado!=="activo").length],["Personas registradas",pL.length],["En planta ahora",accesos.filter(a=>!a.salida).length],["Equipos en planta",equipos.filter(e=>!e.salida).length],["Herramientas en planta",herramientas.filter(h=>!h.salida).length]].map(([lbl,val])=>(
          <div key={lbl} style={{ background:"var(--color-background-secondary)",borderRadius:8,padding:"1rem",textAlign:"center" }}>
            <div style={{ fontSize:22,fontWeight:500 }}>{val}</div>
            <div style={{ fontSize:11,color:"var(--color-text-secondary)",marginTop:2 }}>{lbl}</div>
          </div>
        ))}
      </div>
      <div style={SC}>
        <p style={{ fontSize:13,fontWeight:500,marginBottom:"1rem" }}>Directorio de personas</p>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr>{["ID","Nombre","Documento","# Documento","Tipo","Empresa","SCTR","Inducción / Cap.","EPP"].map(h=><th key={h} style={STH}>{h}</th>)}</tr></thead>
            <tbody>
              {pL.length===0?<tr><td colSpan={9} style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)"}}>Sin personas.</td></tr>
              :pL.map(p=>{
                const emp=empresas[p.empId]; const sc=sctrSt((p.sctr && p.sctr.vencimiento)); const ind=indSt(p.ind || p.induccion); const eppOk=EPP.every(e=>p.epp && p.epp[e.key]);
                return(
                  <tr key={p.id}>
                    <td style={STD}><IDB id={p.id}/></td>
                    <td style={{...STD,fontWeight:500}}>{p.nombre}</td>
                    <td style={STD}><Badge t="gray">{p.tipoDoc || "DNI"}</Badge></td>
                    <td style={{...STD, fontFamily:"var(--mono)", fontSize:12}}>{p.dni||"—"}</td>
                    <td style={STD}><Badge t={p.tipo==="contratista"?"blue":p.tipo==="induccion"?"amber":"teal"}>{p.tipo==="contratista"?"Contratista":p.tipo==="induccion"?"Inducción de sitio":"Visita"}</Badge></td>
                    <td style={STD}>{(emp && emp.razonSocial)||"—"}</td>
                    <td style={STD}><Badge t={sc==="vigente"?"green":sc==="proximo"?"amber":"red"}>{sc==="vigente"?"Vigente":sc==="proximo"?"Por vencer":"Vencido/Sin"}</Badge></td>
                    <td style={STD}>{p.tipo==="contratista"||p.tipo==="induccion"?<Badge t={ind==="vigente"?"green":ind==="proximo"?"amber":ind==="none"?"gray":"red"}>{ind==="vigente"?"Vigente hasta " + indExp(p.ind||p.induccion):ind==="proximo"?"Por vencer":ind==="none"?"Sin inducción":"Vencida"}</Badge>:<Badge t={p.cap?"green":"red"}>{p.cap?"Virtual aprobada":"Pendiente"}</Badge>}</td>
                    <td style={STD}><Badge t={eppOk?"green":"amber"}>{eppOk?"Completo":"Parcial"}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── SUSPENSIONES ─────────────────────────────────────────
function ModSuspensiones({ personas, empresas, solicitudes, onSolicitarBloqueo, onAprobarBloqueo, onDesbloquear, onAprobarBloqueoEmp, onRechazarEmp, user }) {
  const [tab, setTab] = useState("solicitudes");
  const [q, setQ] = useState("");
  const [modalSol, setModalSol] = useState(null); // { pid, nombre } — nueva solicitud
  const [motivo, setMotivo] = useState("");
  const [rechazarId, setRechazarId] = useState(null);
  const [rechazarMotivo, setRechazarMotivo] = useState("");

  const pLista = Object.values(personas);
  const isAdmin = user && user.rol === "admin";

  // Personas suspendidas actualmente
  const suspendidas = pLista.filter(p => p.bloqueado);
  // Solicitudes de personas
  const pendientesPersonas = solicitudes.filter(s => s.estado === "pendiente" && s.tipo !== "empresa");
  // Solicitudes de empresas
  const pendientesEmpresas = solicitudes.filter(s => s.estado === "pendiente" && s.tipo === "empresa");
  const pendientes = solicitudes.filter(s => s.estado === "pendiente");
  const historial = solicitudes.filter(s => s.estado !== "pendiente");

  const enviarSolicitud = () => {
    if (!modalSol) return;
    if (!motivo.trim()) { alert("Ingresa el motivo de la solicitud."); return; }
    onSolicitarBloqueo(modalSol.pid, {
      nombre: modalSol.nombre,
      motivo: motivo.trim(),
      fecha: today(),
      solicitante: user ? user.nombre : "Vigilancia",
    });
    setModalSol(null);
    setMotivo("");
    alert("Solicitud enviada al Administrador.");
  };

  const STA = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, fontSize: 13, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" };

  return (
    <div>
      {/* Modal nueva solicitud */}
      {modalSol && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: "1rem" }}
          onClick={e => { if (e.target === e.currentTarget) { setModalSol(null); setMotivo(""); } }}>
          <div style={{ background: "#ffffff", borderRadius: 14, width: 340, maxWidth: "100%", overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            {/* Header rojo */}
            <div style={{ background: "#A32D2D", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>🚫 Solicitar suspensión</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 }}>{modalSol.nombre} · {modalSol.pid}</div>
              </div>
              <button onClick={() => { setModalSol(null); setMotivo(""); }}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, cursor: "pointer", color: "#fff", fontSize: 14, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            {/* Cuerpo */}
            <div style={{ padding: "16px", background: "#ffffff" }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#666", display: "block", marginBottom: 6 }}>Motivo de la solicitud *</label>
              <textarea
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid " + (motivo.trim() ? "#97C459" : "#ddd"), borderRadius: 8, fontSize: 13, background: "#fff", color: "#1a1a1a", fontFamily: "inherit", boxSizing: "border-box", resize: "none", outline: "none", lineHeight: 1.5 }}
                rows={4}
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Describe el incidente o razón de la suspensión..."
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => { setModalSol(null); setMotivo(""); }}
                  style={{ flex: 1, padding: "9px", fontSize: 13, fontWeight: 500, background: "#f1f0ee", color: "#5F5E5A", border: "0.5px solid #ddd", borderRadius: 8, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={enviarSolicitud} disabled={!motivo.trim()}
                  style={{ flex: 2, padding: "9px", fontSize: 13, fontWeight: 600, background: motivo.trim() ? "#A32D2D" : "#ccc", color: "#fff", border: "none", borderRadius: 8, cursor: motivo.trim() ? "pointer" : "not-allowed" }}>
                  {motivo.trim() ? "✔ Enviar solicitud" : "Ingresa el motivo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>🚫 Suspensiones</p>
      <TabBar tabs={[["solicitudes","📋 Solicitudes" + (pendientesPersonas.length ? " (" + pendientesPersonas.length + ")" : "")],["empresas","🏢 Empresas" + (pendientesEmpresas.length ? " (" + pendientesEmpresas.length + ")" : "")],["activas","🔴 Suspendidos (" + suspendidas.length + ")"],["buscar","🔍 Buscar trabajador"],["historial","📒 Historial"]]} active={tab} onSelect={setTab} />

      {/* TAB: SOLICITUDES */}
      {tab === "solicitudes" && (
        <div>
          {pendientes.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>Sin solicitudes pendientes.</div>
          )}
          {pendientes.map(s => {
            const p = pLista.find(x => x.id === s.personaId);
            const emp = p ? p.empId : null;
            return (
              <div key={s.id} style={SC}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {p && <Avt nombre={p.nombre} color={p.color} size={40} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{s.nombre}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>ID: {s.personaId} · Solicitado por: {s.solicitante} · {s.fecha}</div>
                    <div style={{ marginTop: 6, padding: "8px 12px", background: "#FCEBEB", borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>
                      ⚠ {s.motivo}
                    </div>
                  </div>
                  <Badge t="amber">Pendiente</Badge>
                </div>
                {isAdmin ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10 }}>
                    <Btn c="red" sm onClick={() => onAprobarBloqueo(s.id, true)}>🚫 Aprobar suspensión</Btn>
                    <Btn sm onClick={() => { setRechazarId(s.id); setRechazarMotivo(""); }}>✕ Rechazar</Btn>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)" }}>⏳ En revisión por el Administrador.</div>
                )}
                {rechazarId === s.id && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                    <input style={{ ...SI, flex: 1 }} placeholder="Motivo del rechazo (opcional)" value={rechazarMotivo} onChange={e => setRechazarMotivo(e.target.value)} />
                    <Btn sm c="red" onClick={() => { onAprobarBloqueo(s.id, false); setRechazarId(null); }}>Confirmar rechazo</Btn>
                    <Btn sm onClick={() => setRechazarId(null)}>Cancelar</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB: SOLICITUDES DE EMPRESAS */}
      {tab === "empresas" && (
        <div>
          {pendientesEmpresas.length === 0 && <div style={{ textAlign:"center", padding:"3rem", color:"var(--color-text-secondary)" }}>Sin solicitudes de bloqueo/restricción de empresas pendientes.</div>}
          {pendientesEmpresas.map(sol => (
            <div key={sol.id} style={{ ...SC, borderLeft:"3px solid " + (sol.accion === "bloqueado" ? "#A32D2D" : "#854F0B") }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:500, fontSize:14 }}>{sol.empresaNombre}</div>
                  <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginTop:2 }}>
                    Acción solicitada: <Badge t={sol.accion === "bloqueado" ? "red" : "amber"}>{sol.accion === "bloqueado" ? "Bloqueo" : "Restricción"}</Badge>
                  </div>
                  <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginTop:4 }}>Solicitado por: <strong>{sol.solicitante}</strong> · {sol.fecha}</div>
                  <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginTop:4 }}>Motivo: {sol.motivo}</div>
                </div>
                {isAdmin && (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <Btn c="green" sm onClick={() => onAprobarBloqueoEmp(sol)}>✔ Aprobar</Btn>
                    <Btn c="red" sm onClick={() => onRechazarEmp(sol.id)}>✕ Rechazar</Btn>
                  </div>
                )}
                {!isAdmin && <Badge t="amber">Pendiente de aprobación</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: SUSPENDIDOS ACTIVOS */}
      {tab === "activas" && (
        <div>
          {suspendidas.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>No hay trabajadores suspendidos actualmente.</div>
          )}
          {suspendidas.map(p => {
            const emp2 = personas[p.empId];
            return (
              <div key={p.id} style={{ ...SC, borderLeft: "3px solid #A32D2D" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Avt nombre={p.nombre} color={p.color} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>DNI: {p.dni || "—"} · {p.cargo || "—"}</div>
                    {p.motivoBloqueo && <div style={{ marginTop: 4, fontSize: 12, color: "#A32D2D" }}>Motivo: {p.motivoBloqueo}</div>}
                    {p.fechaBloqueo && <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Suspendido: {p.fechaBloqueo}</div>}
                  </div>
                  <Badge t="red">Suspendido</Badge>
                </div>
                {isAdmin && (
                  <div style={{ marginTop: 10, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10 }}>
                    <Btn c="green" sm onClick={() => onDesbloquear(p.id)}>✔ Levantar suspensión</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB: BUSCAR PARA SOLICITAR SUSPENSIÓN */}
      {tab === "buscar" && (
        <div>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>Busca al trabajador para solicitar su suspensión al Administrador.</p>
          <input style={{ ...SI, marginBottom: "1rem" }} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, DNI o ID..." />
          {q.length < 2
            ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)" }}>Ingresa al menos 2 caracteres.</div>
            : (() => {
              const results = pLista.filter(p =>
                p.nombre.toLowerCase().includes(q.toLowerCase()) ||
                (p.dni && p.dni.includes(q)) ||
                p.id.toLowerCase().includes(q.toLowerCase())
              );
              if (!results.length) return <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)" }}>Sin resultados.</div>;
              return results.map(p => {
                const yaEnCola = solicitudes.find(s => s.personaId === p.id && s.estado === "pendiente");
                return (
                  <div key={p.id} style={SC}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Avt nombre={p.nombre} color={p.color} size={40} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.nombre}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>DNI: {p.dni || "—"} · {p.cargo || "—"} · {p.id}</div>
                        {p.bloqueado && <Badge t="red">Ya suspendido</Badge>}
                        {yaEnCola && <Badge t="amber">Solicitud pendiente</Badge>}
                      </div>
                      {!p.bloqueado && !yaEnCola && (
                        <Btn c="red" sm onClick={() => { setModalSol({ pid: p.id, nombre: p.nombre }); setMotivo(""); }}>🚫 Solicitar suspensión</Btn>
                      )}
                    </div>
                  </div>
                );
              });
            })()
          }
        </div>
      )}

      {/* TAB: HISTORIAL */}
      {tab === "historial" && (
        <div>
          {historial.length === 0 && <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-secondary)" }}>Sin historial.</div>}
          {historial.map(s => (
            <div key={s.id} style={SC}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{s.nombre} <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{s.personaId}</span></div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Solicitado por: {s.solicitante} · {s.fecha}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Motivo: {s.motivo}</div>
                </div>
                <Badge t={s.estado === "aprobado" || s.estado === "desbloqueado" ? "green" : "red"}>
                  {s.estado === "aprobado" ? "Aprobado" : s.estado === "desbloqueado" ? "Levantado" : "Rechazado"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── VIGENCIAS ─────────────────────────────────────────────
function ModVigencias({ personas, empresas, accesos }) {
  const [filtro, setFiltro] = useState("todos");
  const [busq, setBusq] = useState("");

  const hoy = new Date();

  const pLista = Object.values(personas).filter(p => {
    // Solo personas con registro activo (tienen fechaVencPlanta)
    if (!p.fechaVencPlanta && !p.induccion) return false;
    if (busq.length > 1) {
      const q = busq.toLowerCase();
      return p.nombre.toLowerCase().includes(q) || (p.dni && p.dni.includes(q));
    }
    return true;
  });

  const calcDias = (p) => {
    if (!p.fechaVencPlanta) return null;
    return Math.ceil((new Date(p.fechaVencPlanta + "T23:59:59") - hoy) / 86400000);
  };

  const semaforo = (dias) => {
    if (dias === null) return "gray";
    if (dias < 0)  return "red";
    if (dias <= 3) return "red";
    if (dias <= 7) return "amber";
    return "green";
  };

  const orden = [...pLista].sort((a, b) => {
    const da = calcDias(a) ?? 999;
    const db = calcDias(b) ?? 999;
    return da - db;
  });

  const filtrados = orden.filter(p => {
    const dias = calcDias(p);
    if (filtro === "vencido") return dias !== null && dias < 0;
    if (filtro === "critico") return dias !== null && dias >= 0 && dias <= 3;
    if (filtro === "proximo") return dias !== null && dias > 3 && dias <= 7;
    if (filtro === "vigente") return dias !== null && dias > 7;
    return true;
  });

  const conteos = {
    vencido: orden.filter(p => { const d = calcDias(p); return d !== null && d < 0; }).length,
    critico: orden.filter(p => { const d = calcDias(p); return d !== null && d >= 0 && d <= 3; }).length,
    proximo: orden.filter(p => { const d = calcDias(p); return d !== null && d > 3 && d <= 7; }).length,
    vigente: orden.filter(p => { const d = calcDias(p); return d !== null && d > 7; }).length,
  };

  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--tx)", marginBottom: "1rem" }}>Vigencias de personas registradas</p>

      {/* Contadores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: "1.25rem" }}>
        {[
          ["Vencidos",   conteos.vencido, "red",   "vencido"],
          ["Críticos ≤3d", conteos.critico, "red", "critico"],
          ["Por vencer ≤7d", conteos.proximo, "amber", "proximo"],
          ["Vigentes",   conteos.vigente, "green",  "vigente"],
        ].map(([lbl, n, t, f]) => (
          <div key={f} onClick={() => setFiltro(filtro === f ? "todos" : f)}
            style={{ background: filtro === f ? (t === "red" ? "var(--rd-bg)" : t === "amber" ? "var(--am-bg)" : "var(--gn-bg)") : "var(--sf)", border: "1px solid " + (filtro === f ? (t === "red" ? "var(--rd-bd)" : t === "amber" ? "var(--am-bd)" : "var(--gn-bd)") : "var(--bd2)"), borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s" }}>
            <div style={{ fontSize: 26, fontWeight: 400, fontFamily: "var(--mono)", color: t === "red" ? "var(--rd)" : t === "amber" ? "var(--am)" : "var(--gn)" }}>{n}</div>
            <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 4, fontWeight: 500 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Búsqueda */}
      <input style={{ ...SI, marginBottom: "1rem", maxWidth: 320 }} value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar por nombre o DNI..." />

      {/* Lista */}
      {filtrados.length === 0
        ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--tx3)" }}>Sin personas en este filtro.</div>
        : (
          <div style={{ background: "var(--sf)", border: "1px solid var(--bd2)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Persona", "DNI", "Tipo", "Empresa", "Días en planta", "Vence", "Estado"].map(h => (
                    <th key={h} style={STH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const dias = calcDias(p);
                  const sem  = semaforo(dias);
                  const emp  = empresas[p.empId];
                  return (
                    <tr key={p.id} style={{ background: dias !== null && dias < 0 ? "var(--rd-bg)" : dias !== null && dias <= 3 ? "rgba(180,83,9,0.04)" : "transparent" }}>
                      <td style={STD}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avt nombre={p.nombre} color={p.color || AC[0]} size={28} />
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{p.nombre}</div>
                            <div style={{ fontSize: 10, color: "var(--tx3)", fontFamily: "var(--mono)" }}>{p.id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...STD, fontFamily: "var(--mono)", fontSize: 12 }}>{p.dni || "—"}</td>
                      <td style={STD}>
                        <Badge t={p.tipo === "contratista" ? "blue" : p.tipo === "induccion" ? "amber" : "teal"}>
                          {p.tipo === "contratista" ? "Contratista" : p.tipo === "induccion" ? "Inducción" : "Visita"}
                        </Badge>
                      </td>
                      <td style={{ ...STD, fontSize: 12 }}>{(emp && emp.razonSocial) || "—"}</td>
                      <td style={{ ...STD, fontFamily: "var(--mono)", fontSize: 13, textAlign: "center" }}>
                        {p.diasEnPlanta ? p.diasEnPlanta + "d" : "—"}
                      </td>
                      <td style={{ ...STD, fontFamily: "var(--mono)", fontSize: 12 }}>
                        {p.fechaVencPlanta || "—"}
                      </td>
                      <td style={STD}>
                        {dias === null
                          ? <Badge t="gray">Sin registro</Badge>
                          : dias < 0
                            ? <Badge t="red">Vencido hace {Math.abs(dias)}d</Badge>
                            : dias === 0
                              ? <Badge t="red">Vence hoy</Badge>
                              : dias <= 3
                                ? <Badge t="red">{dias}d restante{dias !== 1 ? "s" : ""}</Badge>
                                : dias <= 7
                                  ? <Badge t="amber">{dias}d restante{dias !== 1 ? "s" : ""}</Badge>
                                  : <Badge t="green">{dias}d restante{dias !== 1 ? "s" : ""}</Badge>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────

const ROLES={
  admin:      { label:"Administrador", color:"#A32D2D", bg:"#FCEBEB",  tabs:["contratistas","registro","vigilancia","safety","suspension","vigencias","bitacora","usr","reportes"] },
  vigilancia: { label:"Vigilancia",    color:"#854F0B", bg:"#FAEEDA",  tabs:["vigilancia","suspension","vigencias","bitacora","reportes"] },
  safety:     { label:"Safety",        color:"#0F6E56", bg:"#E1F5EE",  tabs:["contratistas","safety","reportes"] },
  contratista:{ label:"Contratista",   color:"#185FA5", bg:"#E6F1FB",  tabs:["contratistas","registro"] },
  almacenes:  { label:"Almacenes",     color:"#5B4FCF", bg:"#EDE9FF",  tabs:["contratistas","registro"] },
};
const DEMO={admin:{id:"U0",nombre:"Antonio Vera",rol:"admin",pass:"admin123"},vigilancia:{id:"U1",nombre:"Carlos Quispe",rol:"vigilancia",pass:"vig123"},safety:{id:"U2",nombre:"María López",rol:"safety",pass:"saf123"},contratista:{id:"U3",nombre:"Juan Flores",rol:"contratista",pass:"con123"}};


function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [err,   setErr]   = useState("");
  const [load,  setLoad]  = useState(false);

  const go = async () => {
    if (!email || !pass) { setErr("Ingresa tu email y contraseña."); return; }
    setLoad(true); setErr("");
    try {
      const { data, error } = await supa.auth.signInWithPassword({ email, password: pass });
      if (error) { setErr("Credenciales incorrectas."); setLoad(false); return; }
      const { data: usr } = await supa.from("usuarios").select("*").eq("id", data.user.id).single();
      if (!usr) { setErr("Sin rol asignado. Contacta al administrador."); setLoad(false); return; }
      onLogin({ id: data.user.id, nombre: usr.nombre, email: usr.email, rol: usr.rol });
    } catch(e) {
      setErr("Error de conexión. Verifica tu internet."); setLoad(false);
    }
  };

  const LI = { width:"100%", padding:"8px 12px", border:"1px solid var(--bd2)", borderRadius:8, fontSize:13, background:"var(--sf2)", color:"var(--tx)", fontFamily:"inherit", outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"var(--bg)", padding:"24px" }}>
      {/* Logo Bradken */}
      <div style={{ width:90, height:90, background:"var(--sf)", borderRadius:18, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:24, boxShadow:"0 4px 20px rgba(0,0,0,0.08)", padding:12 }}>
        {/* Ícono fundición / casita industrial */}
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M30 8L8 26v26h16V38h12v14h16V26L30 8z" fill="#1a52a0" fillOpacity="0.12" stroke="#1a52a0" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M8 26L30 8l22 18" stroke="#1a52a0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="24" y="38" width="12" height="14" rx="1.5" fill="#1a52a0" fillOpacity="0.25"/>
          {/* Chimeneas fundición */}
          <rect x="12" y="18" width="5" height="10" rx="1" fill="#1a52a0" fillOpacity="0.4"/>
          <rect x="43" y="18" width="5" height="10" rx="1" fill="#1a52a0" fillOpacity="0.4"/>
        </svg>
      </div>

      <div style={{ fontSize:22, fontWeight:600, color:"var(--ac)", textAlign:"center", marginBottom:4 }}>Control de Acceso</div>
      <div style={{ fontSize:15, fontWeight:500, color:"var(--ac)", textAlign:"center", marginBottom:6 }}>Bradken</div>
      <div style={{ fontSize:13, color:"var(--tx2)", textAlign:"center", marginBottom:32 }}>Chilca · Fundición</div>

      {/* Card login */}
      <div style={{ background:"var(--sf)", border:"1px solid var(--bd2)", borderRadius:16, padding:"28px 24px", width:"100%", maxWidth:360, boxShadow:"0 4px 20px rgba(0,0,0,0.07)" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ fontSize:10, fontWeight:600, color:"var(--tx3)", display:"block", marginBottom:5, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.07em" }}>Email</label>
            <input style={LI} type="email" placeholder="usuario@bradken.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==="Enter" && go()} autoFocus />
          </div>
          <div>
            <label style={{ fontSize:10, fontWeight:600, color:"var(--tx3)", display:"block", marginBottom:5, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.07em" }}>Contraseña</label>
            <input style={LI} type="password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key==="Enter" && go()} />
          </div>
          {err && (
            <div style={{ padding:"8px 12px", background:"var(--rd-bg)", border:"1px solid var(--rd-bd)", borderRadius:8, fontSize:12, color:"var(--rd)" }}>{err}</div>
          )}
          <button onClick={go} disabled={load} style={{ padding:"10px", background: load ? "var(--bd2)" : "var(--ac)", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:500, cursor: load ? "not-allowed" : "pointer", fontFamily:"inherit" }}>
            {load ? "Verificando..." : "Ingresar al sistema"}
          </button>
        </div>
      </div>

      <div style={{ marginTop:24, fontSize:10, color:"var(--tx3)", fontFamily:"var(--mono)", letterSpacing:"0.05em" }}>
        BRADKEN CHILCA · CONTROL DE ACCESO
      </div>
    </div>
  );
}

const QRC = ({ value, size = 108 }) => {
  const ref = useRef();
  useEffect(() => {
    if (!ref.current) return;
    const cv = ref.current, ctx = cv.getContext("2d");
    cv.width = size; cv.height = size;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
    const cell = Math.floor(size / 21);
    const h = value.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    ctx.fillStyle = "#185FA5";
    for (let r = 0; r < 21; r++) for (let c = 0; c < 21; c++) {
      const corn = (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7);
      const dark = corn ? ((r === 0 || r === 6 || c === 0 || c === 6) && corn) || (r >= 2 && r <= 4 && c >= 2 && c <= 4 && r < 7 && c < 7) || (r >= 2 && r <= 4 && c >= 15 && c <= 18 && r < 7) || (r >= 15 && r <= 18 && c >= 2 && c <= 4) : (r * 21 + c + h) % 3 === 0;
      if (dark) ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
    }
    [[1,1,5,5,"#fff"],[2,2,3,3,"#185FA5"],[15,1,5,5,"#fff"],[16,2,3,3,"#185FA5"],[1,15,5,5,"#fff"],[2,16,3,3,"#185FA5"]].forEach(([x,y,w,h2,fill]) => { ctx.fillStyle = fill; ctx.fillRect(x * cell, y * cell, w * cell, h2 * cell); });
  }, [value, size]);
  return <canvas ref={ref} style={{ borderRadius: 6, display: "block" }} />;
};

function QRModal({ persona, empresa, onClose }) {
  const print = () => {
    const w = window.open("", "_blank");
    const ini = persona.nombre.split(" ").map(x => x[0]).slice(0, 2).join("");
    w.document.write(
      '<html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif">' +
      '<div style="border:2px solid #185FA5;border-radius:12px;padding:20px;width:220px;text-align:center">' +
      (false ? '' :
        '<div style="width:70px;height:70px;border-radius:50%;background:#E6F1FB;color:#185FA5;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:22px;margin:0 auto 8px">' + ini + '</div>') +
      '<div style="background:#E6F1FB;color:#185FA5;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:bold;display:inline-block;margin-bottom:6px">' + persona.id + '</div>' +
      '<div style="font-weight:bold;font-size:14px">' + persona.nombre + '</div>' +
      '<div style="font-size:11px;color:#666">' + ((empresa && empresa.razonSocial) || '') + '</div>' +
      '</div></body></html>'
    );
    w.document.close(); w.print();
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1.5rem", width: 268, textAlign: "center", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-text-secondary)" }}>✕</button>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, marginBottom: 8 }}>BRADKEN CHILCA — CREDENCIAL</div>
        {persona.foto
          ? <img src={persona.foto} alt="" style={{ width: 68, height: 68, borderRadius: "50%", objectFit: "cover", border: "2px solid #85B7EB", marginBottom: 8 }} />
          : <div style={{ width: 68, height: 68, borderRadius: "50%", background: persona.color.bg, color: persona.color.col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 500, margin: "0 auto 8px" }}>{persona.nombre.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>}
        <div style={{ margin: "8px 0" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#E6F1FB", color: "#185FA5", border: "0.5px solid #85B7EB", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 500 }}>🪪 {persona.id}</span></div>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{persona.nombre}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>{persona.cargo || ""} — {(empresa && empresa.razonSocial) || ""}</div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><QRC value={persona.id} size={108} /></div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 12 }}>Escanea para verificar identidad</div>
        <button onClick={print} style={{ padding: "5px 10px", fontSize: 12, fontWeight: 500, background: "#185FA5", color: "#fff", border: "0.5px solid #185FA5", borderRadius: 8, cursor: "pointer" }}>🖨 Imprimir credencial</button>
      </div>
    </div>
  );
}

function Alertas({ personas, empresas }) {
  const al = [];
  Object.values(personas).forEach(p => {
    const sc = sctrSt((p.sctr && p.sctr.vencimiento)); const ind = indSt(p.induccion);
    const ds = (p.sctr && p.sctr.vencimiento) ? Math.ceil((new Date(p.sctr.vencimiento) - new Date()) / 86400000) : null;
    const di = p.induccion ? Math.ceil((new Date(indExp(p.induccion)) - new Date()) / 86400000) : null;
    if (sc === "vencido") al.push({ t: "red", msg: "SCTR vencido - " + p.nombre, sub: (p.sctr && p.sctr.vencimiento) });
    else if (sc === "proximo") al.push({ t: "amber", msg: "SCTR vence en " + ds + " dias - " + p.nombre, sub: (p.sctr && p.sctr.vencimiento) });
    if (ind === "vencido") al.push({ t: "red", msg: "Induccion vencida - " + p.nombre, sub: indExp(p.induccion) });
    else if (ind === "proximo") al.push({ t: "amber", msg: "Induccion vence en " + di + " dias - " + p.nombre, sub: indExp(p.induccion) });
  });
  if (!al.length) return <div style={{ padding: "10px 14px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", marginBottom: "1rem" }}>✅ Sin alertas activas</div>;
  return (
    <div style={{ marginBottom: "1rem" }}>
      {al.slice(0, 5).map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 8, padding: "8px 12px", background: a.t === "red" ? "#FCEBEB" : "#FAEEDA", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
          <span>{a.t === "red" ? "🔴" : "🟡"}</span>
          <div><div style={{ fontWeight: 500, color: a.t === "red" ? "#A32D2D" : "#854F0B" }}>{a.msg}</div><div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{a.sub}</div></div>
        </div>
      ))}
    </div>
  );
}

function ModUsuarios({ onRefresh }) {
  const [tab, setTab] = useState("lista");
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [f, setF] = useState({ nombre: "", email: "", rol: "vigilancia", pass: "" });
  const upd = (k, v) => setF(x => ({ ...x, [k]: v }));
  const SI2 = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, fontSize: 13, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontFamily: "inherit", boxSizing: "border-box" };

  const cargar = async () => {
    setLoading(true);
    const { data } = await supa.from("usuarios").select("*").order("nombre");
    if (data) setLista(data);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const crearUsuario = async () => {
    if (!f.nombre.trim()) { setErr("El nombre es obligatorio."); return; }
    if (!f.email.trim()) { setErr("El email es obligatorio."); return; }
    if (!f.pass || f.pass.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres."); return; }
    setErr("");
    try {
      // 1. Crear en Supabase Auth
      const { data: authData, error: authErr } = await supa.auth.admin
        ? await supa.auth.signUp({ email: f.email, password: f.pass })
        : await supa.auth.signUp({ email: f.email, password: f.pass });
      if (authErr) { setErr("Error al crear usuario: " + authErr.message); return; }
      const uid = authData?.user?.id;
      if (!uid) { setErr("No se pudo obtener el ID del usuario."); return; }
      // 2. Insertar en tabla usuarios
      await supa.from("usuarios").insert({ id: uid, nombre: f.nombre.trim(), email: f.email.trim(), rol: f.rol, activo: true });
      setOk("Usuario " + f.nombre + " creado correctamente. Ya puede iniciar sesión.");
      setF({ nombre: "", email: "", rol: "vigilancia", pass: "" });
      setTab("lista");
      cargar();
      setTimeout(() => setOk(""), 5000);
    } catch(e) { setErr("Error inesperado: " + e.message); }
  };

  const toggleActivo = async (u) => {
    await supa.from("usuarios").update({ activo: !u.activo }).eq("id", u.id);
    setLista(prev => prev.map(x => x.id === u.id ? { ...x, activo: !u.activo } : x));
  };

  const actualizarRol = async (uid, nuevoRol) => {
    await supa.from("usuarios").update({ rol: nuevoRol }).eq("id", uid);
    setLista(prev => prev.map(x => x.id === uid ? { ...x, rol: nuevoRol } : x));
  };

  const actualizarNombre = async (uid, nuevoNombre) => {
    await supa.from("usuarios").update({ nombre: nuevoNombre }).eq("id", uid);
    setLista(prev => prev.map(x => x.id === uid ? { ...x, nombre: nuevoNombre } : x));
    setEditId(null);
  };

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: "1rem" }}>👥 Gestión de usuarios</p>
      {ok && <div style={{ padding:"10px 14px", background:"#EAF3DE", border:"1px solid #A3D4B5", borderRadius:10, fontSize:12, color:"#3B6D11", marginBottom:"1rem" }}>✅ {ok}</div>}
      {err && <div style={{ padding:"10px 14px", background:"#FCEBEB", border:"1px solid #F09595", borderRadius:10, fontSize:12, color:"#A32D2D", marginBottom:"1rem" }}>⚠ {err}</div>}
      <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "1.5rem" }}>
        {[["lista","Usuarios"],["nuevo","Nuevo usuario"]].map(([id,l]) => (
          <div key={id} onClick={() => { setTab(id); setErr(""); }} style={{ padding:"8px 14px", fontSize:13, cursor:"pointer", color: tab===id?"var(--color-text-primary)":"var(--color-text-secondary)", borderBottom: tab===id?"2px solid #185FA5":"2px solid transparent", fontWeight: tab===id?500:400, marginBottom:-0.5 }}>{l}</div>
        ))}
      </div>

      {tab === "nuevo" && (
        <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, padding:"1.25rem", marginBottom:"1rem" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Nombre completo *</label>
              <input style={SI2} value={f.nombre} onChange={e => upd("nombre", e.target.value)} placeholder="Nombres y apellidos" />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Email *</label>
              <input type="email" style={SI2} value={f.email} onChange={e => upd("email", e.target.value)} placeholder="usuario@bradkenchilca.pe" />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Contraseña * (mín. 6 caracteres)</label>
              <input type="password" style={SI2} value={f.pass} onChange={e => upd("pass", e.target.value)} placeholder="••••••••" />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Rol *</label>
              <select style={SI2} value={f.rol} onChange={e => upd("rol", e.target.value)}>
                {Object.entries(ROLES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ padding:"8px 12px", background:"#E6F1FB", borderRadius:8, fontSize:12, color:"#185FA5", marginBottom:12 }}>
            ℹ El usuario podrá iniciar sesión inmediatamente con el email y contraseña que establezcas.
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button onClick={() => { setTab("lista"); setErr(""); }} style={{ padding:"8px 16px", fontSize:13, fontWeight:500, background:"var(--color-background-primary)", color:"var(--color-text-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:8, cursor:"pointer" }}>Cancelar</button>
            <button onClick={crearUsuario} style={{ padding:"8px 16px", fontSize:13, fontWeight:500, background:"#185FA5", color:"#fff", border:"0.5px solid #185FA5", borderRadius:8, cursor:"pointer" }}>✔ Crear y activar usuario</button>
          </div>
        </div>
      )}

      {tab === "lista" && (
        <div>
          {loading ? <div style={{ textAlign:"center", padding:"2rem", color:"var(--color-text-secondary)" }}>Cargando usuarios...</div>
          : lista.length === 0 ? <div style={{ textAlign:"center", padding:"2rem", color:"var(--color-text-secondary)" }}>Sin usuarios.</div>
          : lista.map(u => {
            const rol = ROLES[u.rol] || { label: u.rol, color:"#5F5E5A", bg:"#F1EFE8" };
            const iniciales = u.nombre ? u.nombre.split(" ").map(w=>w[0]).slice(0,2).join("") : "?";
            return (
              <div key={u.id} style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, padding:"1rem 1.25rem", marginBottom:"0.75rem", opacity: u.activo ? 1 : 0.65 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <div style={{ width:40, height:40, borderRadius:"50%", background:rol.bg, color:rol.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:500, flexShrink:0 }}>{iniciales}</div>
                  <div style={{ flex:1, minWidth:120 }}>
                    {editId === u.id
                      ? <input defaultValue={u.nombre} onBlur={e => actualizarNombre(u.id, e.target.value)} autoFocus style={{ ...SI2, fontWeight:500, padding:"4px 8px" }} />
                      : <div style={{ fontWeight:500, cursor:"pointer" }} onClick={() => setEditId(u.id)} title="Clic para editar nombre">{u.nombre} ✏️</div>
                    }
                    <div style={{ fontSize:11, color:"var(--color-text-secondary)", marginTop:2 }}>{u.email}</div>
                  </div>
                  <select value={u.rol} onChange={e => actualizarRol(u.id, e.target.value)} style={{ ...SI2, width:"auto", fontSize:11, padding:"4px 8px", background:rol.bg, color:rol.color, border:"none", fontWeight:500 }}>
                    {Object.entries(ROLES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <span style={{ background:u.activo?"#EAF3DE":"#F1EFE8", color:u.activo?"#3B6D11":"#5F5E5A", padding:"3px 8px", borderRadius:6, fontSize:11, fontWeight:500 }}>{u.activo?"Activo":"Inactivo"}</span>
                  <button onClick={() => toggleActivo(u)} style={{ padding:"5px 10px", fontSize:12, fontWeight:500, background:u.activo?"#A32D2D":"#3B6D11", color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>{u.activo?"Desactivar":"Activar"}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [qrPerson, setQrPerson] = useState(null);
  const [screen, setScreen] = useState("contratistas");
  const [empresas, setEmpresas] = useState({});
  const [personas, setPersonas] = useState({});
  const [accesos, setAccesos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [herramientas, setHerramientas] = useState([]);
  const [despachos, setDespachos] = useState([]);
  const [usuarios, setUsuarios] = useState({ ...DEMO });
  const [solicitudes, setSolicitudes] = useState([]);

  // ── DATOS DE DEMO ─────────────────────────────────────────
  useEffect(() => {
    const E1 = "EMP-001"; const E2 = "EMP-002"; const E3 = "EMP-003";
    ec = 3;
    const empDemo = {
      [E1]: { id: E1, ruc: "20512345678", razonSocial: "Metalmec S.A.C.", rubro: "Mantenimiento mecánico", contactoNombre: "José Ríos", contactoEmail: "jrios@metalmec.pe", estado: "activo", observacion: "", fechaReg: "2026-04-01" },
      [E2]: { id: E2, ruc: "20587654321", razonSocial: "Tecno Electro S.A.C.", rubro: "Electricidad", contactoNombre: "Sandra Vega", contactoEmail: "svega@tecnoelectro.pe", estado: "restringido", observacion: "Incidente leve en zona de fundición — 2026-03-15. Acceso condicionado.", fechaReg: "2026-03-10" },
      [E3]: { id: E3, ruc: "20598760001", razonSocial: "Ingeniería Civil Perú S.A.", rubro: "Construcción", contactoNombre: "Marco Huamán", contactoEmail: "mhuaman@icperu.pe", estado: "activo", observacion: "", fechaReg: "2026-04-20" },
    };
    setEmpresas(empDemo);

    pc = 0;
    const mkP = (nombre, dni, cargo, tipo, empId, sctrV, indF, epp, color, fechaPrevista) => {
      const id = genPId();
      return { id, nombre, dni, cargo, tipo, empId, color: AC[color % AC.length],
        sctr: { poliza: "SCTR-2026-0" + id.slice(-3), aseguradora: "Rimac Seguros", vencimiento: sctrV, url: null },
        ind: indF, capacitacionVirtual: tipo === "visitante" ? (indF ? indF : null) : null,
        induccion: indF, epp: { lentes: epp[0], casco: epp[1], chaleco: epp[2], zapatos: epp[3] },
        bloqueado: false, sctrVerificado: false, fechaPrevista: fechaPrevista || null,
        respBradken: { nombre: "Antonio Vera", email: "avera@bradken.com", tel: "+51 987 654 321" },
        registradoPor: { nombre: "Antonio Vera", cargo: "Responsable Bradken" },
      };
    };

    const hoy = new Date(); const fmtD = (d) => d.toISOString().split("T")[0];
    const enDias = (n) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return fmtD(d); };

    const P = {
      "71234567": mkP("Carlos Mamani Quispe","71234567","Técnico mecánico",     "contratista",E1,"2026-11-30","2025-12-10",[true,true,true,true],0, fmtD(hoy)),
      "72345678": mkP("Rosa Flores Ccama",   "72345678","Supervisora de obra",  "contratista",E1,"2026-08-15","2026-01-20",[true,true,true,false],1, fmtD(hoy)),
      "73456789": mkP("Luis Tapia Condori",  "73456789","Electricista",         "induccion",  E2,"2026-05-20",null,        [true,true,false,true],2, fmtD(hoy)),
      "74567890": mkP("Ana Chávez Ríos",     "74567890","Técnica eléctrica",    "induccion",  E2,"2025-09-10",null,        [true,true,true,true],3, enDias(2)),
      "75678901": mkP("Pedro Salas Huanca",  "75678901","Operador de equipo",   "contratista",E3,"2026-12-01","2026-02-14",[true,true,true,true],0, enDias(1)),
      "76789012": mkP("Marco Villanueva",    "76789012","Ingeniero civil",      "contratista",E3,"2026-10-30","2026-03-01",[true,true,true,true],1, enDias(5)),
      "77890123": mkP("Diana Torres Paz",    "77890123","Representante técnica","visitante",  E2,"2026-06-30",null,        [false,true,true,false],2, fmtD(hoy)),
      "78901234": mkP("Jorge Quispe Lima",   "78901234","Ayudante de obras",    "induccion",  E3,"2026-07-15",null,        [true,true,true,true],3, enDias(3)),
    };
    setPersonas(P);

    const now = new Date();
    const haceMin = m => new Date(now.getTime() - m * 60000).toISOString();
    setAccesos([
      { pid: "PER-0001", nombre: "Carlos Mamani Quispe", empresa: "Metalmec S.A.C.", tipoIngreso: "Trabajos en planta", ingreso: haceMin(140), salida: null },
      { pid: "PER-0005", nombre: "Pedro Salas Huanca", empresa: "Ingeniería Civil Perú S.A.", tipoIngreso: "Trabajos en planta", ingreso: haceMin(75), salida: null },
      { pid: "PER-0006", nombre: "Marco Villanueva", empresa: "Ingeniería Civil Perú S.A.", tipoIngreso: "Trabajos en planta", ingreso: haceMin(55), salida: null },
      { pid: "PER-0002", nombre: "Rosa Flores Ccama", empresa: "Metalmec S.A.C.", tipoIngreso: "Inducción / charla de seguridad", ingreso: haceMin(200), salida: haceMin(120) },
      { pid: "PER-0007", nombre: "Diana Torres Paz", empresa: "Tecno Electro S.A.C.", tipoIngreso: "Visita", ingreso: haceMin(30), salida: haceMin(5) },
    ]);

    setEquipos([
      { id: "EQ-0001", desc: "Retroexcavadora CAT 320D", serie: "CAT-PLH-0032", empId: E3, empNombre: "Ingeniería Civil Perú S.A.", opId: "PER-0005", opNombre: "Pedro Salas Huanca", pid: "PER-0005", docs: { SOAT: true, "Revisión técnica": true, "Permiso de operación": true }, ingreso: haceMin(80), salida: null },
      { id: "EQ-0002", desc: "Generador Kipor 20KVA", serie: "KIP-GEN-2024-11", empId: E2, empNombre: "Tecno Electro S.A.C.", opId: "PER-0003", opNombre: "Luis Tapia Condori", pid: "PER-0003", docs: { SOAT: false, "Revisión técnica": true, "Permiso de operación": true }, ingreso: haceMin(300), salida: haceMin(60) },
    ]);

    setHerramientas([
      { id: "HER-AA01", desc: "Llave stilson 24\"", cant: 3, operador: "Carlos Mamani Quispe", operadorId: "PER-0001", pid: "PER-0001", ingreso: haceMin(130), salida: null },
      { id: "HER-AA02", desc: "Multímetro digital Fluke", cant: 1, operador: "Luis Tapia Condori", operadorId: "PER-0003", pid: "PER-0003", ingreso: haceMin(290), salida: haceMin(55) },
      { id: "HER-AA03", desc: "Amoladora angular 9\"", cant: 2, operador: "Carlos Mamani Quispe", operadorId: "PER-0001", pid: "PER-0001", ingreso: haceMin(130), salida: null },
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CARGA DESDE SUPABASE (cuando hay usuario autenticado) ──
  useEffect(() => {
    if (!user) return;
    cargarDesdeSupabase();
    // Suscripción realtime para accesos
    const ch = supa.channel("accesos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "accesos" }, () => cargarAccesos())
      .subscribe();
    return () => supa.removeChannel(ch);
  }, [user]);

  const cargarDesdeSupabase = async () => {
    await Promise.all([cargarEmpresas(), cargarPersonas(), cargarAccesos(), cargarEquipos(), cargarHerramientas()]);
  };

  const cargarEmpresas = async () => {
    const { data } = await supa.from("empresas").select("*");
    if (data && data.length > 0) {
      const mapa = {};
      data.forEach(e => { mapa[e.id] = { id: e.id, ruc: e.ruc, razonSocial: e.razon_social, rubro: e.rubro, contactoNombre: e.contacto_nombre, contactoEmail: e.contacto_email, estado: e.estado || "activo", observacion: e.observacion || "", fechaReg: e.fecha_reg }; });
      setEmpresas(mapa);
    }
  };

  const cargarPersonas = async () => {
    const { data } = await supa.from("personas").select("*");
    if (data && data.length > 0) {
      const mapa = {};
      data.forEach(p => {
        mapa[p.dni] = {
          id: p.id, dni: p.dni, nombre: p.nombre, cargo: p.cargo, tipo: p.tipo,
          empId: p.emp_id, color: p.color || AC[0],
          sctr: { poliza: p.sctr_poliza, aseguradora: p.sctr_aseguradora, vencimiento: p.sctr_vencimiento, url: p.sctr_url },
          sctrVerificado: p.sctr_verificado || false,
          induccion: p.induccion, ind: p.induccion, capacitacionVirtual: p.capacitacion_virtual, cap: p.capacitacion_virtual,
          epp: { lentes: p.epp_lentes, casco: p.epp_casco, chaleco: p.epp_chaleco, zapatos: p.epp_zapatos },
          fechaPrevista: p.fecha_prevista, bloqueado: p.bloqueado || false,
          motivoBloqueo: p.motivo_bloqueo, fechaBloqueo: p.fecha_bloqueo,
          respBradken: { nombre: p.resp_bradken_nombre, email: p.resp_bradken_email, tel: p.resp_bradken_tel },
          registradoPor: { nombre: p.registrado_por_nombre, cargo: p.registrado_por_cargo },
        };
      });
      setPersonas(mapa);
    }
  };

  const cargarAccesos = async () => {
    const { data } = await supa.from("accesos").select("*").order("ingreso", { ascending: false }).limit(200);
    if (data) setAccesos(data.map(a => ({ pid: a.pid, nombre: a.nombre, empresa: a.empresa, tipoIngreso: a.tipo_ingreso, ingreso: a.ingreso, salida: a.salida, id: a.id })));
  };

  const cargarEquipos = async () => {
    const { data } = await supa.from("equipos").select("*").order("ingreso", { ascending: false });
    if (data) setEquipos(data.map(e => ({ id: e.id, pid: e.pid, empId: e.emp_id, empNombre: e.emp_nombre, opNombre: e.op_nombre, opDni: e.op_dni, desc: e.descripcion, serie: e.serie, docs: { SOAT: e.doc_soat, "Revisión técnica": e.doc_revision, "Permiso de operación": e.doc_permiso }, ingreso: e.ingreso, salida: e.salida })));
  };

  const cargarHerramientas = async () => {
    const { data } = await supa.from("herramientas").select("*").order("ingreso", { ascending: false });
    if (data) setHerramientas(data.map(h => ({ id: h.id, pid: h.pid, operador: h.operador, operadorId: h.operador_id, operadorDni: h.operador_dni, desc: h.descripcion, cant: h.cantidad, ingreso: h.ingreso, salida: h.salida })));
    // Cargar despachos
    const { data: desp } = await supa.from("despachos").select("*").order("created_at", { ascending: false });
    if (desp) setDespachos(desp.map(d => ({ id: d.id, empresaId: d.empresa_id, empresaNombre: d.empresa_nombre, fechaRegistro: d.fecha_registro, chofer: d.chofer, vehiculo: d.vehiculo, mercancia: d.mercancia, estado: d.estado, guia: d.guia || "", ingresoHora: d.ingreso_hora || "", salidaHora: d.salida_hora || "" })));
  };

  const onGuardar = useCallback(async (emp) => {
    setEmpresas(p => ({ ...p, [emp.id]: emp }));
    await supa.from("empresas").upsert({
      id: emp.id, ruc: emp.ruc, razon_social: emp.razonSocial, rubro: emp.rubro,
      contacto_nombre: emp.contactoNombre, contacto_email: emp.contactoEmail,
      estado: emp.estado, observacion: emp.observacion
    });
  }, []);
  const onEstado = useCallback((id, est, obs) => {
    const o = typeof obs === "object" ? obs : { motivo: String(obs || ""), fecha: today() };
    setEmpresas(p => ({ ...p, [id]: { ...p[id], estado: est, observacion: o.motivo, fechaBloqueo: o.fecha } }));
  }, []);
  const onRegistrar = useCallback((empresa, form, filas) => {
    const ids = [];
    setPersonas(prev => {
      const next = { ...prev };
      filas.forEach(f => {
        const docKey = f.dni || f.nombre.toLowerCase().replace(/\s/g, "_");
        const existing = f.existingId
          ? Object.values(next).find(p => p.id === f.existingId)
          : Object.values(next).find(p => p.dni === f.dni);
        if (existing) {
          // Persona ya existe — actualizar datos editables manteniendo historial
          const storeKey = existing.dni || existing.nombre.toLowerCase().replace(/\s/g, "_");
          const dias = filas.some(f2 => f2.tipo === "induccion") ? 1 : Number(form.diasEnPlanta) || 1;
          const fechaVenc = (() => { const d = new Date((form.fechaIng || today()) + "T12:00:00"); d.setDate(d.getDate() + dias); return d.toISOString().split("T")[0]; })();
          next[storeKey] = {
            ...existing,
            nombre: f.nombre || existing.nombre,
            cargo: f.cargo || existing.cargo,
            tipo: f.tipo || existing.tipo,
            empId: empresa.id,
            sctr: { poliza: form.poliza, aseguradora: form.aseg, vencimiento: form.sctrFecha, url: form.sctrUrl || null },
            respBradken: { nombre: form.responsable, email: form.respEmail, tel: form.respTel },
            registradoPor: form.registradoPor === "bradken"
              ? { nombre: form.responsable, cargo: "Responsable Bradken" }
              : { nombre: form.regNombre, cargo: form.regCargo },
            fechaPrevista: form.fechaIng || null,
            diasEnPlanta: dias,
            fechaVencPlanta: fechaVenc,
          };
          ids.push({ id: existing.id, nombre: existing.nombre, accion: "actualizado" });
        } else {
          // Persona nueva
          const id = genPId(); const color = AC[Object.keys(next).length % AC.length];
          const dias = f.tipo === "induccion" ? 1 : Number(form.diasEnPlanta) || 1;
          const fechaVenc = (() => { const d = new Date((form.fechaIng || today()) + "T12:00:00"); d.setDate(d.getDate() + dias); return d.toISOString().split("T")[0]; })();
          next[docKey] = {
            id, nombre: f.nombre, dni: f.dniQ || f.dni, tipoDoc: f.tipoDoc || "DNI", cargo: f.cargo,
            tipo: f.tipo || f.tipoPersona || "contratista",
            empId: empresa.id, color,
            sctr: { poliza: form.poliza, aseguradora: form.aseg, vencimiento: form.sctrFecha, url: form.sctrUrl || null },
            respBradken: { nombre: form.responsable, email: form.respEmail, tel: form.respTel },
            registradoPor: form.registradoPor === "bradken"
              ? { nombre: form.responsable, cargo: "Responsable Bradken" }
              : { nombre: form.regNombre, cargo: form.regCargo },
            fechaPrevista: form.fechaIng || null,
            diasEnPlanta: dias,
            fechaVencPlanta: fechaVenc,
            induccion: null, ind: null, capacitacionVirtual: null, cap: null,
            epp: { lentes: false, casco: false, chaleco: false, zapatos: false },
            bloqueado: false,
          };
          ids.push({ id: next[docKey].id, nombre: f.nombre, accion: "nuevo" });
        }
      });
      return next;
    });
    // Sincronizar personas con Supabase en background
    setTimeout(async () => {
      for (const item of ids) {
        const p = Object.values(personas).find(x => x.id === item.id) ||
          (() => { let found; setPersonas(prev => { found = Object.values(prev).find(x => x.id === item.id); return prev; }); return found; })();
        if (!p) continue;
        await supa.from("personas").upsert({
          id: p.id, nombre: p.nombre, dni: p.dni, tipo_doc: p.tipoDoc || "DNI",
          cargo: p.cargo, tipo: p.tipo, emp_id: p.empId,
          sctr_poliza: p.sctr?.poliza, sctr_aseguradora: p.sctr?.aseguradora,
          sctr_vencimiento: p.sctr?.vencimiento, sctr_url: p.sctr?.url,
          fecha_prevista: p.fechaPrevista, dias_en_planta: p.diasEnPlanta,
          fecha_venc_planta: p.fechaVencPlanta,
          resp_bradken: p.respBradken, bloqueado: false,
        });
      }
    }, 200);
    return { regId: "REG-" + String(Date.now()).slice(-4), personas: ids };
  }, [personas]);
  const onEPP = useCallback((pid, k) => setPersonas(prev => { const next = { ...prev }; const p = Object.values(next).find(x => x.id === pid); if (p) { const key = p.dni || p.nombre.toLowerCase().replace(/\s/g, "_"); next[key] = { ...p, epp: { ...p.epp, [k]: !p.epp[k] } }; } return next; }), []);
  const onIngreso = useCallback(async (pid, tipoIngreso, agente) => {
    const p = Object.values(personas).find(x => x.id === pid);
    if (!p) return;
    const emp = empresas[p.empId];
    const nuevo = { pid, nombre: p.nombre, empresa: (emp && emp.razonSocial) || "—", tipoIngreso, agente: agente || "", ingreso: nowISO(), salida: null };
    setAccesos(prev => [...prev, nuevo]);
    await supa.from("accesos").insert({ pid, nombre: p.nombre, empresa: (emp && emp.razonSocial) || "—", tipo_ingreso: tipoIngreso, agente_ingreso: agente || "" });
  }, [personas, empresas]);
  const onSalida = useCallback(async (pid, agente) => {
    const ts = nowISO();
    setAccesos(prev => prev.map(a => a.pid === pid && !a.salida ? { ...a, salida: ts, agenteSalida: agente || "" } : a));
    setEquipos(prev => prev.map(e => (e.pid === pid || e.opId === pid) && !e.salida ? { ...e, salida: ts } : e));
    setHerramientas(prev => prev.map(h => (h.pid === pid || h.operadorId === pid) && !h.salida ? { ...h, salida: ts } : h));
    await supa.from("accesos").update({ salida: ts, agente_salida: agente || "" }).eq("pid", pid).is("salida", null);
    await supa.from("equipos").update({ salida: ts }).eq("pid", pid).is("salida", null);
    await supa.from("herramientas").update({ salida: ts }).eq("pid", pid).is("salida", null);
  }, []);
  const onInd = useCallback(async (pid, fecha) => {
    setPersonas(prev => { const next = { ...prev }; const p = Object.values(next).find(x => x.id === pid); if (p) { const key = p.dni || p.nombre.toLowerCase().replace(/\s/g, "_"); next[key] = { ...p, induccion: fecha }; } return next; });
    await supa.from("personas").update({ induccion: fecha }).eq("id", pid);
  }, []);
  const onCap = useCallback(async (pid, fecha) => {
    setPersonas(prev => { const next = { ...prev }; const p = Object.values(next).find(x => x.id === pid); if (p) { const key = p.dni || p.nombre.toLowerCase().replace(/\s/g, "_"); next[key] = { ...p, capacitacionVirtual: fecha }; } return next; });
    await supa.from("personas").update({ capacitacion_virtual: fecha }).eq("id", pid);
  }, []);

  const onSolicitarBloqueo = useCallback(async (pid, datos) => {
    const sol = { id: "SOL-" + String(Date.now()).slice(-6), personaId: pid, ...datos, estado: "pendiente" };
    setSolicitudes(prev => [...prev, sol]);
    await supa.from("solicitudes_suspension").insert({ id: sol.id, persona_id: pid, nombre: datos.nombre, motivo: datos.motivo, fecha: datos.fecha, solicitante: datos.solicitante, estado: "pendiente" });
  }, []);

  const onSolicitarBloqueoEmp = useCallback((datos) => {
    const sol = { id: "SOL-EMP-" + String(Date.now()).slice(-6), tipo: "empresa", ...datos, estado: "pendiente" };
    setSolicitudes(prev => [...prev, sol]);
  }, []);

  const onAprobarBloqueo = useCallback(async (solId, aprobado) => {
    setSolicitudes(prev => {
      const updated = prev.map(s => s.id === solId ? { ...s, estado: aprobado ? "aprobado" : "rechazado" } : s);
      if (aprobado) {
        const sol = prev.find(s => s.id === solId);
        if (sol) {
          setPersonas(prev2 => {
            const next = { ...prev2 };
            const p = Object.values(next).find(x => x.id === sol.personaId);
            if (p) { const key = p.dni || p.nombre.toLowerCase().replace(/\s/g, "_"); next[key] = { ...p, bloqueado: true, motivoBloqueo: sol.motivo, fechaBloqueo: sol.fecha }; }
            return next;
          });
          supa.from("personas").update({ bloqueado: true, motivo_bloqueo: sol.motivo }).eq("id", sol.personaId);
        }
      }
      return updated;
    });
    await supa.from("solicitudes_suspension").update({ estado: aprobado ? "aprobado" : "rechazado" }).eq("id", solId);
  }, []);

  const onDesbloquear = useCallback(async (pid) => {
    setPersonas(prev => {
      const next = { ...prev };
      const p = Object.values(next).find(x => x.id === pid);
      if (p) { const key = p.dni || p.nombre.toLowerCase().replace(/\s/g, "_"); next[key] = { ...p, bloqueado: false, motivoBloqueo: null, fechaBloqueo: null }; }
      return next;
    });
    setSolicitudes(prev => prev.map(s => s.personaId === pid && s.estado === "aprobado" ? { ...s, estado: "desbloqueado" } : s));
    await supa.from("personas").update({ bloqueado: false, motivo_bloqueo: null }).eq("id", pid);
    await supa.from("solicitudes_suspension").update({ estado: "desbloqueado" }).eq("persona_id", pid).eq("estado", "aprobado");
  }, []);

  const onInspeccion = useCallback((pid, insp) => {
    // insp: { epp, alcoholTest, objetosExtranos }
    setPersonas(prev => {
      const next = { ...prev };
      const p = Object.values(next).find(x => x.id === pid);
      if (p) { const key = p.dni || p.nombre.toLowerCase().replace(/\s/g, "_"); next[key] = { ...p, inspeccion: { ...insp, fecha: today() } }; }
      return next;
    });
  }, []);

  const onVistoBuenoSctr = useCallback(async (pid, agente) => {
    setPersonas(prev => {
      const next = { ...prev };
      const p = Object.values(next).find(x => x.id === pid);
      if (p) { const key = p.dni || p.nombre.toLowerCase().replace(/\s/g, "_"); next[key] = { ...p, sctrVerificado: true, sctrVerificadoPor: agente || "" }; }
      return next;
    });
    await supa.from("personas").update({ sctr_verificado: true, sctr_verificado_por: agente || "" }).eq("id", pid);
  }, []);

  const onActualizarSctr = useCallback(async (pid, sctr) => {
    setPersonas(prev => {
      const next = { ...prev };
      const p = Object.values(next).find(x => x.id === pid);
      if (p) { const key = p.dni || p.nombre.toLowerCase().replace(/\s/g, "_"); next[key] = { ...p, sctr: { poliza: sctr.poliza, aseguradora: sctr.aseg, vencimiento: sctr.vencimiento }, sctrVerificado: false }; }
      return next;
    });
    await supa.from("personas").update({ sctr_poliza: sctr.poliza, sctr_aseguradora: sctr.aseg, sctr_vencimiento: sctr.vencimiento, sctr_verificado: false }).eq("id", pid);
  }, []);

  const expCSV = (data, name) => { const blob = new Blob([data], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
  const expPersonas = () => { const h = "ID,Nombre,DNI,Empresa,SCTR,Induccion,EPP"; const rows = Object.values(personas).map(p => { const ok = EPP.every(e => p.epp[e.key]); return [p.id, p.nombre, p.dni || "", (empresas[p.empId] && empresas[p.empId].razonSocial) || "", (p.sctr && p.sctr.vencimiento) || "", indExp(p.induccion) || "", ok ? "Si" : "No"].join(","); }); expCSV([h, ...rows].join("\n"), "bradken_personas.csv"); };
  const expHist = () => { const h = "ID,Nombre,Empresa,Tipo,Ingreso,Salida,Min"; const rows = accesos.map(a => { const i = new Date(a.ingreso); const s = a.salida ? new Date(a.salida) : null; return [a.pid, a.nombre, a.empresa, a.tipoIngreso, i.toLocaleString("es-PE"), s ? s.toLocaleString("es-PE") : "En planta", s ? Math.floor((s - i) / 60000) : ""].join(","); }); expCSV([h, ...rows].join("\n"), "bradken_historial.csv"); };

  if (!user) return <Login onLogin={u => { setUser(u); setScreen((ROLES[u.rol] && ROLES[u.rol].tabs[0]) || "contratistas"); }} />;

  const rol = ROLES[user.rol]; const allowed = (rol && rol.tabs) || [];
  const cur = allowed.includes(screen) ? screen : allowed[0];
  // Nav icons SVG inline
  const NAV_ICONS = {
    contratistas: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
    registro:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    vigilancia:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    safety:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
    suspension:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
    vigencias:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    bitacora:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
    usr:          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    reportes:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  };

  const ALL_TABS = [
    { id: "contratistas", label: "Contratistas" },
    { id: "registro",     label: "Registro" },
    { id: "vigilancia",   label: "Vigilancia" },
    { id: "safety",       label: "Safety" },
    { id: "suspension",   label: "Suspensiones" + (solicitudes.filter(s => s.estado === "pendiente").length > 0 ? " (" + solicitudes.filter(s => s.estado === "pendiente").length + ")" : ""), alerta: solicitudes.filter(s => s.estado === "pendiente").length > 0 },
    { id: "vigencias",    label: "Vigencias" },
    { id: "bitacora",     label: "Bitácora" },
    { id: "usr",          label: "Usuarios" },
    { id: "reportes",     label: "Reportes" },
  ].filter(t => allowed.includes(t.id));

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"var(--bg)", fontFamily:"var(--sans)" }}>
      {qrPerson && <QRModal persona={qrPerson} empresa={empresas[qrPerson.empId]} onClose={() => setQrPerson(null)} />}

      {/* SIDEBAR */}
      <aside style={{ width:200, background:"var(--sf)", borderRight:"1px solid var(--bd2)", display:"flex", flexDirection:"column", flexShrink:0, height:"100vh", position:"sticky", top:0, overflow:"hidden" }}>
        {/* Brand */}
        <div style={{ padding:"16px 14px 12px", borderBottom:"1px solid var(--bd)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <svg width="22" height="22" viewBox="0 0 60 60" fill="none">
              <path d="M30 8L8 26v26h16V38h12v14h16V26L30 8z" fill="#1a52a0" fillOpacity="0.15" stroke="#1a52a0" strokeWidth="2.5" strokeLinejoin="round"/>
              <path d="M8 26L30 8l22 18" stroke="#1a52a0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:500, color:"var(--ac)", letterSpacing:"0.06em", textTransform:"uppercase", lineHeight:1.3 }}>Bradken<br/>Chilca</div>
          </div>
          <div style={{ fontSize:10, color:"var(--tx3)" }}>Control de Acceso</div>
        </div>

        {/* Nav */}
        <nav style={{ padding:"8px 6px", flex:1, overflowY:"auto" }}>
          {ALL_TABS.map(t => (
            <button key={t.id} onClick={() => setScreen(t.id)}
              style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 10px", borderRadius:8, cursor:"pointer", fontSize:13, color: cur===t.id ? "var(--ac)" : "var(--tx2)", background: cur===t.id ? "#dbeafe" : "transparent", border:"1px solid transparent", marginBottom:1, width:"100%", fontFamily:"var(--sans)", textAlign:"left", fontWeight: cur===t.id ? 500 : 400, transition:"all 0.12s" }}
              onMouseEnter={e => { if (cur!==t.id) { e.currentTarget.style.background="var(--ac-bg)"; e.currentTarget.style.color="var(--ac)"; }}}
              onMouseLeave={e => { if (cur!==t.id) { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="var(--tx2)"; }}}>
              <span style={{ opacity: cur===t.id ? 1 : 0.55, flexShrink:0 }}>{NAV_ICONS[t.id]}</span>
              <span style={{ flex:1 }}>{t.label}</span>
              {t.alerta && <span style={{ width:8, height:8, borderRadius:"50%", background:"#E53E3E", flexShrink:0 }} />}
            </button>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding:"10px 14px", borderTop:"1px solid var(--bd)", flexShrink:0 }}>
          <div style={{ fontSize:12, fontWeight:500, color:"var(--tx)" }}>{user.nombre}</div>
          <div style={{ fontSize:10, color:"var(--tx3)", fontFamily:"var(--mono)", marginTop:2, marginBottom:8 }}>{rol && rol.label}</div>
          <button onClick={async () => { await supa.auth.signOut(); setUser(null); }}
            style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--tx3)", background:"transparent", border:"1px solid var(--bd2)", borderRadius:6, padding:"4px 10px", cursor:"pointer", fontFamily:"var(--sans)", width:"100%" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Topbar */}
        <div style={{ padding:"11px 20px", borderBottom:"1px solid var(--bd2)", background:"var(--sf)", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ fontSize:14, fontWeight:500, color:"var(--tx)" }}>{ALL_TABS.find(t=>t.id===cur)?.label || "—"}</div>
          <div style={{ fontSize:11, color:"var(--tx3)", fontFamily:"var(--mono)" }}>Bradken Chilca · {today()}</div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px" }}>
          {cur === "contratistas" && <ModContratistas empresas={empresas} onGuardar={onGuardar} onEstado={onEstado} userRol={user.rol} onSolicitarBloqueoEmp={onSolicitarBloqueoEmp} />}
          {cur === "registro" && <ModRegistro empresas={empresas} onRegistrar={onRegistrar} irAContratistas={() => setScreen("contratistas")} personas={personas} onActualizarSctr={onActualizarSctr} user={user} onRegistrarDespacho={async d => {
            setDespachos(prev => [...prev, d]);
            const emp = empresas[d.empresaId];
            await supa.from("despachos").insert({ id: d.id, empresa_id: d.empresaId, empresa_nombre: (emp && emp.razonSocial) || "—", fecha_registro: d.fechaRegistro, chofer: d.chofer, vehiculo: d.vehiculo, mercancia: d.mercancia, estado: "Pendiente" });
          }} />}
          {cur === "vigilancia" && <ModVigilancia personas={personas} empresas={empresas} accesos={accesos} equipos={equipos} herramientas={herramientas} despachos={despachos} setDespachos={setDespachos} onIngreso={onIngreso} onSalida={onSalida} onEPP={onEPP} onShowQR={setQrPerson} onVistoBuenoSctr={onVistoBuenoSctr} onInspeccion={onInspeccion} onSolicitarBloqueo={onSolicitarBloqueo}
            onAddEq={eq => setEquipos(e => [...e, eq])}
            onSalEq={id => setEquipos(e => e.map(eq => eq.id === id ? { ...eq, salida: new Date().toISOString() } : eq))}
            onAddHer={h => setHerramientas(hs => [...hs, h])}
            onSalHer={id => setHerramientas(hs => hs.map(h => h.id === id ? { ...h, salida: new Date().toISOString() } : h))}
            onIngresoDespacho={async (id, guia, hora) => {
              setDespachos(prev => prev.map(d => d.id === id ? { ...d, guia, ingresoHora: hora, estado: "En planta" } : d));
              await supa.from("despachos").update({ guia, ingreso_hora: hora, estado: "En planta" }).eq("id", id);
            }}
            onSalidaDespacho={async (id, hora) => {
              setDespachos(prev => prev.map(d => d.id === id ? { ...d, salidaHora: hora, estado: "Salió" } : d));
              await supa.from("despachos").update({ salida_hora: hora, estado: "Salió" }).eq("id", id);
            }}
            onRegistrarIncidente={async (inc) => {
              await supa.from("incidentes_ingreso").insert({ id: inc.id, persona_id: inc.personaId, nombre: inc.nombre, dni: inc.dni, tipo_doc: inc.tipoDoc, empresa: inc.empresa, causas_texto: inc.causasTexto, detalle: inc.detalle, bloquear: inc.bloquear, fecha: inc.fecha, hora: inc.hora });
            }}
          />}
          {cur === "safety" && <ModSafety personas={personas} onInd={onInd} onCap={onCap} />}
          {cur === "suspension" && <ModSuspensiones personas={personas} empresas={empresas} solicitudes={solicitudes} onSolicitarBloqueo={onSolicitarBloqueo} onAprobarBloqueo={onAprobarBloqueo} onDesbloquear={onDesbloquear} onAprobarBloqueoEmp={(sol) => { onEstado(sol.empresaId, sol.accion, { motivo: sol.motivo, fecha: sol.fecha, solicitante: sol.solicitante }); setSolicitudes(prev => prev.map(s => s.id === sol.id ? { ...s, estado: "aprobado" } : s)); }} onRechazarEmp={(id) => setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, estado: "rechazado" } : s))} user={user} />}
          {cur === "vigencias" && <ModVigencias personas={personas} empresas={empresas} accesos={accesos} />}
          {cur === "bitacora" && <ModBitacora />}
          {cur === "usr" && <ModUsuarios />}
          {cur === "reportes" && (
            <div>
              <p style={{ fontSize:14, fontWeight:500, color:"var(--tx)", marginBottom:"1rem" }}>Resumen general</p>
              <Alertas personas={personas} empresas={empresas} />
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:"1.5rem" }}>
                {[["Empresas",Object.keys(empresas).length],["Personas",Object.keys(personas).length],["En planta",accesos.filter(a=>!a.salida).length],["Equipos",equipos.filter(e=>!e.salida).length],["Herramientas",herramientas.filter(h=>!h.salida).length]].map(([l,v]) => (
                  <div key={l} style={{ background:"var(--sf)", border:"1px solid var(--bd2)", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ fontSize:26, fontWeight:400, fontFamily:"var(--mono)", color:"var(--tx)" }}>{v}</div>
                    <div style={{ fontSize:11, color:"var(--tx2)", marginTop:4, fontWeight:500 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:"1rem", flexWrap:"wrap" }}>
                <button onClick={expPersonas} style={{ padding:"5px 12px", fontSize:12, fontWeight:500, background:"var(--gn)", color:"#fff", border:"1px solid var(--gn)", borderRadius:8, cursor:"pointer" }}>Exportar personas (CSV)</button>
                <button onClick={expHist}     style={{ padding:"5px 12px", fontSize:12, fontWeight:500, background:"var(--gn)", color:"#fff", border:"1px solid var(--gn)", borderRadius:8, cursor:"pointer" }}>Exportar historial (CSV)</button>
              </div>
              <ModReportes personas={personas} empresas={empresas} accesos={accesos} equipos={equipos} herramientas={herramientas} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
