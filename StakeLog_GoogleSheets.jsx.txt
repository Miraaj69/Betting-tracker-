import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Constants ─────────────────────────────────────────────────────
const DEFAULT_BOOKIES = ["Bet365","Betway","Dream11","MPL","1xBet","Parimatch"];
const DEFAULT_SPORTS  = ["🏏 Cricket","⚽ Football","🎾 Tennis","🏀 Basketball","🐴 Horse Racing","🤼 Kabaddi","🎯 Other"];
const STATUSES = ["Pending","Won","Lost","Void"];
const DEFAULT_TAGS = ["#accumulator","#live","#tipster","#value","#parlay","#single"];

// ── GOOGLE SHEETS CONFIG ──────────────────────────────────────────
// Apna Apps Script Web App URL yahan paste karo
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbyEXmWP9N5b4TjR4eSoiV6pdxEwArlRigMRAAIt4L7ja6USSIU6QyIdXqn3_3WaN2Oa/exec";
const SYNC_ENABLED = SHEETS_URL !== "https://script.google.com/macros/s/AKfycbyEXmWP9N5b4TjR4eSoiV6pdxEwArlRigMRAAIt4L7ja6USSIU6QyIdXqn3_3WaN2Oa/exec";

// ── Themes ────────────────────────────────────────────────────────
const THEMES = {
  light:{
    primary:"#E50914",onPrimary:"#fff",
    primaryContainer:"#FFD9D8",onPrimaryContainer:"#410002",
    secondary:"#7D3C3C",secondaryContainer:"#FFDAD9",
    tertiary:"#8B4513",tertiaryContainer:"#FFD0B0",
    error:"#C0392B",errorContainer:"#FFDAD6",
    surface:"#FFF8F7",onSurface:"#201A1A",onSurfaceVariant:"#534343",
    surfaceContainer:"#FDECEA",surfaceContainerHigh:"#F7E0DE",surfaceContainerHighest:"#F0D5D3",
    outline:"#8B5E5E",outlineVariant:"#D9B9B8",
    cardBg:"#ffffff",cardShadow:"0 1px 4px #0001",
    statusWon:{color:"#2E7D32",container:"#C8F5CB"},
    statusLost:{color:"#C62828",container:"#FFDAD6"},
    statusPending:{color:"#E65100",container:"#FFE0C2"},
    statusVoid:{color:"#5D4037",container:"#EFD9CC"},
    fabShadow:"0 3px 14px #E5091444",
  },
  dark:{
    primary:"#FF453A",onPrimary:"#560003",
    primaryContainer:"#7F0007",onPrimaryContainer:"#FFB4AB",
    secondary:"#FFB3B0",secondaryContainer:"#5C1515",
    tertiary:"#FFBA8C",tertiaryContainer:"#6B2E00",
    error:"#FFB4AB",errorContainer:"#93000A",
    surface:"#141010",onSurface:"#EDE0DF",onSurfaceVariant:"#D7BFBE",
    surfaceContainer:"#201818",surfaceContainerHigh:"#2B2020",surfaceContainerHighest:"#362828",
    outline:"#A08585",outlineVariant:"#4D3535",
    cardBg:"#201818",cardShadow:"0 1px 6px #00000066",
    statusWon:{color:"#69D36E",container:"#0A3D0C"},
    statusLost:{color:"#FFB4AB",container:"#7A0F0F"},
    statusPending:{color:"#FFB86C",container:"#4A2200"},
    statusVoid:{color:"#BCAAA4",container:"#3E2723"},
    fabShadow:"0 3px 18px #FF453A33",
  },
  amoled:{
    primary:"#FF1F1F",onPrimary:"#fff",
    primaryContainer:"#4A0000",onPrimaryContainer:"#FF9999",
    secondary:"#FF9090",secondaryContainer:"#2D0000",
    tertiary:"#FF8C42",tertiaryContainer:"#2E1000",
    error:"#FFB4AB",errorContainer:"#5A0000",
    surface:"#000000",onSurface:"#F0E0DF",onSurfaceVariant:"#BFAAAA",
    surfaceContainer:"#0D0808",surfaceContainerHigh:"#150E0E",surfaceContainerHighest:"#1C1212",
    outline:"#6B4545",outlineVariant:"#2A1A1A",
    cardBg:"#100A0A",cardShadow:"0 1px 10px #00000099",
    statusWon:{color:"#4EE454",container:"#062808"},
    statusLost:{color:"#FF6B6B",container:"#3D0000"},
    statusPending:{color:"#FFA040",container:"#2A1000"},
    statusVoid:{color:"#9E7070",container:"#180D0D"},
    fabShadow:"0 3px 22px #FF1F1F33",
  },
};
const THEME_META={light:{icon:"☀️",label:"Light"},dark:{icon:"🌙",label:"Dark"},amoled:{icon:"⚫",label:"AMOLED"}};

const formatINR=(n)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
const mkForm=(bookies,sports)=>({id:null,date:new Date().toISOString().slice(0,10),bookie:bookies[0]||"",sport:sports[0]||"",event:"",bet:"",odds:"",stake:"",status:"Pending",notes:"",matchTime:"",tags:[],tipster:"",ev:""});

// ── Google Sheets API ─────────────────────────────────────────────
const sheetsAPI = {
  async get(params = {}) {
    if (!SYNC_ENABLED) return null;
    const url = new URL(SHEETS_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    return res.json();
  },
  async post(body) {
    if (!SYNC_ENABLED) return null;
    const res = await fetch(SHEETS_URL, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async addBet(bet) { return this.post({ action: "addBet", bet }); },
  async updateBet(bet) { return this.post({ action: "updateBet", bet }); },
  async deleteBet(id) { return this.post({ action: "deleteBet", id }); },
  async bulkUpdate(bets) { return this.post({ action: "bulkUpdate", bets }); },
  async bulkDelete(ids) { return this.post({ action: "bulkDelete", ids }); },
  async syncAll(bets) { return this.post({ action: "syncAll", bets }); },
  async loadAll() { return this.get({ action: "getBets" }); },
};

// ── Sync Status Indicator ─────────────────────────────────────────
function SyncStatus({ status, t }) {
  const configs = {
    idle:    { icon: "☁️", label: "Synced",   color: t.statusWon.color },
    syncing: { icon: "🔄", label: "Syncing…", color: t.statusPending.color },
    error:   { icon: "⚠️", label: "Sync err", color: t.error },
    offline: { icon: "📴", label: "Offline",  color: t.onSurfaceVariant },
    disabled:{ icon: "📱", label: "Local",    color: t.onSurfaceVariant },
  };
  const c = configs[status] || configs.idle;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: c.color }}>
      <span style={{ animation: status === "syncing" ? "spin 1s linear infinite" : "none", display: "inline-block" }}>{c.icon}</span>
      {c.label}
    </span>
  );
}

// ── Setup Banner ──────────────────────────────────────────────────
function SetupBanner({ t, onDismiss }) {
  return (
    <div style={{ background: t.tertiaryContainer, borderRadius: 20, padding: "14px 16px", margin: "12px 0", border: `1.5px solid ${t.tertiary}` }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: t.tertiary, marginBottom: 6 }}>🔗 Google Sheets Connect karein</div>
      <div style={{ fontSize: 12, color: t.onSurface, lineHeight: 1.6, marginBottom: 10 }}>
        Abhi app sirf local hai. Google Sheets se connect karne ke liye:<br/>
        <b>1.</b> Apps Script deploy karo<br/>
        <b>2.</b> URL ko code mein <code style={{background:t.surfaceContainerHigh,padding:"1px 6px",borderRadius:6}}>SHEETS_URL</code> mein paste karo<br/>
        <b>3.</b> App reload karo
      </div>
      <button onClick={onDismiss} style={{ background: "transparent", border: "none", color: t.tertiary, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Dismiss ×</button>
    </div>
  );
}

// ── Confetti ──────────────────────────────────────────────────────
function Confetti({ active, onDone }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width, y: -20, r: Math.random() * 8 + 4,
      color: ["#E50914","#FF6B6B","#FFD700","#fff","#FF8C42","#69D36E","#FF69B4"][Math.floor(Math.random() * 7)],
      vx: (Math.random() - 0.5) * 7, vy: Math.random() * 5 + 3, rot: Math.random() * 360, rv: (Math.random() - 0.5) * 10, alpha: 1,
    }));
    let frame;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      pieces.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.rv; p.alpha -= 0.011; if (p.alpha > 0) alive = true;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.alpha); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r); ctx.restore();
      });
      if (alive) frame = requestAnimationFrame(draw);
      else { ctx.clearRect(0, 0, canvas.width, canvas.height); onDone(); }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  if (!active) return null;
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }} />;
}

// ── M3 Field ──────────────────────────────────────────────────────
function M3Field({ label, value, onChange, type = "text", placeholder, multiline, options, t, error }) {
  const [focused, setFocused] = useState(false);
  const filled = value !== undefined && value !== "";
  const base = { width: "100%", background: t.surfaceContainerHighest, border: "none", borderBottom: `${focused ? 2 : 1}px solid ${error ? "#E50914" : focused ? t.primary : t.outline}`, borderRadius: "4px 4px 0 0", padding: "20px 16px 6px", fontFamily: "inherit", fontSize: 16, color: t.onSurface, outline: "none", resize: "none", transition: "border-color 0.15s", boxSizing: "border-box" };
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 16, top: focused || filled ? 6 : 14, pointerEvents: "none", fontSize: focused || filled ? 11 : 16, fontWeight: focused || filled ? 600 : 400, color: error ? "#E50914" : focused ? t.primary : t.onSurfaceVariant, transition: "all 0.15s cubic-bezier(0.2,0,0,1)" }}>{label}</span>
      {options ? (<select value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ ...base, appearance: "none", paddingRight: 36 }}>{options.map(o => <option key={o} style={{ background: t.surfaceContainer, color: t.onSurface }}>{o}</option>)}</select>)
        : multiline ? (<textarea value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={focused ? placeholder : ""} rows={3} style={base} />)
          : (<input type={type} value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={focused ? placeholder : ""} style={base} />)}
      {options && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: t.onSurfaceVariant, pointerEvents: "none", fontSize: 12 }}>▾</span>}
      {error && <span style={{ fontSize: 11, color: "#E50914", paddingLeft: 16, display: "block" }}>{error}</span>}
    </div>
  );
}

// ── Status Chip ───────────────────────────────────────────────────
function StatusChip({ status, t, small }) {
  const icons = { Won: "✓", Lost: "✕", Pending: "⏳", Void: "⊘" };
  const s = { Won: t.statusWon, Lost: t.statusLost, Pending: t.statusPending, Void: t.statusVoid }[status];
  return (<span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.container, color: s.color, borderRadius: 20, padding: small ? "2px 10px" : "4px 12px", fontSize: small ? 11 : 12, fontWeight: 700 }}><span style={{ fontSize: 10 }}>{icons[status]}</span> {status}</span>);
}

// ── Manage Modal ──────────────────────────────────────────────────
function ManageModal({ title, items, onSave, onClose, t }) {
  const [list, setList] = useState([...items]);
  const [newItem, setNewItem] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 120); }, []);
  const add = () => { const v = newItem.trim(); if (!v) { setErr("Cannot be empty"); return; } if (list.includes(v)) { setErr("Already exists"); return; } setList([...list, v]); setNewItem(""); setErr(""); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "#00000077", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="anim-sheet" style={{ position: "relative", width: "100%", maxWidth: 600, background: t.cardBg, borderRadius: "28px 28px 0 0", padding: "24px 20px 40px", zIndex: 1 }}>
        <div style={{ width: 36, height: 4, background: t.outlineVariant, borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: t.onSurface, marginBottom: 16 }}>{title}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input ref={inputRef} value={newItem} onChange={e => { setNewItem(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Add new..." style={{ flex: 1, background: t.surfaceContainerHighest, border: `1.5px solid ${err ? t.primary : t.outlineVariant}`, borderRadius: 14, padding: "10px 14px", fontFamily: "inherit", fontSize: 14, color: t.onSurface, outline: "none" }} />
          <button className="qbtn" onClick={add} style={{ background: t.primary, color: t.onPrimary, border: "none", borderRadius: 14, padding: "0 20px", fontFamily: "inherit", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>+</button>
        </div>
        {err && <div style={{ fontSize: 12, color: t.primary, marginBottom: 8, paddingLeft: 4 }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {list.map((item) => (
            <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: t.surfaceContainerHigh, borderRadius: 14, padding: "10px 14px" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: t.onSurface }}>{item}</span>
              <button className="qbtn" onClick={() => setList(list.filter(x => x !== item))} style={{ background: "transparent", border: "none", color: t.error || t.primary, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button className="qbtn" onClick={onClose} style={{ background: "transparent", color: t.primary, border: `1.5px solid ${t.outline}`, borderRadius: 24, padding: "10px 22px", fontFamily: "inherit", fontSize: 14, fontWeight: 600 }}>Cancel</button>
          <button className="qbtn" onClick={() => onSave(list)} style={{ background: t.primary, color: t.onPrimary, border: "none", borderRadius: 24, padding: "10px 26px", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Mini Chart ────────────────────────────────────────────────────
function MiniChart({ data, color, height = 80 }) {
  if (!data || data.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#999" }}>Not enough data</div>;
  const w = 400, h = height;
  const vals = data.map(d => d.y);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const pts = data.map((d, i) => ({ x: (i / (data.length - 1)) * w, y: h - ((d.y - minV) / range) * (h - 10) - 5 }));
  const path = "M" + pts.map(p => `${p.x},${p.y}`).join("L");
  const fill = path + `L${pts[pts.length - 1].x},${h}L0,${h}Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={fill} fill="url(#cg)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length <= 20 && pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />)}
    </svg>
  );
}

// ── Countdown Timer ───────────────────────────────────────────────
function CountdownTimer({ matchDate, matchTime, t }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!matchDate || !matchTime) return null;
  const target = new Date(`${matchDate}T${matchTime}`).getTime();
  const diff = target - now;
  if (diff <= 0) return <span style={{ fontSize: 11, fontWeight: 700, background: t.errorContainer, color: t.error, borderRadius: 12, padding: "3px 8px" }}>⏰ Started</span>;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const label = h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  const soon = diff < 3600000;
  return <span style={{ fontSize: 11, fontWeight: 700, background: soon ? t.statusPending.container : t.primaryContainer, color: soon ? t.statusPending.color : t.primary, borderRadius: 12, padding: "3px 8px" }}>⏳ {label}</span>;
}

// ── Swipe Card ────────────────────────────────────────────────────
function SwipeCard({ bet, t, onDelete, onEdit, onWon, onLost, onDuplicate, calcPnL, getSC, hidden, deleteConfirm, setDeleteConfirm, syncStatus }) {
  const [expanded, setExpanded] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(null);
  const pnl = calcPnL(bet);
  const scc = getSC(bet.status);
  const now = new Date();
  const matchDT = bet.date && bet.matchTime ? new Date(`${bet.date}T${bet.matchTime}`) : null;
  const isOverdue = bet.status === "Pending" && matchDT && matchDT < now;

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; setSwiping(true); };
  const onTouchMove = (e) => { if (startX.current === null) return; const dx = e.touches[0].clientX - startX.current; if (dx < 0) setSwipeX(Math.max(dx, -80)); else setSwipeX(0); };
  const onTouchEnd = () => { if (swipeX < -50) setSwipeX(-80); else setSwipeX(0); setSwiping(false); startX.current = null; };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 20 }}>
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: t.error, borderRadius: "0 20px 20px 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🗑</div>
      <div className="bet-card" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ background: isOverdue ? t.statusPending.container : t.cardBg, borderRadius: 20, overflow: "hidden", boxShadow: isOverdue ? `0 0 0 2px ${t.statusPending.color}44` : t.cardShadow, transform: `translateX(${swipeX}px)`, transition: swiping ? "none" : "transform 0.25s cubic-bezier(0.2,0,0,1)", position: "relative", zIndex: 1 }}>
        <div style={{ height: 4, background: scc.container, borderBottom: `1px solid ${scc.color}33` }} />
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface, lineHeight: 1.3 }}>{bet.event}</div>
              <div style={{ fontSize: 13, color: t.onSurfaceVariant, marginTop: 2 }}>↳ {bet.bet}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <StatusChip status={bet.status} t={t} small />
              <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: t.onSurfaceVariant, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>{expanded ? "▲ less" : "▼ more"}</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "6px 0", alignItems: "center" }}>
            {[bet.bookie, bet.sport, bet.date].map(tag => (
              <span key={tag} style={{ fontSize: 11, fontWeight: 700, background: t.surfaceContainerHigh, color: t.onSurfaceVariant, borderRadius: 12, padding: "3px 10px" }}>{tag}</span>
            ))}
            {bet.matchTime && <CountdownTimer matchDate={bet.date} matchTime={bet.matchTime} t={t} />}
            {isOverdue && <span style={{ fontSize: 11, fontWeight: 700, background: t.statusPending.container, color: t.statusPending.color, borderRadius: 12, padding: "3px 8px" }}>⚠️ Overdue</span>}
            {(bet.tags || []).map(tag => <span key={tag} style={{ fontSize: 11, fontWeight: 700, background: t.primaryContainer, color: t.primary, borderRadius: 12, padding: "3px 8px" }}>{tag}</span>)}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: t.surfaceContainer, borderRadius: 14, padding: "10px 14px" }}>
            <div style={{ display: "flex", gap: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: t.onSurfaceVariant, fontWeight: 700, marginBottom: 2 }}>STAKE</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface }}>{hidden ? "₹ ••••" : formatINR(bet.stake)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: t.onSurfaceVariant, fontWeight: 700, marginBottom: 2 }}>ODDS</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface }}>{bet.odds}x</div>
              </div>
              {bet.ev && (
                <div>
                  <div style={{ fontSize: 10, color: t.onSurfaceVariant, fontWeight: 700, marginBottom: 2 }}>EV</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: parseFloat(bet.ev) >= 0 ? t.statusWon.color : t.statusLost.color }}>{parseFloat(bet.ev) >= 0 ? "+" : ""}{bet.ev}%</div>
                </div>
              )}
            </div>
            {(bet.status === "Won" || bet.status === "Lost") && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: t.onSurfaceVariant, fontWeight: 700, marginBottom: 2 }}>P&L</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: pnl >= 0 ? t.statusWon.color : t.error }}>{hidden ? "••••" : ((pnl >= 0 ? "+" : "") + formatINR(pnl))}</div>
              </div>
            )}
          </div>

          {expanded && (
            <div className="anim-slide" style={{ marginTop: 10, padding: "10px 0", borderTop: `1px solid ${t.outlineVariant}` }}>
              {bet.tipster && <div style={{ fontSize: 13, color: t.tertiary, fontWeight: 600, marginBottom: 6 }}>👤 Tip: {bet.tipster}</div>}
              {bet.notes && <div style={{ fontSize: 13, color: t.onSurfaceVariant, marginBottom: 8, lineHeight: 1.5 }}>📝 {bet.notes}</div>}
              <div style={{ fontSize: 13, color: t.onSurfaceVariant }}>
                Potential win: <b style={{ color: t.statusWon.color }}>{hidden ? "••••" : formatINR(parseFloat(bet.stake || 0) * (parseFloat(bet.odds || 1) - 1))}</b>
              </div>
              {SYNC_ENABLED && (
                <div style={{ marginTop: 8 }}>
                  <SyncStatus status={syncStatus} t={t} />
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            {bet.status === "Pending" && (
              <>
                <button className="qbtn" onClick={() => onWon(bet.id)} style={{ flex: 1, background: t.statusWon.container, color: t.statusWon.color, border: "none", borderRadius: 20, padding: "8px 0", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>✓ Won</button>
                <button className="qbtn" onClick={() => onLost(bet.id)} style={{ flex: 1, background: t.statusLost.container, color: t.statusLost.color, border: "none", borderRadius: 20, padding: "8px 0", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>✕ Lost</button>
              </>
            )}
            <button className="qbtn" onClick={() => onEdit(bet)} style={{ background: t.surfaceContainerHigh, color: t.onSurfaceVariant, border: "none", borderRadius: 20, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>Edit</button>
            <button className="qbtn" onClick={() => onDuplicate(bet)} style={{ background: t.surfaceContainerHigh, color: t.onSurfaceVariant, border: "none", borderRadius: 20, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }} title="Duplicate">⊕</button>
            {deleteConfirm === bet.id ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="qbtn" onClick={() => onDelete(bet.id)} style={{ background: t.error, color: "#fff", border: "none", borderRadius: 20, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>Delete</button>
                <button className="qbtn" onClick={() => setDeleteConfirm(null)} style={{ background: t.surfaceContainerHigh, color: t.onSurfaceVariant, border: "none", borderRadius: 20, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>No</button>
              </div>
            ) : (
              <button className="qbtn" onClick={() => setDeleteConfirm(bet.id)} style={{ background: "transparent", color: t.error, border: `1.5px solid ${t.outlineVariant}`, borderRadius: 20, padding: "7px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>🗑</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function BetTracker() {
  const ls = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const ss = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

  const [themeKey, setThemeKey] = useState(() => localStorage.getItem("sl_theme") || "light");
  const [bets, setBets] = useState(() => ls("bets_gs_v1", []));
  const [bookies, setBookies] = useState(() => ls("sl_bookies", DEFAULT_BOOKIES));
  const [sports, setSports] = useState(() => ls("sl_sports", DEFAULT_SPORTS));
  const [bankrollStart, setBankrollStart] = useState(() => ls("sl_bankroll", 0));
  const [allTags, setAllTags] = useState(() => ls("sl_tags", DEFAULT_TAGS));
  const [hidden, setHidden] = useState(false);
  const [form, setForm] = useState(() => mkForm(ls("sl_bookies", DEFAULT_BOOKIES), ls("sl_sports", DEFAULT_SPORTS)));
  const [formErrors, setFormErrors] = useState({});
  const [trueProbInput, setTrueProbInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterBookie, setFilterBookie] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [dateRange, setDateRange] = useState("all");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [tab, setTab] = useState("bets");
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [manageModal, setManageModal] = useState(null);
  const [confetti, setConfetti] = useState(false);
  const [shakeForm, setShakeForm] = useState(false);
  const [winFlash, setWinFlash] = useState(null);
  const [syncStatus, setSyncStatus] = useState(SYNC_ENABLED ? "idle" : "disabled");
  const [loading, setLoading] = useState(SYNC_ENABLED);
  const [showSetupBanner, setShowSetupBanner] = useState(!SYNC_ENABLED);
  const [lastSync, setLastSync] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [undoToast, setUndoToast] = useState(null);
  const formRef = useRef(null);
  const t = THEMES[themeKey];

  // ── Load from Google Sheets on mount ──────────────────────────
  useEffect(() => {
    if (!SYNC_ENABLED) return;
    loadFromSheets();
  }, []);

  const loadFromSheets = async () => {
    setLoading(true);
    setSyncStatus("syncing");
    try {
      const data = await sheetsAPI.loadAll();
      if (data?.success) {
        if (data.bets?.length > 0) {
          setBets(data.bets);
          ss("bets_gs_v1", data.bets);
        }
        if (data.settings?.bookies) setBookies(data.settings.bookies);
        if (data.settings?.sports) setSports(data.settings.sports);
        if (data.settings?.bankrollStart !== undefined) setBankrollStart(data.settings.bankrollStart);
        setLastSync(new Date());
        setSyncStatus("idle");
      } else {
        setSyncStatus("error");
      }
    } catch {
      setSyncStatus("error");
      // Fall back to local data — already loaded from localStorage
    }
    setLoading(false);
  };

  // ── Sync settings to sheet ──────────────────────────────────
  const syncSettings = useCallback(async () => {
    if (!SYNC_ENABLED) return;
    try {
      await sheetsAPI.post({
        action: "saveSettings",
        settings: { bookies, sports, bankrollStart }
      });
    } catch { }
  }, [bookies, sports, bankrollStart]);

  useEffect(() => { ss("bets_gs_v1", bets); }, [bets]);
  useEffect(() => { localStorage.setItem("sl_theme", themeKey); }, [themeKey]);
  useEffect(() => { ss("sl_bookies", bookies); syncSettings(); }, [bookies]);
  useEffect(() => { ss("sl_sports", sports); syncSettings(); }, [sports]);
  useEffect(() => { ss("sl_bankroll", bankrollStart); syncSettings(); }, [bankrollStart]);

  // ── Calculations ──────────────────────────────────────────────
  const calcPnL = (b) => b.status === "Won" ? parseFloat(b.stake) * (parseFloat(b.odds) - 1) : b.status === "Lost" ? -parseFloat(b.stake) : 0;
  const getSC = (st) => ({ Won: t.statusWon, Lost: t.statusLost, Pending: t.statusPending, Void: t.statusVoid }[st]);

  const totalPnL = bets.reduce((s, b) => s + calcPnL(b), 0);
  const totalStake = bets.filter(b => b.status !== "Void").reduce((s, b) => s + parseFloat(b.stake || 0), 0);
  const wonCount = bets.filter(b => b.status === "Won").length;
  const lostCount = bets.filter(b => b.status === "Lost").length;
  const winRate = (wonCount + lostCount) > 0 ? ((wonCount / (wonCount + lostCount)) * 100).toFixed(0) : null;
  const currentBalance = parseFloat(bankrollStart || 0) + totalPnL;

  const streak = useMemo(() => {
    const settled = bets.filter(b => b.status === "Won" || b.status === "Lost").sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!settled.length) return { current: 0, type: null, best: 0 };
    let cur = 1, type = settled[0].status, best = 1, tmp = 1;
    for (let i = 1; i < settled.length; i++) { if (settled[i].status === settled[i - 1].status) tmp++; else tmp = 1; if (tmp > best) best = tmp; }
    for (let i = 1; i < settled.length; i++) { if (settled[i].status === type) cur++; else break; }
    return { current: cur, type, best };
  }, [bets]);

  const bankrollData = useMemo(() => {
    const sorted = [...bets].filter(b => b.status !== "Pending" && b.status !== "Void").sort((a, b) => new Date(a.date) - new Date(b.date));
    let bal = parseFloat(bankrollStart || 0);
    const pts = [{ x: 0, y: bal }];
    sorted.forEach((b, i) => { bal += calcPnL(b); pts.push({ x: i + 1, y: bal }); });
    return pts;
  }, [bets, bankrollStart]);

  const pnlData = useMemo(() => {
    const sorted = [...bets].filter(b => b.status !== "Pending" && b.status !== "Void").sort((a, b) => new Date(a.date) - new Date(b.date));
    let cum = 0;
    return sorted.map((b, i) => { cum += calcPnL(b); return { x: i, y: cum }; });
  }, [bets]);

  const sportStats = useMemo(() => sports.map(sp => ({
    name: sp,
    bets: bets.filter(b => b.sport === sp),
    won: bets.filter(b => b.sport === sp && b.status === "Won").length,
    lost: bets.filter(b => b.sport === sp && b.status === "Lost").length,
    pnl: bets.filter(b => b.sport === sp).reduce((s, b) => s + calcPnL(b), 0),
  })).filter(s => s.bets.length > 0), [bets, sports]);

  const bookieStats = useMemo(() => [...bookies, "Other"].map(bk => ({
    name: bk, bets: bets.filter(b => b.bookie === bk),
    pnl: bets.filter(b => b.bookie === bk).reduce((s, b) => s + calcPnL(b), 0),
    won: bets.filter(b => b.bookie === bk && b.status === "Won").length,
  })).filter(b => b.bets.length > 0), [bets, bookies]);

  const filtered = useMemo(() => {
    const now = new Date();
    return bets.filter(b => {
      if (filterStatus !== "All" && b.status !== filterStatus) return false;
      if (filterBookie !== "All" && b.bookie !== filterBookie) return false;
      if (search && !b.event.toLowerCase().includes(search.toLowerCase()) && !b.bet.toLowerCase().includes(search.toLowerCase())) return false;
      if (dateRange === "week") { const d = new Date(b.date); const diff = (now - d) / (1000 * 60 * 60 * 24); if (diff > 7) return false; }
      if (dateRange === "month") { const d = new Date(b.date); if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false; }
      return true;
    }).sort((a, b) => {
      if (sortBy === "date_desc") return new Date(b.date) - new Date(a.date);
      if (sortBy === "date_asc") return new Date(a.date) - new Date(b.date);
      if (sortBy === "stake_desc") return parseFloat(b.stake) - parseFloat(a.stake);
      if (sortBy === "pnl_desc") return calcPnL(b) - calcPnL(a);
      if (sortBy === "odds_desc") return parseFloat(b.odds) - parseFloat(a.odds);
      return 0;
    });
  }, [bets, filterStatus, filterBookie, search, dateRange, sortBy]);

  // ── CRUD with Sheets sync ─────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.event.trim()) e.event = "Required";
    if (!form.bet.trim()) e.bet = "Required";
    if (!form.odds || isNaN(form.odds) || parseFloat(form.odds) <= 1) e.odds = "Enter valid odds (>1)";
    if (!form.stake || isNaN(form.stake) || parseFloat(form.stake) <= 0) e.stake = "Enter valid amount";
    return e;
  };

  const calcEV = (odds, prob) => {
    const p = parseFloat(prob) / 100;
    const o = parseFloat(odds);
    if (!p || !o || o <= 1) return "";
    return ((p * (o - 1) - (1 - p)) * 100).toFixed(1);
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setFormErrors(e); setShakeForm(true); setTimeout(() => setShakeForm(false), 500); return; }
    setFormErrors({});
    const newBet = { ...form, ev: trueProbInput ? calcEV(form.odds, trueProbInput) : "", createdAt: new Date().toISOString() };

    if (editing) {
      setBets(bets.map(b => b.id === form.id ? newBet : b));
      if (SYNC_ENABLED) { setSyncStatus("syncing"); sheetsAPI.updateBet(newBet).then(() => { setSyncStatus("idle"); setLastSync(new Date()); }).catch(() => setSyncStatus("error")); }
    } else {
      const betWithId = { ...newBet, id: Date.now() };
      setBets([betWithId, ...bets]);
      if (SYNC_ENABLED) { setSyncStatus("syncing"); sheetsAPI.addBet(betWithId).then(() => { setSyncStatus("idle"); setLastSync(new Date()); }).catch(() => setSyncStatus("error")); }
    }
    setForm(mkForm(bookies, sports)); setEditing(false); setShowForm(false); setTrueProbInput("");
  };

  const handleEdit = (bet) => { setForm(bet); setEditing(true); setShowForm(true); setTab("bets"); setFormErrors({}); setTrueProbInput(""); setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const pushUndo = (bet) => {
    setUndoStack(s => [bet, ...s.slice(0, 9)]);
    setUndoToast("Bet deleted");
    setTimeout(() => setUndoToast(null), 4000);
  };

  const handleUndo = () => {
    const last = undoStack[0]; if (!last) return;
    setUndoStack(s => s.slice(1)); setUndoToast(null);
    setBets(prev => [last, ...prev]);
    if (SYNC_ENABLED) sheetsAPI.addBet(last).catch(() => { });
  };

  const markWon = async (id) => {
    setBets(bets.map(b => b.id === id ? { ...b, status: "Won" } : b));
    setWinFlash(id); setTimeout(() => setConfetti(true), 100); setTimeout(() => setWinFlash(null), 800);
    if (SYNC_ENABLED) {
      const bet = bets.find(b => b.id === id);
      if (bet) { setSyncStatus("syncing"); sheetsAPI.updateBet({ ...bet, status: "Won" }).then(() => { setSyncStatus("idle"); setLastSync(new Date()); }).catch(() => setSyncStatus("error")); }
    }
  };

  const markLost = async (id) => {
    setBets(bets.map(b => b.id === id ? { ...b, status: "Lost" } : b));
    if (SYNC_ENABLED) {
      const bet = bets.find(b => b.id === id);
      if (bet) { setSyncStatus("syncing"); sheetsAPI.updateBet({ ...bet, status: "Lost" }).then(() => { setSyncStatus("idle"); setLastSync(new Date()); }).catch(() => setSyncStatus("error")); }
    }
  };

  const deleteBet = async (id) => {
    const bet = bets.find(b => b.id === id);
    setBets(bets.filter(b => b.id !== id));
    setDeleteConfirm(null);
    if (bet) pushUndo(bet);
    if (SYNC_ENABLED) { setSyncStatus("syncing"); sheetsAPI.deleteBet(id).then(() => { setSyncStatus("idle"); setLastSync(new Date()); }).catch(() => setSyncStatus("error")); }
  };

  const duplicateBet = (bet) => {
    const newBet = { ...bet, id: Date.now(), status: "Pending", date: new Date().toISOString().slice(0, 10), matchTime: "" };
    setBets([newBet, ...bets]);
    if (SYNC_ENABLED) { setSyncStatus("syncing"); sheetsAPI.addBet(newBet).then(() => { setSyncStatus("idle"); setLastSync(new Date()); }).catch(() => setSyncStatus("error")); }
  };

  const sf = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const exportCSV = () => {
    const rows = [["Date", "Event", "Bet", "Bookie", "Sport", "Odds", "Stake", "Status", "P&L", "EV", "Tags", "Tipster", "Notes"],
    ...bets.map(b => [b.date, b.event, b.bet, b.bookie, b.sport, b.odds, b.stake, b.status, calcPnL(b).toFixed(2), b.ev || "", (b.tags || []).join(";"), b.tipster || "", b.notes])];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = "stake_log.csv"; a.click();
  };

  const NAV = [{ id: "bets", icon: "📋", label: "Bets" }, { id: "stats", icon: "📊", label: "Stats" }, { id: "bankroll", icon: "💰", label: "Bankroll" }, { id: "manage", icon: "⚙️", label: "Manage" }];
  const evVal = trueProbInput && form.odds ? calcEV(form.odds, trueProbInput) : null;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: THEMES[themeKey].surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Google Sans','Nunito',sans-serif", gap: 16 }}>
      <div style={{ fontSize: 48 }}>🎯</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: THEMES[themeKey].onSurface }}>Loading from Google Sheets…</div>
      <div style={{ fontSize: 14, color: THEMES[themeKey].onSurfaceVariant }}>Syncing your data</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: t.surface, color: t.onSurface, fontFamily: "'Google Sans','Nunito',sans-serif", paddingBottom: 80, transition: "background 0.3s,color 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}input,select,textarea{font-family:inherit;}
        ::-webkit-scrollbar{width:0;height:0;}
        .bet-card{transition:box-shadow 0.2s,transform 0.15s;}.bet-card:hover{box-shadow:0 8px 28px #00000022;transform:translateY(-1px);}
        .fab{transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);}.fab:hover{transform:scale(1.08);}.fab:active{transform:scale(0.94);}
        .chip{cursor:pointer;user-select:none;transition:all 0.15s;border:none;}.chip:active{transform:scale(0.92);}
        .qbtn{cursor:pointer;transition:all 0.15s;}.qbtn:hover{filter:brightness(0.88);}.qbtn:active{transform:scale(0.94);}
        .tbtn{cursor:pointer;transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);border:none;}.tbtn:hover{transform:scale(1.1);}.tbtn:active{transform:scale(0.9);}
        .nav-item{cursor:pointer;transition:all 0.2s;border:none;background:none;font-family:inherit;}
        @keyframes slideUp{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes popIn{from{opacity:0;transform:scale(0.85) translateY(-10px);}to{opacity:1;transform:scale(1) translateY(0);}}
        @keyframes sheetUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
        @keyframes shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-8px);}40%{transform:translateX(8px);}60%{transform:translateX(-5px);}80%{transform:translateX(5px);}}
        @keyframes winPulse{0%{transform:scale(1);}30%{transform:scale(1.03);}60%{transform:scale(0.98);}100%{transform:scale(1);}}
        @keyframes cardIn{from{opacity:0;transform:translateY(16px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes tabSlide{from{opacity:0;transform:translateX(10px);}to{opacity:1;transform:translateX(0);}}
        @keyframes toastIn{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        .anim-slide{animation:slideUp 0.32s cubic-bezier(0.2,0,0,1) both;}
        .anim-pop{animation:popIn 0.22s cubic-bezier(0.2,0,0,1) both;}
        .anim-sheet{animation:sheetUp 0.36s cubic-bezier(0.2,0,0,1) both;}
        .anim-shake{animation:shake 0.45s cubic-bezier(0.2,0,0,1);}
        .anim-win{animation:winPulse 0.6s cubic-bezier(0.2,0,0,1);}
        .anim-card{animation:cardIn 0.3s cubic-bezier(0.2,0,0,1) both;}
        .anim-tab{animation:tabSlide 0.22s cubic-bezier(0.2,0,0,1) both;}
        .anim-toast{animation:toastIn 0.3s cubic-bezier(0.2,0,0,1) both;}
      `}</style>

      <Confetti active={confetti} onDone={() => setConfetti(false)} />

      {/* Undo Toast */}
      {undoToast && (
        <div className="anim-toast" style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", zIndex: 9000, background: t.onSurface, color: t.surface, borderRadius: 24, padding: "10px 20px", display: "flex", gap: 14, alignItems: "center", boxShadow: "0 4px 24px #00000044" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{undoToast}</span>
          <button className="qbtn" onClick={handleUndo} style={{ background: t.primary, color: t.onPrimary, border: "none", borderRadius: 16, padding: "5px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Undo</button>
        </div>
      )}

      {/* Top Bar */}
      <div style={{ background: t.surface, borderBottom: `1px solid ${t.outlineVariant}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, color: t.onSurfaceVariant, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Your</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: t.onSurface, letterSpacing: "-0.5px", lineHeight: 1.1 }}>Stake Log 🎯</div>
              {SYNC_ENABLED && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                  <SyncStatus status={syncStatus} t={t} />
                  {lastSync && <span style={{ fontSize: 10, color: t.onSurfaceVariant }}>· {lastSync.toLocaleTimeString()}</span>}
                  <button className="qbtn" onClick={loadFromSheets} style={{ background: "transparent", border: "none", color: t.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "0 4px" }}>↻ Refresh</button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="tbtn" onClick={() => setHidden(h => !h)} style={{ background: t.surfaceContainerHigh, color: t.onSurfaceVariant, borderRadius: 20, padding: "7px 12px", fontSize: 15, fontFamily: "inherit" }}>{hidden ? "👁️" : "🙈"}</button>
              <div style={{ position: "relative" }}>
                <button className="tbtn" onClick={() => setShowThemePicker(p => !p)} style={{ background: t.primaryContainer, color: t.onPrimaryContainer, borderRadius: 20, padding: "7px 12px", fontSize: 15, fontFamily: "inherit" }}>{THEME_META[themeKey].icon}</button>
                {showThemePicker && (
                  <div className="anim-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: t.surfaceContainerHigh, borderRadius: 20, boxShadow: "0 8px 32px #00000055", border: `1px solid ${t.outlineVariant}`, overflow: "hidden", zIndex: 400, minWidth: 160 }}>
                    {Object.entries(THEME_META).map(([key, meta]) => (
                      <button key={key} className="qbtn" onClick={() => { setThemeKey(key); setShowThemePicker(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: themeKey === key ? t.primaryContainer : "transparent", color: themeKey === key ? t.primary : t.onSurface, border: "none", padding: "13px 18px", fontFamily: "inherit", fontSize: 14, fontWeight: themeKey === key ? 800 : 500, textAlign: "left" }}>
                        <span style={{ fontSize: 18 }}>{meta.icon}</span>{meta.label}{themeKey === key && <span style={{ marginLeft: "auto", color: t.primary }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showThemePicker && <div onClick={() => setShowThemePicker(false)} style={{ position: "fixed", inset: 0, zIndex: 300 }} />}
      {manageModal === "bookies" && <ManageModal title="Manage Bookies" items={bookies} onSave={(l) => { setBookies(l); if (!l.includes(form.bookie)) setForm(f => ({ ...f, bookie: l[0] || "" })); setManageModal(null); }} onClose={() => setManageModal(null)} t={t} />}
      {manageModal === "sports" && <ManageModal title="Manage Sports" items={sports} onSave={(l) => { setSports(l); if (!l.includes(form.sport)) setForm(f => ({ ...f, sport: l[0] || "" })); setManageModal(null); }} onClose={() => setManageModal(null)} t={t} />}
      {manageModal === "tags" && <ManageModal title="Manage Tags" items={allTags} onSave={(l) => { setAllTags(l); setManageModal(null); }} onClose={() => setManageModal(null)} t={t} />}

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px" }}>

        {/* ══ BETS TAB ══ */}
        {tab === "bets" && (
          <div className="anim-tab">
            {showSetupBanner && <SetupBanner t={t} onDismiss={() => setShowSetupBanner(false)} />}

            {showForm && (
              <div ref={formRef} className={`anim-slide${shakeForm ? " anim-shake" : ""}`} style={{ margin: "16px 0 0" }}>
                <div style={{ background: t.cardBg, borderRadius: 28, padding: 20, boxShadow: t.cardShadow }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: t.onSurface, marginBottom: 18 }}>{editing ? "✏️ Edit Bet" : "➕ New Bet"}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <M3Field t={t} label="Event / Match" value={form.event} onChange={sf("event")} placeholder="e.g. India vs Australia" error={formErrors.event} />
                    <M3Field t={t} label="Your Bet" value={form.bet} onChange={sf("bet")} placeholder="e.g. India to win" error={formErrors.bet} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <M3Field t={t} label="Odds" value={form.odds} onChange={sf("odds")} type="number" placeholder="1.85" error={formErrors.odds} />
                      <M3Field t={t} label="Stake (₹)" value={form.stake} onChange={sf("stake")} type="number" placeholder="500" error={formErrors.stake} />
                    </div>

                    {/* EV Calculator */}
                    <div style={{ background: t.surfaceContainerHighest, borderRadius: 14, padding: "12px 14px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.onSurfaceVariant, marginBottom: 8 }}>📐 EV Calculator</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input type="number" value={trueProbInput} onChange={e => setTrueProbInput(e.target.value)} placeholder="True probability % (e.g. 55)"
                          style={{ flex: 1, background: t.cardBg, border: `1.5px solid ${t.outlineVariant}`, borderRadius: 10, padding: "8px 12px", fontFamily: "inherit", fontSize: 13, color: t.onSurface, outline: "none" }} />
                        {evVal !== null && <div style={{ fontSize: 14, fontWeight: 900, color: parseFloat(evVal) >= 0 ? t.statusWon.color : t.statusLost.color, minWidth: 70 }}>EV: {parseFloat(evVal) >= 0 ? "+" : ""}{evVal}%</div>}
                      </div>
                      {evVal !== null && <div style={{ fontSize: 11, color: t.onSurfaceVariant, marginTop: 4 }}>{parseFloat(evVal) >= 0 ? "✅ Value bet" : "❌ Not a value bet"}</div>}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <M3Field t={t} label="Bookie" value={form.bookie} onChange={sf("bookie")} options={[...bookies, "Other"]} />
                      <M3Field t={t} label="Sport" value={form.sport} onChange={sf("sport")} options={sports} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <M3Field t={t} label="Date" value={form.date} onChange={sf("date")} type="date" />
                      <M3Field t={t} label="Match Time (opt)" value={form.matchTime || ""} onChange={sf("matchTime")} type="time" />
                    </div>
                    <M3Field t={t} label="Status" value={form.status} onChange={sf("status")} options={STATUSES} />
                    <M3Field t={t} label="Tipster (optional)" value={form.tipster || ""} onChange={sf("tipster")} placeholder="Who gave this tip?" />
                    <M3Field t={t} label="Notes (optional)" value={form.notes} onChange={sf("notes")} multiline placeholder="Analysis, reasoning..." />

                    {/* Tags */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.onSurfaceVariant, marginBottom: 8 }}>🏷️ Tags</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {allTags.map(tag => {
                          const active = (form.tags || []).includes(tag);
                          return <button key={tag} className="chip" onClick={() => setForm(f => ({ ...f, tags: active ? (f.tags || []).filter(x => x !== tag) : [...(f.tags || []), tag] }))}
                            style={{ background: active ? t.primaryContainer : t.surfaceContainerHigh, color: active ? t.primary : t.onSurfaceVariant, border: `1.5px solid ${active ? t.primary : t.outlineVariant}`, borderRadius: 16, padding: "5px 12px", fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 500 }}>{tag}</button>;
                        })}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
                    <button className="qbtn" onClick={() => { setForm(mkForm(bookies, sports)); setEditing(false); setShowForm(false); setFormErrors({}); setTrueProbInput(""); }} style={{ background: "transparent", color: t.primary, border: `1.5px solid ${t.outline}`, borderRadius: 24, padding: "10px 22px", fontFamily: "inherit", fontSize: 14, fontWeight: 600 }}>Cancel</button>
                    <button className="qbtn" onClick={handleSubmit} style={{ background: t.primary, color: t.onPrimary, border: "none", borderRadius: 24, padding: "10px 26px", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>{editing ? "Update" : "Save Bet"}</button>
                  </div>
                </div>
              </div>
            )}

            {/* Summary pills */}
            {bets.length > 0 && (
              <div style={{ display: "flex", gap: 8, padding: "14px 0 2px", overflowX: "auto" }}>
                {[
                  { label: `${totalPnL >= 0 ? "+" : ""}${hidden ? "₹ ••••" : formatINR(totalPnL)}`, bg: totalPnL >= 0 ? t.primaryContainer : t.errorContainer, color: totalPnL >= 0 ? t.primary : t.error },
                  { label: `Win ${winRate ?? "–"}%`, bg: t.surfaceContainerHighest, color: t.onSurfaceVariant },
                  { label: `${wonCount}W ${lostCount}L`, bg: t.surfaceContainerHighest, color: t.onSurfaceVariant },
                  streak.type ? { label: `🔥 ${streak.current} ${streak.type}`, bg: streak.type === "Won" ? t.statusWon.container : t.statusLost.container, color: streak.type === "Won" ? t.statusWon.color : t.statusLost.color } : null,
                ].filter(Boolean).map(c => <span key={c.label} style={{ flexShrink: 0, background: c.bg, color: c.color, borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 800 }}>{c.label}</span>)}
              </div>
            )}

            {/* Search */}
            <div style={{ position: "relative", margin: "12px 0 8px" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events or bets..."
                style={{ width: "100%", background: t.surfaceContainerHigh, border: `1.5px solid ${search ? t.primary : t.outlineVariant}`, borderRadius: 20, padding: "10px 14px 10px 40px", fontFamily: "inherit", fontSize: 14, color: t.onSurface, outline: "none" }} />
              {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.onSurfaceVariant, fontSize: 18, cursor: "pointer" }}>×</button>}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 6, padding: "4px 0 6px", overflowX: "auto" }}>
              {["All", ...STATUSES].map(s => {
                const active = filterStatus === s; const scc = s !== "All" ? getSC(s) : null;
                return <button key={s} className="chip" onClick={() => setFilterStatus(s)} style={{ flexShrink: 0, background: active ? (scc ? scc.container : t.primaryContainer) : t.surfaceContainerHigh, color: active ? (scc ? scc.color : t.primary) : t.onSurfaceVariant, border: `1.5px solid ${active ? (scc ? scc.color : t.primary) : t.outlineVariant}`, borderRadius: 20, padding: "5px 12px", fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 500 }}>{s}</button>;
              })}
              <select value={filterBookie} onChange={e => setFilterBookie(e.target.value)} style={{ flexShrink: 0, background: t.surfaceContainerHigh, border: `1.5px solid ${t.outlineVariant}`, color: t.onSurfaceVariant, borderRadius: 20, padding: "5px 12px", fontFamily: "inherit", fontSize: 12, outline: "none" }}>
                <option>All</option>{[...bookies, "Other"].map(b => <option key={b}>{b}</option>)}
              </select>
              <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ flexShrink: 0, background: t.surfaceContainerHigh, border: `1.5px solid ${t.outlineVariant}`, color: t.onSurfaceVariant, borderRadius: 20, padding: "5px 12px", fontFamily: "inherit", fontSize: 12, outline: "none" }}>
                <option value="all">All time</option><option value="week">This week</option><option value="month">This month</option>
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ flexShrink: 0, background: t.surfaceContainerHigh, border: `1.5px solid ${t.outlineVariant}`, color: t.onSurfaceVariant, borderRadius: 20, padding: "5px 12px", fontFamily: "inherit", fontSize: 12, outline: "none" }}>
                <option value="date_desc">Newest</option><option value="date_asc">Oldest</option>
                <option value="stake_desc">Highest Stake</option><option value="pnl_desc">Highest P&L</option>
                <option value="odds_desc">Highest Odds</option>
              </select>
            </div>

            {/* Cards */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px", color: t.onSurfaceVariant }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: t.onSurface }}>{bets.length === 0 ? "No bets yet" : "No matches"}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>{bets.length === 0 ? "Tap + to add your first bet" : "Try adjusting filters"}</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 16 }}>
                {filtered.map((bet, i) => (
                  <div key={bet.id} className={`anim-card${winFlash === bet.id ? " anim-win" : ""}`} style={{ animationDelay: `${i * 0.04}s` }}>
                    <SwipeCard bet={bet} t={t} onDelete={deleteBet} onEdit={handleEdit} onWon={markWon} onLost={markLost} onDuplicate={duplicateBet} calcPnL={calcPnL} getSC={getSC} hidden={hidden} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} syncStatus={syncStatus} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ STATS TAB ══ */}
        {tab === "stats" && (
          <div className="anim-tab" style={{ paddingTop: 16 }}>
            {bets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 24px", color: t.onSurfaceVariant }}><div style={{ fontSize: 48, marginBottom: 12 }}>📊</div><div style={{ fontSize: 17, fontWeight: 700, color: t.onSurface }}>No data yet</div></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Net P&L", value: hidden ? "₹ ••••" : formatINR(totalPnL), color: totalPnL >= 0 ? t.primary : t.error, bg: totalPnL >= 0 ? t.primaryContainer : t.errorContainer, icon: totalPnL >= 0 ? "📈" : "📉" },
                    { label: "Total Staked", value: hidden ? "₹ ••••" : formatINR(totalStake), color: t.tertiary, bg: t.tertiaryContainer, icon: "💰" },
                    { label: "Win Rate", value: winRate ? `${winRate}%` : "—", color: t.onSurfaceVariant, bg: t.surfaceContainerHighest, icon: "🎯" },
                    { label: "Best Streak", value: `${streak.best} ${streak.type || ""}`, color: t.secondary, bg: t.secondaryContainer, icon: "🔥" },
                  ].map((s, i) => (
                    <div key={s.label} className="anim-card" style={{ animationDelay: `${i * 0.06}s`, background: s.bg, borderRadius: 24, padding: "16px" }}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: s.color, fontWeight: 700, opacity: 0.75, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="anim-card" style={{ background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface, marginBottom: 12 }}>📈 Cumulative P&L</div>
                  {pnlData.length >= 2 ? <MiniChart data={pnlData} color={totalPnL >= 0 ? t.statusWon.color : t.error} height={90} /> : <div style={{ fontSize: 13, color: t.onSurfaceVariant, textAlign: "center", padding: "20px 0" }}>Settle more bets to see chart</div>}
                </div>

                <div className="anim-card" style={{ background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface, marginBottom: 14 }}>Outcome Breakdown</div>
                  {STATUSES.map(st => {
                    const count = bets.filter(b => b.status === st).length;
                    const pct = bets.length > 0 ? (count / bets.length) * 100 : 0;
                    const scc = getSC(st); const icons = { Won: "✓", Lost: "✕", Pending: "⏳", Void: "⊘" };
                    return <div key={st} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 600, color: t.onSurfaceVariant }}>{icons[st]} {st}</span><span style={{ fontSize: 13, fontWeight: 800, color: scc.color }}>{count}</span></div>
                      <div style={{ height: 7, background: t.surfaceContainerHigh, borderRadius: 8, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: scc.container, borderRadius: 8, transition: "width 0.7s" }} /></div>
                    </div>;
                  })}
                </div>

                {sportStats.length > 0 && (
                  <div className="anim-card" style={{ background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface, marginBottom: 14 }}>🏅 By Sport</div>
                    {sportStats.map((s, i) => (
                      <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < sportStats.length - 1 ? `1px solid ${t.outlineVariant}` : "none" }}>
                        <div><div style={{ fontSize: 14, fontWeight: 800, color: t.onSurface }}>{s.name}</div><div style={{ fontSize: 12, color: t.onSurfaceVariant }}>{s.won}W / {s.lost}L · {s.bets.length} bets</div></div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: s.pnl >= 0 ? t.primary : t.error }}>{s.pnl >= 0 ? "+" : ""}{hidden ? "••" : formatINR(s.pnl)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {bookieStats.length > 0 && (
                  <div className="anim-card" style={{ background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow, marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface, marginBottom: 14 }}>🏢 By Bookie</div>
                    {bookieStats.map((bs, i) => (
                      <div key={bs.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < bookieStats.length - 1 ? `1px solid ${t.outlineVariant}` : "none" }}>
                        <div><div style={{ fontSize: 14, fontWeight: 800, color: t.onSurface }}>{bs.name}</div><div style={{ fontSize: 12, color: t.onSurfaceVariant }}>{bs.bets.length} bets · {bs.won} won</div></div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: bs.pnl >= 0 ? t.primary : t.error }}>{bs.pnl >= 0 ? "+" : ""}{hidden ? "••" : formatINR(bs.pnl)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ BANKROLL TAB ══ */}
        {tab === "bankroll" && (
          <div className="anim-tab" style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="anim-card" style={{ background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface, marginBottom: 14 }}>💰 Starting Bankroll</div>
              <M3Field t={t} label="Starting Amount (₹)" value={bankrollStart || ""} onChange={v => setBankrollStart(parseFloat(v) || 0)} type="number" placeholder="e.g. 10000" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Starting", value: hidden ? "₹ ••••" : formatINR(bankrollStart), bg: t.surfaceContainerHighest, color: t.onSurfaceVariant },
                { label: "Current Balance", value: hidden ? "₹ ••••" : formatINR(currentBalance), bg: currentBalance >= (bankrollStart || 0) ? t.primaryContainer : t.errorContainer, color: currentBalance >= (bankrollStart || 0) ? t.primary : t.error },
                { label: "Total P&L", value: hidden ? "₹ ••••" : (totalPnL >= 0 ? "+" : "") + formatINR(totalPnL), bg: totalPnL >= 0 ? t.statusWon.container : t.statusLost.container, color: totalPnL >= 0 ? t.statusWon.color : t.statusLost.color },
                { label: "ROI", value: bankrollStart > 0 ? `${((totalPnL / bankrollStart) * 100).toFixed(1)}%` : "—", bg: t.secondaryContainer, color: t.secondary },
              ].map((s, i) => (
                <div key={s.label} className="anim-card" style={{ animationDelay: `${i * 0.06}s`, background: s.bg, borderRadius: 24, padding: "16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: s.color, fontWeight: 700, opacity: 0.75, marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="anim-card" style={{ background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface, marginBottom: 12 }}>📈 Bankroll Over Time</div>
              {bankrollData.length >= 2 ? <MiniChart data={bankrollData} color={currentBalance >= (bankrollStart || 0) ? t.statusWon.color : t.error} height={100} /> : <div style={{ fontSize: 13, color: t.onSurfaceVariant, textAlign: "center", padding: "20px 0" }}>Settle some bets to see chart</div>}
            </div>
          </div>
        )}

        {/* ══ MANAGE TAB ══ */}
        {tab === "manage" && (
          <div className="anim-tab" style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Sheets Status */}
            <div className="anim-card" style={{ background: SYNC_ENABLED ? t.statusWon.container : t.tertiaryContainer, borderRadius: 24, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: SYNC_ENABLED ? t.statusWon.color : t.tertiary, marginBottom: 6 }}>
                {SYNC_ENABLED ? "✅ Google Sheets Connected" : "🔗 Google Sheets — Not Connected"}
              </div>
              {SYNC_ENABLED ? (
                <div style={{ fontSize: 13, color: t.statusWon.color, marginBottom: 12 }}>
                  Data automatically syncs to your Google Sheet.<br />
                  Last sync: {lastSync ? lastSync.toLocaleString() : "Never"}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: t.onSurface, lineHeight: 1.6, marginBottom: 12 }}>
                  Apps Script deploy karo, phir <code style={{ background: t.surfaceContainerHigh, padding: "1px 6px", borderRadius: 6 }}>SHEETS_URL</code> update karo.
                </div>
              )}
              {SYNC_ENABLED && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="qbtn" onClick={loadFromSheets} style={{ background: t.statusWon.color, color: "#fff", border: "none", borderRadius: 20, padding: "8px 18px", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>↻ Sync Now</button>
                  <button className="qbtn" onClick={() => sheetsAPI.syncAll(bets).then(() => alert("Full sync done!"))} style={{ background: "transparent", color: t.statusWon.color, border: `1.5px solid ${t.statusWon.color}`, borderRadius: 20, padding: "8px 18px", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>Force Sync All</button>
                </div>
              )}
            </div>

            <div className="anim-card" style={{ background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface }}>🏢 Bookies / Sites</div>
                <button className="qbtn" onClick={() => setManageModal("bookies")} style={{ background: t.primaryContainer, color: t.primary, border: "none", borderRadius: 20, padding: "6px 16px", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>+ Edit</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[...bookies, "Other"].map(b => <span key={b} style={{ background: t.surfaceContainerHigh, color: t.onSurfaceVariant, borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 600 }}>{b}</span>)}
              </div>
            </div>

            <div className="anim-card" style={{ background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface }}>🏅 Sports</div>
                <button className="qbtn" onClick={() => setManageModal("sports")} style={{ background: t.primaryContainer, color: t.primary, border: "none", borderRadius: 20, padding: "6px 16px", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>+ Edit</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {sports.map(s => <span key={s} style={{ background: t.surfaceContainerHigh, color: t.onSurfaceVariant, borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 600 }}>{s}</span>)}
              </div>
            </div>

            <div className="anim-card" style={{ animationDelay: "0.1s", background: t.cardBg, borderRadius: 24, padding: 20, boxShadow: t.cardShadow }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.onSurface, marginBottom: 6 }}>📤 Export & Backup</div>
              <div style={{ fontSize: 13, color: t.onSurfaceVariant, marginBottom: 14 }}>Total bets: {bets.length}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="qbtn" onClick={exportCSV} style={{ background: t.primaryContainer, color: t.primary, border: "none", borderRadius: 20, padding: "9px 18px", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>📊 Export CSV</button>
              </div>
            </div>

            <div className="anim-card" style={{ animationDelay: "0.15s", background: t.errorContainer, borderRadius: 24, padding: 20, marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.error, marginBottom: 6 }}>⚠️ Danger Zone</div>
              <div style={{ fontSize: 13, color: t.error, opacity: 0.8, marginBottom: 14 }}>This will permanently delete all bets locally.</div>
              <button className="qbtn" onClick={() => { if (window.confirm("Delete ALL bets locally?")) setBets([]); }} style={{ background: t.error, color: "#fff", border: "none", borderRadius: 20, padding: "9px 20px", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>🗑 Clear Local Bets</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: t.surface, borderTop: `1px solid ${t.outlineVariant}`, zIndex: 200 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", padding: "8px 0 12px" }}>
          {NAV.map(n => {
            const active = tab === n.id;
            return (
              <button key={n.id} className="nav-item" onClick={() => setTab(n.id)}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0", color: active ? t.primary : t.onSurfaceVariant, fontFamily: "inherit", fontSize: 10, fontWeight: active ? 800 : 500 }}>
                <div style={{ fontSize: 20, padding: "2px 16px", borderRadius: 16, background: active ? t.primaryContainer : "transparent", transition: "background 0.2s" }}>{n.icon}</div>
                {n.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* FAB */}
      {tab === "bets" && !showForm && (
        <button className="fab" onClick={() => { setShowForm(true); setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
          style={{ position: "fixed", bottom: 84, right: 20, background: t.primary, color: t.onPrimary, border: "none", borderRadius: 20, padding: "14px 20px", fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", boxShadow: t.fabShadow, display: "flex", alignItems: "center", gap: 8, zIndex: 199 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> New Bet
        </button>
      )}
    </div>
  );
}
