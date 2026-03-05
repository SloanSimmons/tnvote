import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATES
// ─────────────────────────────────────────────────────────────────────────────
const STATE_CANDIDATES = [
  { name: "Raumesh Akbari", ballot: "Raumesh Akbari", party: "D", office: "TN State Senate", district: "29", level: "state", city: "Memphis", incumbent: true, notes: "Incumbent. N/Central Memphis." },
  { name: "Brent Taylor", ballot: "Brent Taylor", party: "R", office: "TN State Senate", district: "31", level: "state", city: "Memphis", incumbent: true, notes: "Incumbent. E. Memphis/Germantown." },
  { name: "London Lamar", ballot: "London Lamar", party: "D", office: "TN State Senate", district: "33", level: "state", city: "Memphis", incumbent: true, notes: "Incumbent. S/SW Memphis." },
];
const COUNTY_CANDIDATES = [
  { name: "JB Smiley", ballot: "JB Smiley Jr.", party: "D", office: "County Mayor", district: null, level: "county", city: "Memphis" },
  { name: "Melvin T Burgess", ballot: "Melvin Burgess", party: "D", office: "County Mayor", district: null, level: "county", city: "Memphis" },
  { name: "Joe Brown", ballot: "Joseph B. Brown", party: "R", office: "County Mayor", district: null, level: "county", city: "Germantown" },
  { name: "John J Deberry Jr", ballot: "John J. Deberry Jr.", party: "R", office: "County Mayor", district: null, level: "county", city: "Memphis" },
  { name: "Michael O. Harris", ballot: "Michael O. Harris", party: "D", office: "Assessor of Property", district: null, level: "county", city: "Memphis" },
  { name: "Thomas B. Lannan", ballot: "Thomas B. Lannan", party: "R", office: "Assessor of Property", district: null, level: "county", city: "Collierville" },
  { name: "Anthony Jerome Buckner", ballot: "Anthony J. Buckner", party: "D", office: "Sheriff", district: null, level: "county", city: "Collierville" },
  { name: "Marco Yzaguirre", ballot: "Marco Yzaguirre", party: "R", office: "Sheriff", district: null, level: "county", city: "Collierville" },
  { name: "Wanda Halbert", ballot: "Wanda Halbert", party: "D", office: "Criminal Court Clerk", district: null, level: "county", city: "Memphis" },
  { name: "Jamita E. Swearengen", ballot: "Jamita E. Swearengen", party: "D", office: "Circuit Court Clerk", district: null, level: "county", city: "Memphis" },
];
const ALL_CANDIDATES = [...STATE_CANDIDATES, ...COUNTY_CANDIDATES];

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const PC = { D: "#2563eb", R: "#dc2626", I: "#64748b" };
const IC = {
  "Real Estate": "#f59e0b", "Legal": "#8b5cf6", "Healthcare": "#10b981",
  "Finance/Banking": "#3b82f6", "Construction": "#f97316", "Retail/Business": "#ec4899",
  "Education": "#14b8a6", "Labor/Union": "#ef4444", "Government": "#6366f1",
  "Political/PAC": "#dc2626", "Technology": "#06b6d4", "Energy/Utilities": "#84cc16",
  "Hospitality/Food": "#fb923c", "Individual/Unknown": "#6b7280",
};

// ─────────────────────────────────────────────────────────────────────────────
// PAC DETECTION
// ─────────────────────────────────────────────────────────────────────────────
function isPAC(name = "") {
  if (!name || name.trim().length < 3) return false;
  const u = name.toUpperCase();
  return (
    u.includes("POLITICAL ACTION") || u.includes(" PAC") || u.includes("(PAC)") ||
    u.startsWith("PAC ") || u === "PAC" || u.includes("COMMITTEE") ||
    u.includes("LEADERSHIP FUND") || u.includes("VICTORY FUND") ||
    u.includes("ACTION FUND") || u.includes("POLITICAL FUND") ||
    u.includes("CAMPAIGN FUND") || /\bFRIENDS OF\b/.test(u) ||
    /\bCITIZENS FOR\b/.test(u) || /\bELECT\s+\w/.test(u)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN DETECTION + FILE PARSER
// ─────────────────────────────────────────────────────────────────────────────
function detectColumns(headerRow) {
  const h = headerRow.map(c => String(c || "").trim().toUpperCase());
  const find = (...pats) => { for (const p of pats) { const i = h.findIndex(c => p.test(c)); if (i !== -1) return i; } return -1; };
  const found = {
    type: find(/^TYPE$/, /CONTRIB.*TYPE/, /TRAN.*TYPE/),
    adj: find(/^ADJ/, /ADJUST/),
    amount: find(/AMOUNT/, /CONTRIB.*AMT/, /DONATION/),
    date: find(/^DATE$/, /CONTRIB.*DATE/, /RECEIPT.*DATE/),
    electionYear: find(/ELECTION.*YEAR/, /ELECT.*YR/, /^YEAR$/),
    recipientName: find(/RECIPIENT/, /FILER NAME/, /^FILER$/, /COMMITTEE NAME/),
    contributorName: find(/CONTRIBUTOR NAME/, /DONOR NAME/, /^CONTRIBUTOR$/, /^CONTRIBUTOR NAME$/),
    contributorOccupation: find(/OCCUPATION/, /JOB TITLE/, /PROFESSION/),
    contributorEmployer: find(/EMPLOYER/, /COMPANY/, /BUSINESS/, /ORGANIZATION/),
  };
  const defaults = { type: 0, adj: 1, amount: 2, date: 3, electionYear: 4, recipientName: 5, contributorName: 6, contributorOccupation: 7, contributorEmployer: 8 };
  for (const [f, idx] of Object.entries(defaults)) { if (found[f] === -1 || found[f] === undefined) found[f] = idx; }
  return found;
}

function parseFile(rawRows) {
  if (!rawRows || rawRows.length === 0) return { contributions: [], pacNames: [], debug: { error: "No rows" } };
  let headerIdx = 0, colMap = null;
  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    const row = Array.isArray(rawRows[i]) ? rawRows[i] : Object.values(rawRows[i]);
    if (/RECIPIENT|CONTRIBUTOR|FILER|AMOUNT/i.test(row.map(c => String(c || "")).join(" "))) {
      headerIdx = i; colMap = detectColumns(row); break;
    }
  }
  if (!colMap) { headerIdx = 0; colMap = detectColumns(Array.isArray(rawRows[0]) ? rawRows[0] : Object.values(rawRows[0])); }
  const headerRow = Array.isArray(rawRows[headerIdx]) ? rawRows[headerIdx] : Object.values(rawRows[headerIdx]);
  const dataRows = rawRows.slice(headerIdx + 1);
  const contributions = [];
  let skipped = 0;
  for (const rv of dataRows) {
    const v = Array.isArray(rv) ? rv : Object.values(rv);
    const get = f => String(v[colMap[f]] ?? "").trim();
    const amount = parseFloat(get("amount").replace(/[$,\s]/g, "")) || 0;
    const recipientName = get("recipientName");
    const contributorName = get("contributorName");
    if (!recipientName && !contributorName && amount === 0) { skipped++; continue; }
    contributions.push({
      type: get("type"), adj: get("adj"), amount, date: get("date"),
      electionYear: get("electionYear"), recipientName, contributorName,
      contributorOccupation: get("contributorOccupation"),
      contributorEmployer: get("contributorEmployer"),
      recipientIsPAC: isPAC(recipientName), contributorIsPAC: isPAC(contributorName),
    });
  }
  const pacNames = [...new Set([
    ...contributions.filter(r => r.recipientIsPAC).map(r => r.recipientName),
    ...contributions.filter(r => r.contributorIsPAC).map(r => r.contributorName),
  ].filter(Boolean))].sort();
  const firstData = dataRows[0] ? (Array.isArray(dataRows[0]) ? dataRows[0] : Object.values(dataRows[0])) : [];
  const colDebug = Object.entries(colMap).map(([field, idx]) => ({
    field, colIdx: idx,
    headerLabel: String(headerRow[idx] || "(none)").slice(0, 25),
    sampleValue: String(firstData[idx] || "").slice(0, 35),
  }));
  const sampleRecipients = [...new Set(contributions.slice(0, 30).map(r => r.recipientName).filter(Boolean))].slice(0, 10);
  return { contributions, pacNames, debug: { headerIdx, headerRow: headerRow.map(h => String(h || "").slice(0, 30)), colDebug, sampleRecipients, totalRows: rawRows.length, parsed: contributions.length, skipped } };
}

function matchesCandidate(recipientName, candidateName) {
  if (!recipientName || !candidateName) return false;
  const rn = recipientName.toUpperCase().replace(/[^A-Z\s]/g, "").trim();
  const cn = candidateName.toUpperCase().replace(/[^A-Z\s]/g, "").trim();
  const parts = cn.split(" ").filter(p => p.length > 2);
  return parts.length > 0 && parts.filter(p => rn.includes(p)).length >= Math.min(2, parts.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY + SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
function guessCategory(occ = "", emp = "", name = "") {
  const h = (occ + " " + emp + " " + name).toUpperCase();
  if (/ATTORNEY|LAWYER|LAW FIRM|LEGAL|COUNSEL/.test(h)) return "Legal";
  if (/REALTOR|REAL ESTATE|REALTY|DEVELOPER|HOMEBUILDER|APARTMENT/.test(h)) return "Real Estate";
  if (/DOCTOR|PHYSICIAN|HOSPITAL|HEALTH|MEDICAL|PHARMA|NURSE|CLINIC|DENTAL/.test(h)) return "Healthcare";
  if (/BANK|FINANCE|INVEST|CAPITAL|INSURANCE|MORTGAGE|FINANCIAL|CREDIT/.test(h)) return "Finance/Banking";
  if (/CONSTRUC|CONTRAC|BUILDER|ENGINEER|ARCHITECT/.test(h)) return "Construction";
  if (/TEACHER|SCHOOL|EDUCATION|UNIVERSITY|COLLEGE|PROFESSOR/.test(h)) return "Education";
  if (/UNION|LABOR|AFL|TEAMSTER/.test(h)) return "Labor/Union";
  if (/PAC|POLITICAL ACTION|COMMITTEE|CAMPAIGN/.test(h)) return "Political/PAC";
  if (/TECH|SOFTWARE|DIGITAL|DATA|COMPUTER|CYBER/.test(h)) return "Technology";
  if (/ENERGY|UTILITY|GAS|OIL|ELECTRIC|POWER/.test(h)) return "Energy/Utilities";
  if (/RESTAURANT|HOTEL|HOSPITALITY|FOOD|BEVERAGE/.test(h)) return "Hospitality/Food";
  if (/RETAIL|STORE|SALES|MERCHANT|FRANCHISE/.test(h)) return "Retail/Business";
  if (/GOVERNMENT|CITY |COUNTY |STATE |FEDERAL |MILITARY|POLICE|FIRE /.test(h)) return "Government";
  return "Individual/Unknown";
}

function buildSummary(rows) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byInd = {};
  rows.forEach(r => {
    const cat = guessCategory(r.contributorOccupation, r.contributorEmployer, r.contributorName);
    if (!byInd[cat]) byInd[cat] = { value: 0, count: 0 };
    byInd[cat].value += r.amount; byInd[cat].count++;
  });
  const breakdown = Object.entries(byInd).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.value - a.value);
  return {
    totalRaised: total, donorCount: rows.length,
    pacCount: rows.filter(r => isPAC(r.contributorName)).length,
    avgDonation: rows.length ? total / rows.length : 0,
    largestDonation: Math.max(0, ...rows.map(r => r.amount)),
    topIndustry: breakdown[0]?.name || "—", breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE (localStorage for deployed site — no Anthropic storage API outside artifact)
// ─────────────────────────────────────────────────────────────────────────────
const store = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  keys: (prefix) => { try { return Object.keys(localStorage).filter(k => k.startsWith(prefix)); } catch { return []; } },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  page: { fontFamily: "'Inter',system-ui,sans-serif", background: "#020817", minHeight: "100vh", color: "#e2e8f0" },
  hdr: { background: "#0a0f1a", borderBottom: "1px solid #1e293b", padding: "16px 24px", display: "flex", alignItems: "flex-start", gap: "14px", flexWrap: "wrap" },
  back: { background: "none", border: "1px solid #1e293b", color: "#475569", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" },
  th: { padding: "5px 8px", textAlign: "left", color: "#334155", fontWeight: "600", borderBottom: "1px solid #1e293b", background: "#020817", whiteSpace: "nowrap" },
};
const Chip = ({ color, children }) => <span style={{ background: color + "22", color, border: "1px solid " + color + "44", borderRadius: "4px", padding: "1px 6px", fontSize: "9px", fontWeight: "700" }}>{children}</span>;
const Tag = ({ children }) => <span style={{ background: "#1e293b", color: "#475569", border: "1px solid #334155", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontFamily: "monospace", letterSpacing: "1.5px", fontWeight: "600" }}>{children}</span>;
const NavB = ({ active, onClick, children }) => <button onClick={onClick} style={{ padding: "7px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer", border: "none", background: active ? "#1e3a5f" : "#1e293b", color: active ? "#93c5fd" : "#475569" }}>{children}</button>;
const Sel = ({ value, onChange, opts }) => <select value={value} onChange={e => onChange(e.target.value)} style={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0", padding: "6px 8px", borderRadius: "6px", fontSize: "11px", cursor: "pointer" }}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;

function Panel({ title, children, bc, extra }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid " + (bc || "#1e293b"), borderRadius: "8px", padding: "14px" }}>
      {(title || extra) && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        {title && <div style={{ fontSize: "10px", fontWeight: "700", color: "#334155", textTransform: "uppercase", letterSpacing: "1.2px" }}>{title}</div>}
        {extra}
      </div>}
      {children}
    </div>
  );
}
function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#020817", border: "1px solid #1e293b", borderRadius: "6px", padding: "10px 12px" }}>
      <div style={{ fontSize: "9px", color: "#334155", textTransform: "uppercase", letterSpacing: "0.8px" }}>{label}</div>
      <div style={{ fontSize: String(value).length > 12 ? "10px" : "15px", fontWeight: "700", color, marginTop: "2px", lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}
function IndustryPie({ breakdown, height = 220 }) {
  if (!breakdown?.length) return null;
  const total = breakdown.reduce((s, r) => s + r.value, 0);
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={breakdown} cx="50%" cy="50%" innerRadius={height * .22} outerRadius={height * .38} paddingAngle={2} dataKey="value">
            {breakdown.map((e, i) => <Cell key={i} fill={IC[e.name] || "#6b7280"} />)}
          </Pie>
          <Tooltip formatter={(v, n, p) => ["$" + v.toLocaleString() + " (" + p.payload.count + "d)", n]} contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "11px" }} />
          <Legend formatter={v => <span style={{ fontSize: "10px", color: "#94a3b8" }}>{v}</span>} iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ marginTop: "6px" }}>
        {breakdown.map((row, i) => {
          const pct = total > 0 ? Math.round(row.value / total * 100) : 0;
          const clr = IC[row.name] || "#6b7280";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: clr, flexShrink: 0 }} />
              <div style={{ fontSize: "10px", color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
              <div style={{ fontSize: "9px", color: "#475569" }}>{row.count}d</div>
              <div style={{ width: "55px", background: "#1e293b", borderRadius: "3px", height: "4px" }}><div style={{ width: pct + "%", height: "100%", background: clr, borderRadius: "3px" }} /></div>
              <div style={{ fontSize: "10px", color: "#f1f5f9", width: "26px", textAlign: "right" }}>{pct}%</div>
              <div style={{ fontSize: "10px", color: "#22c55e", width: "58px", textAlign: "right", fontFamily: "monospace" }}>${row.value.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
function DonorTable({ rows, onPACClick }) {
  return (
    <div style={{ maxHeight: "300px", overflowY: "auto", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead style={{ position: "sticky", top: 0, background: "#0a0f1a" }}>
          <tr>{["Contributor", "Amount", "Date", "Occupation", "Employer"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {[...rows].sort((a, b) => b.amount - a.amount).map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #0a0f1a" }}>
              <td style={{ padding: "4px 8px" }}>
                {isPAC(r.contributorName)
                  ? <span onClick={() => onPACClick?.(r.contributorName)} style={{ color: "#f87171", cursor: "pointer", textDecoration: "underline dotted" }}>{r.contributorName}</span>
                  : <span style={{ color: "#e2e8f0" }}>{r.contributorName}</span>}
              </td>
              <td style={{ padding: "4px 8px", color: "#22c55e", fontFamily: "monospace", whiteSpace: "nowrap" }}>${r.amount.toLocaleString()}</td>
              <td style={{ padding: "4px 8px", color: "#475569", whiteSpace: "nowrap" }}>{r.date}</td>
              <td style={{ padding: "4px 8px", color: "#94a3b8" }}>{r.contributorOccupation || "—"}</td>
              <td style={{ padding: "4px 8px", color: "#475569" }}>{r.contributorEmployer || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD PANEL (shared by state + county import)
// ─────────────────────────────────────────────────────────────────────────────
function UploadPanel({ portalName, portalUrl, existingFile, existingCount, onParsed }) {
  const [parsing, setParsing] = useState(false);
  const [status, setStatus] = useState(null);
  const [debug, setDebug] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setParsing(true); setStatus(null); setDebug(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const { contributions, pacNames, debug: dbg } = parseFile(rawRows);
      onParsed({ contributions, pacNames, uploadedAt: new Date().toISOString(), fileName: file.name });
      setDebug(dbg);
      setShowDebug(pacNames.length === 0);
      setStatus({
        ok: contributions.length > 0,
        msg: contributions.length > 0
          ? `✓ Loaded ${contributions.length.toLocaleString()} records · ${pacNames.length} PACs detected`
          : "⚠ 0 records parsed — check column debug below"
      });
    } catch (err) { setStatus({ ok: false, msg: "Parse failed: " + err.message }); }
    setParsing(false);
    e.target.value = "";
  };

  return (
    <Panel title="Upload File">
      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px", lineHeight: 1.6 }}>
        Download from <a href={portalUrl} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>{portalName}</a>. Accepts CSV or Excel (.xlsx / .xls). Column names are auto-detected.
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} disabled={parsing}
        style={{ padding: "9px 20px", background: "#1e3a5f", border: "1px solid #2563eb44", borderRadius: "6px", color: "#93c5fd", fontSize: "13px", fontWeight: "600", cursor: "pointer", opacity: parsing ? 0.5 : 1 }}>
        {parsing ? "⟳ Parsing…" : "⬆ Choose CSV or Excel File"}
      </button>
      {status && (
        <div style={{ marginTop: "10px", fontSize: "12px", color: status.ok ? "#22c55e" : "#f87171", background: status.ok ? "#0f2a1a" : "#2d1515", border: "1px solid " + (status.ok ? "#166534" : "#6e1313"), borderRadius: "6px", padding: "8px 12px" }}>
          {status.msg}
        </div>
      )}
      {existingFile && <div style={{ marginTop: "8px", fontSize: "11px", color: "#334155" }}>Current: {existingFile} · {(existingCount || 0).toLocaleString()} records</div>}
      {debug && (
        <div style={{ marginTop: "10px" }}>
          <button onClick={() => setShowDebug(v => !v)} style={{ background: "none", border: "1px solid #1e3a5f", color: "#60a5fa", padding: "4px 10px", borderRadius: "5px", fontSize: "11px", cursor: "pointer" }}>
            {showDebug ? "▾ Hide" : "▸ Show"} column detection debug
          </button>
          {showDebug && (
            <div style={{ marginTop: "8px", background: "#020817", border: "1px solid #1e3a5f", borderRadius: "6px", padding: "12px", fontSize: "11px", fontFamily: "monospace" }}>
              <div style={{ color: "#475569", marginBottom: "6px" }}>Rows: {debug.totalRows} · Parsed: {debug.parsed} · Skipped: {debug.skipped}</div>
              <div style={{ color: "#94a3b8", fontWeight: "700", marginBottom: "4px" }}>Header: [{debug.headerRow?.map(h => `"${h}"`).join(", ")}]</div>
              <div style={{ color: "#94a3b8", fontWeight: "700", margin: "8px 0 4px" }}>Column mapping:</div>
              {debug.colDebug?.map(({ field, colIdx, headerLabel, sampleValue }) => (
                <div key={field} style={{ display: "flex", gap: "8px", marginBottom: "2px", flexWrap: "wrap" }}>
                  <span style={{ color: "#7c3aed", width: "165px", flexShrink: 0 }}>{field}</span>
                  <span style={{ color: "#334155" }}>col[{colIdx}]</span>
                  <span style={{ color: "#475569" }}>header="{headerLabel}"</span>
                  <span style={{ color: "#e2e8f0" }}>value="{sampleValue}"</span>
                </div>
              ))}
              <div style={{ color: "#94a3b8", fontWeight: "700", margin: "8px 0 4px" }}>Sample recipients:</div>
              {debug.sampleRecipients?.map((r, i) => (
                <div key={i} style={{ color: isPAC(r) ? "#22c55e" : "#64748b", marginBottom: "2px" }}>{isPAC(r) ? "✓ PAC " : "      "} "{r}"</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDING PAGE — address lookup
// ─────────────────────────────────────────────────────────────────────────────
function Landing({ onBrowseAll, onAddressResult }) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // For now, detect Shelby County addresses and show all races.
  // Phase 2: call Google Civic Information API for real district lookup.
  const handleLookup = async () => {
    if (!address.trim()) return;
    setLoading(true); setError(null);
    try {
      // Geocode the address using the free Census geocoder
      const encoded = encodeURIComponent(address.trim() + ", Tennessee");
      const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&vintage=Current_Current&layers=8,12,46,54,86&format=json`;
      const res = await fetch(url);
      const data = await res.json();
      const match = data?.result?.addressMatches?.[0];
      if (!match) { setError("Address not found. Try adding your city or zip code."); setLoading(false); return; }

      const geographies = match.geographies;
      const countyName = geographies?.Counties?.[0]?.NAME || "";
      const stateLower = geographies?.["2020 Census States"]?.[0]?.NAME || "";
      const inShelby = /shelby/i.test(countyName);

      // Build list of relevant races based on geography
      // Phase 2: use actual district codes from Census response to filter candidates
      const relevant = ALL_CANDIDATES.filter(c => {
        if (c.level === "county") return inShelby;
        if (c.level === "state") return inShelby; // expand with real district lookup later
        return false;
      });

      onAddressResult({
        address: match.matchedAddress,
        county: countyName,
        candidates: relevant,
      });
    } catch (e) {
      setError("Lookup failed. Check your connection and try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ ...S.page, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px 40px", textAlign: "center" }}>
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "20px" }}>
          <Tag>TENNESSEE</Tag><Tag>2026 ELECTIONS</Tag>
        </div>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 52px)", fontWeight: "800", color: "#f1f5f9", lineHeight: 1.15, letterSpacing: "-1px", maxWidth: "700px", marginBottom: "16px" }}>
          See who's funding<br />your candidates.
        </h1>
        <p style={{ fontSize: "16px", color: "#475569", maxWidth: "480px", lineHeight: 1.7, marginBottom: "36px" }}>
          Enter your address and we'll show you every candidate on your ballot — and the industries, PACs, and individuals funding their campaigns.
        </p>

        {/* Address input */}
        <div style={{ display: "flex", gap: "8px", width: "100%", maxWidth: "520px", flexWrap: "wrap", justifyContent: "center" }}>
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLookup()}
            placeholder="123 Main St, Memphis, TN 38103"
            style={{ flex: 1, minWidth: "260px", background: "#0f172a", border: "1px solid #1e293b", color: "#f1f5f9", padding: "12px 16px", borderRadius: "8px", fontSize: "14px", outline: "none" }}
          />
          <button
            onClick={handleLookup}
            disabled={loading || !address.trim()}
            style={{ padding: "12px 24px", background: "#2563eb", border: "none", borderRadius: "8px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", opacity: loading || !address.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
            {loading ? "Looking up…" : "Find My Races →"}
          </button>
        </div>
        {error && <div style={{ marginTop: "12px", fontSize: "12px", color: "#f87171" }}>{error}</div>}

        <button onClick={onBrowseAll} style={{ marginTop: "20px", background: "none", border: "none", color: "#334155", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}>
          Browse all candidates instead
        </button>
      </div>

      {/* How it works */}
      <div style={{ borderTop: "1px solid #1e293b", padding: "40px 24px", display: "flex", gap: "32px", justifyContent: "center", flexWrap: "wrap" }}>
        {[
          ["📍", "Enter your address", "We find every race on your specific ballot — state, county, and local."],
          ["💰", "See who's funding them", "Campaign finance data broken down by industry, PAC, and individual donor."],
          ["🔍", "Trace the money", "PAC contributions are de-obscured — see the real individuals and industries behind each PAC."],
          ["📅", "Get notified", "Add a calendar reminder for when new finance reports become available before the election."],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ maxWidth: "200px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>{icon}</div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#94a3b8", marginBottom: "6px" }}>{title}</div>
            <div style={{ fontSize: "12px", color: "#334155", lineHeight: 1.6 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #0f172a", padding: "16px 24px", textAlign: "center", fontSize: "11px", color: "#1e293b" }}>
        Data sourced from TN Registry of Election Finance (TNCAMP) and Shelby County Election Commission. Updated when reports are filed.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// YOUR RACES — results page after address lookup
// ─────────────────────────────────────────────────────────────────────────────
function YourRaces({ result, allContribs, getContribs, onSelectCandidate, onBrowseAll, onBack }) {
  const offices = [...new Set(result.candidates.map(c => c.office))].sort();
  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.back}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "11px", color: "#475569", marginBottom: "4px" }}>{result.address}</div>
          <h2 style={{ margin: "0 0 2px", fontSize: "18px", color: "#f1f5f9", fontWeight: "700" }}>Your Races · {result.county}</h2>
          <div style={{ fontSize: "11px", color: "#334155" }}>{result.candidates.length} races on your ballot</div>
        </div>
        <button onClick={onBrowseAll} style={{ ...S.back, color: "#60a5fa", borderColor: "#1e3a5f" }}>Browse all candidates</button>
      </div>

      {/* Calendar invite banner */}
      <div style={{ background: "#0a1628", borderBottom: "1px solid #1e3a5f", padding: "12px 24px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: "12px", color: "#93c5fd", fontWeight: "600" }}>📅 Finance reports drop before the election. </span>
          <span style={{ fontSize: "12px", color: "#475569" }}>Add a calendar reminder and we'll link you to the updated data when it's available.</span>
        </div>
        <CalendarButton candidates={result.candidates} />
      </div>

      <div style={{ padding: "18px 24px" }}>
        {offices.map(office => {
          const cands = result.candidates.filter(c => c.office === office);
          return (
            <div key={office} style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#334155", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>{office}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "8px" }}>
                {cands.map(c => {
                  const fc = getContribs(c.name, c.level);
                  const summ = fc.length > 0 ? buildSummary(fc) : null;
                  return (
                    <div key={c.name} onClick={() => onSelectCandidate(c)}
                      style={{ background: "#0f172a", border: "1px solid " + (summ ? "#16653455" : "#1e293b"), borderRadius: "8px", padding: "14px", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#1a2234"}
                      onMouseLeave={e => e.currentTarget.style.background = "#0f172a"}>
                      <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
                        <Chip color={PC[c.party]}>{c.party === "D" ? "Democrat" : c.party === "R" ? "Republican" : "Independent"}</Chip>
                        {c.incumbent && <Chip color="#22c55e">Incumbent</Chip>}
                        {summ && <Chip color="#22c55e">Data available</Chip>}
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: "700", color: "#f1f5f9", marginBottom: "2px" }}>{c.ballot}</div>
                      <div style={{ fontSize: "11px", color: "#475569", marginBottom: summ ? "10px" : 0 }}>{c.city}, TN</div>
                      {summ && (
                        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
                          <div><div style={{ fontSize: "9px", color: "#334155" }}>RAISED</div><div style={{ fontSize: "13px", fontWeight: "700", color: "#22c55e" }}>${summ.totalRaised.toLocaleString()}</div></div>
                          <div style={{ textAlign: "right" }}><div style={{ fontSize: "9px", color: "#334155" }}>TOP SECTOR</div><div style={{ fontSize: "11px", color: "#94a3b8" }}>{summ.topIndustry}</div></div>
                        </div>
                      )}
                      {!summ && <div style={{ fontSize: "11px", color: "#1e293b", fontStyle: "italic" }}>Finance data not yet available</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR INVITE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
function CalendarButton({ candidates }) {
  const generateICS = () => {
    // TN primary pre-election report deadline: ~7 days before primary (Aug 2026)
    // Using Aug 1, 2026 as placeholder — update with real Registry of Election Finance dates
    const reportDate = "20260801";
    const uid = "tnvote-report-" + Date.now() + "@tnvote.app";
    const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const summary = "TN Campaign Finance Reports Available";
    const desc = "New campaign finance reports are available for candidates in your area. Visit https://tnvote.vercel.app to see who's funding your candidates.\\n\\nCandidates: " + candidates.map(c => c.ballot).join(", ");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TNVote//Campaign Finance Tracker//EN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${reportDate}`,
      `DTEND;VALUE=DATE:${reportDate}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tnvote-finance-reminder.ics"; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={generateICS}
      style={{ padding: "7px 14px", background: "#1e3a5f", border: "1px solid #2563eb44", borderRadius: "6px", color: "#93c5fd", fontSize: "12px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>
      📅 Add Calendar Reminder
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAC PROFILE
// ─────────────────────────────────────────────────────────────────────────────
function PACProfile({ pacName, allContribs, onBack }) {
  const received = allContribs.filter(r => r.recipientName === pacName);
  const gave = allContribs.filter(r => r.contributorName === pacName && !r.recipientIsPAC);
  const gaveToPAC = allContribs.filter(r => r.contributorName === pacName && r.recipientIsPAC);
  const recSumm = buildSummary(received);
  const byRecip = gave.reduce((acc, r) => { if (!acc[r.recipientName]) acc[r.recipientName] = 0; acc[r.recipientName] += r.amount; return acc; }, {});
  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.back}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
            <Chip color="#dc2626">PAC</Chip>
            {gave.length > 0 && <Chip color="#f59e0b">GIVES TO CANDIDATES</Chip>}
          </div>
          <h2 style={{ margin: "2px 0", fontSize: "16px", color: "#f1f5f9", fontWeight: "700", lineHeight: 1.3 }}>{pacName}</h2>
          <div style={{ fontSize: "11px", color: "#334155" }}>{received.length} donors in · {gave.length + gaveToPAC.length} contributions out</div>
        </div>
      </div>
      <div style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#dc2626", textTransform: "uppercase", letterSpacing: "1.2px" }}>← Who Funds This PAC</div>
          {received.length === 0
            ? <Panel><div style={{ textAlign: "center", padding: "24px", color: "#334155", fontSize: "12px" }}>No incoming contributions found for this PAC in the current dataset.</div></Panel>
            : <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "7px" }}>
                <StatCard label="Total In" value={"$" + recSumm.totalRaised.toLocaleString()} color="#22c55e" />
                <StatCard label="Donors" value={recSumm.donorCount} color="#60a5fa" />
                <StatCard label="Top Sector" value={recSumm.topIndustry} color="#fb923c" />
              </div>
              <Panel title="Donor Industry Profile"><IndustryPie breakdown={recSumm.breakdown} height={200} /></Panel>
              <Panel title={"Individual Donors (" + received.length + ")"}><DonorTable rows={received} /></Panel>
            </>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#f59e0b", textTransform: "uppercase", letterSpacing: "1.2px" }}>→ Where This PAC Gives</div>
          {gave.length === 0 && gaveToPAC.length === 0
            ? <Panel><div style={{ textAlign: "center", padding: "24px", color: "#334155", fontSize: "12px" }}>No outgoing contributions found.</div></Panel>
            : <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "7px" }}>
                <StatCard label="Total Out" value={"$" + gave.reduce((s, r) => s + r.amount, 0).toLocaleString()} color="#f59e0b" />
                <StatCard label="Recipients" value={Object.keys(byRecip).length} color="#a78bfa" />
              </div>
              {Object.keys(byRecip).length > 0 && (
                <Panel title="Contributions to Candidates">
                  <div style={{ maxHeight: "320px", overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead style={{ position: "sticky", top: 0, background: "#0a0f1a" }}>
                        <tr>{["Recipient", "Total", "# Contribs"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {Object.entries(byRecip).sort(([, a], [, b]) => b - a).map(([name, total], i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #0a0f1a" }}>
                            <td style={{ padding: "4px 8px", color: "#e2e8f0" }}>{name}</td>
                            <td style={{ padding: "4px 8px", color: "#f59e0b", fontFamily: "monospace", fontWeight: "600" }}>${total.toLocaleString()}</td>
                            <td style={{ padding: "4px 8px", color: "#475569" }}>{gave.filter(r => r.recipientName === name).length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
            </>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATE DETAIL
// ─────────────────────────────────────────────────────────────────────────────
function Detail({ c, onBack, fileContribs, allContribs, onViewPAC }) {
  const [toggle, setToggle] = useState("all");
  const directRows = fileContribs.filter(r => !isPAC(r.contributorName));
  const pacRows = fileContribs.filter(r => isPAC(r.contributorName));
  const displayRows = toggle === "direct" ? directRows : toggle === "pac" ? pacRows : fileContribs;
  const fileSumm = fileContribs.length > 0 ? buildSummary(displayRows) : null;
  const uniquePACs = [...new Set(pacRows.map(r => r.contributorName))];

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.back}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <Chip color={PC[c.party]}>{c.party === "D" ? "Democrat" : c.party === "R" ? "Republican" : "Independent"}</Chip>
            {c.level === "state" && <Chip color="#7c3aed">TN STATE SENATE</Chip>}
            {c.incumbent && <Chip color="#22c55e">INCUMBENT</Chip>}
            <span style={{ fontSize: "11px", color: "#475569" }}>{c.office}{c.district ? " — District " + c.district : ""}</span>
          </div>
          <h2 style={{ margin: "4px 0 2px", fontSize: "20px", color: "#f1f5f9", fontWeight: "700" }}>{c.ballot}</h2>
          <div style={{ fontSize: "11px", color: "#334155" }}>{c.city}, TN{c.notes ? " · " + c.notes : ""}</div>
        </div>
      </div>
      <div style={{ padding: "18px 24px" }}>
        {fileContribs.length === 0 ? (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", padding: "48px 24px", textAlign: "center", color: "#334155" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#475569", marginBottom: "8px" }}>No finance data available yet for this candidate.</div>
            <div style={{ fontSize: "12px", lineHeight: 1.7 }}>Data will appear here once campaign finance reports are filed with the<br />TN Registry of Election Finance or Shelby County Election Commission.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#475569", fontWeight: "600" }}>Show:</span>
              {[["all", "All (" + fileContribs.length + ")"], ["direct", "Direct (" + directRows.length + ")"], ["pac", "PAC only (" + pacRows.length + ")"]].map(([v, l]) => (
                <button key={v} onClick={() => setToggle(v)} style={{ padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: "600", cursor: "pointer", border: "none", background: toggle === v ? "#1e3a5f" : "#1e293b", color: toggle === v ? "#93c5fd" : "#475569" }}>{l}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
              <StatCard label="Total Raised" value={"$" + fileContribs.reduce((s, r) => s + r.amount, 0).toLocaleString()} color="#22c55e" />
              <StatCard label="Contributions" value={fileContribs.length} color="#60a5fa" />
              <StatCard label="PAC $" value={"$" + pacRows.reduce((s, r) => s + r.amount, 0).toLocaleString()} color="#f87171" />
              <StatCard label="Direct $" value={"$" + directRows.reduce((s, r) => s + r.amount, 0).toLocaleString()} color="#fbbf24" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <Panel title="Industry Breakdown"><IndustryPie breakdown={fileSumm.breakdown} height={200} /></Panel>
              <Panel title={"PAC Donors (" + uniquePACs.length + ")"} bc={uniquePACs.length > 0 ? "#dc262633" : "#1e293b"}>
                {uniquePACs.length === 0
                  ? <div style={{ textAlign: "center", padding: "20px", color: "#334155", fontSize: "12px" }}>No PAC contributions found.</div>
                  : <>
                    <div style={{ fontSize: "10px", color: "#f87171", marginBottom: "8px" }}>Click any PAC to trace its real donors →</div>
                    {uniquePACs.map(pn => {
                      const total = pacRows.filter(r => r.contributorName === pn).reduce((s, r) => s + r.amount, 0);
                      const knownDonors = allContribs.filter(r => r.recipientName === pn).length;
                      return (
                        <div key={pn} onClick={() => onViewPAC(pn)}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 10px", borderRadius: "6px", marginBottom: "5px", background: "#020817", border: "1px solid #dc262633", cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = "#dc2626aa"}
                          onMouseLeave={e => e.currentTarget.style.borderColor = "#dc262633"}>
                          <div>
                            <div style={{ fontSize: "11px", color: "#f1f5f9", fontWeight: "500", lineHeight: 1.3 }}>{pn}</div>
                            <div style={{ fontSize: "9px", color: "#475569", marginTop: "2px" }}>{knownDonors > 0 ? knownDonors + " donors on file" : "click to see profile"}</div>
                          </div>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: "#f87171", fontFamily: "monospace", flexShrink: 0, marginLeft: "10px" }}>${total.toLocaleString()}</div>
                        </div>
                      );
                    })}
                  </>}
              </Panel>
            </div>
            <Panel title={"All Contributions (" + displayRows.length + ")"}><DonorTable rows={displayRows} onPACClick={onViewPAC} /></Panel>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA IMPORT (admin view — accessible via /admin route or ?admin=1)
// ─────────────────────────────────────────────────────────────────────────────
function DataImport({ level, data, onSave, onBack, allContribs }) {
  const isState = level === "state";
  const dataContribs = data?.contributions || [];
  const pacSummaries = (data?.pacNames || []).map(pn => {
    const recv = dataContribs.filter(r => r.recipientName === pn);
    const gave = allContribs.filter(r => r.contributorName === pn);
    return { name: pn, totalRecv: recv.reduce((s, r) => s + r.amount, 0), donorCount: recv.length, totalGave: gave.reduce((s, r) => s + r.amount, 0), recipCount: [...new Set(gave.map(r => r.recipientName))].length };
  }).sort((a, b) => (b.totalRecv + b.totalGave) - (a.totalRecv + a.totalGave));

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.back}>← Back</button>
        <div>
          <h2 style={{ margin: "0 0 3px", fontSize: "17px", color: "#f1f5f9", fontWeight: "700" }}>{isState ? "State" : "County"} Data Import</h2>
          <div style={{ fontSize: "11px", color: "#334155" }}>Admin — upload bulk export from {isState ? "TN TNCAMP" : "SCEC Easy Vote Portal"}</div>
        </div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <UploadPanel
          portalName={isState ? "TN TNCAMP" : "SCEC Easy Vote Portal"}
          portalUrl={isState ? "https://apps.tn.gov/tncamp/public/cesearch.htm" : "https://shelbycountytn.easyvotecampaignfinance.com/"}
          existingFile={data?.fileName}
          existingCount={dataContribs.length}
          onParsed={onSave}
        />
        {pacSummaries.length > 0 && (
          <Panel title={"Loaded PACs (" + pacSummaries.length + ")"}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "8px" }}>
              {pacSummaries.slice(0, 20).map(pac => (
                <div key={pac.name} style={{ background: "#020817", border: "1px solid #dc262633", borderRadius: "7px", padding: "10px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "600", color: "#f1f5f9", lineHeight: 1.3, marginBottom: "6px" }}>{pac.name}</div>
                  <div style={{ display: "flex", gap: "14px" }}>
                    {pac.donorCount > 0 && <div><div style={{ fontSize: "9px", color: "#334155" }}>RECEIVED</div><div style={{ fontSize: "12px", fontWeight: "700", color: "#22c55e" }}>${pac.totalRecv.toLocaleString()}</div></div>}
                    {pac.totalGave > 0 && <div><div style={{ fontSize: "9px", color: "#334155" }}>GAVE</div><div style={{ fontSize: "12px", fontWeight: "700", color: "#f59e0b" }}>${pac.totalGave.toLocaleString()}</div></div>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSE ALL CANDIDATES
// ─────────────────────────────────────────────────────────────────────────────
function BrowseAll({ allContribs, getContribs, onSelectCandidate, onBack }) {
  const [q, setQ] = useState("");
  const [of2, setOF] = useState("all");
  const [pf, setPF] = useState("all");
  const offices = [...new Set(ALL_CANDIDATES.map(c => c.office))].sort();
  const filtered = ALL_CANDIDATES.filter(c => {
    if (of2 !== "all" && c.office !== of2) return false;
    if (pf !== "all" && c.party !== pf) return false;
    if (q && !c.ballot.toLowerCase().includes(q.toLowerCase()) && !c.office.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const grouped = filtered.reduce((acc, c) => {
    const k = c.level === "state" ? "TN State Senate — District " + c.district : c.office;
    if (!acc[k]) acc[k] = []; acc[k].push(c); return acc;
  }, {});
  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.back}>← Home</button>
        <h2 style={{ margin: 0, fontSize: "17px", color: "#f1f5f9", fontWeight: "700", alignSelf: "center" }}>All Candidates</h2>
      </div>
      <div style={{ padding: "10px 24px", background: "#0a0f1a", borderBottom: "1px solid #1e293b", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search candidates…" style={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", width: "190px", outline: "none" }} />
        <Sel value={of2} onChange={setOF} opts={[["all", "All Offices"], ...offices.map(o => [o, o])]} />
        <Sel value={pf} onChange={setPF} opts={[["all", "All Parties"], ["D", "Democrat"], ["R", "Republican"], ["I", "Independent"]]} />
        <span style={{ marginLeft: "auto", fontSize: "11px", color: "#334155" }}>{filtered.length} shown</span>
      </div>
      <div style={{ padding: "18px 24px" }}>
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([grp, cands]) => (
          <div key={grp} style={{ marginBottom: "22px" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: "#334155", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>{grp}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(185px,1fr))", gap: "7px" }}>
              {cands.map(c => {
                const fc = getContribs(c.name, c.level);
                const summ = fc.length > 0 ? buildSummary(fc) : null;
                return (
                  <div key={c.name} onClick={() => onSelectCandidate(c)}
                    style={{ background: "#0f172a", border: "1px solid " + (summ ? "#16653455" : "#1e293b"), borderRadius: "8px", padding: "11px", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#1a2234"}
                    onMouseLeave={e => e.currentTarget.style.background = "#0f172a"}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "7px" }}>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        <Chip color={PC[c.party]}>{c.party}</Chip>
                        {c.level === "state" && <Chip color="#7c3aed">STATE</Chip>}
                        {c.incumbent && <Chip color="#22c55e">INC</Chip>}
                        {summ && <Chip color="#22c55e">✓</Chip>}
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#f1f5f9", lineHeight: 1.3, marginBottom: "2px" }}>{c.ballot}</div>
                    <div style={{ fontSize: "10px", color: "#334155" }}>{c.city}</div>
                    {summ && (
                      <div style={{ marginTop: "8px", paddingTop: "7px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between" }}>
                        <div><div style={{ fontSize: "9px", color: "#334155" }}>RAISED</div><div style={{ fontSize: "12px", fontWeight: "700", color: "#22c55e" }}>${summ.totalRaised.toLocaleString()}</div></div>
                        <div style={{ textAlign: "right" }}><div style={{ fontSize: "9px", color: "#334155" }}>TOP SECTOR</div><div style={{ fontSize: "10px", color: "#94a3b8" }}>{summ.topIndustry}</div></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("landing"); // landing | races | browse | detail | pac | state-import | county-import
  const [addressResult, setAddressResult] = useState(null);
  const [selCandidate, setSelCandidate] = useState(null);
  const [selPAC, setSelPAC] = useState(null);
  const [prevView, setPrevView] = useState("landing");
  const [stateData, setStateData] = useState(null);
  const [countyData, setCountyData] = useState(null);

  // Check URL for admin flag
  const isAdmin = typeof window !== "undefined" && (window.location.search.includes("admin=1") || window.location.hash.includes("admin"));

  useEffect(() => {
    const sd = store.get("stateDataset");
    if (sd) setStateData(sd);
    const cd = store.get("countyDataset");
    if (cd) setCountyData(cd);
  }, []);

  const saveState  = useCallback(d => { store.set("stateDataset",  d); setStateData(d);  }, []);
  const saveCounty = useCallback(d => { store.set("countyDataset", d); setCountyData(d); }, []);

  const allStateContribs  = stateData?.contributions  || [];
  const allCountyContribs = countyData?.contributions || [];
  const allContribs = [...allStateContribs, ...allCountyContribs];

  const getContribs = useCallback((candidateName, level) => {
    const pool = level === "state" ? allStateContribs : allCountyContribs;
    return pool.filter(r => !r.recipientIsPAC && matchesCandidate(r.recipientName, candidateName));
  }, [allStateContribs, allCountyContribs]);

  const openPAC = (name) => { setSelPAC(name); setPrevView(view); setView("pac"); };
  const openCandidate = (c) => { setSelCandidate(c); setPrevView(view); setView("detail"); };

  if (view === "pac") return <PACProfile pacName={selPAC} allContribs={allContribs} onBack={() => setView(prevView)} />;
  if (view === "detail" && selCandidate) return <Detail c={selCandidate} onBack={() => setView(prevView)} fileContribs={getContribs(selCandidate.name, selCandidate.level)} allContribs={allContribs} onViewPAC={openPAC} />;
  if (view === "races" && addressResult) return <YourRaces result={addressResult} allContribs={allContribs} getContribs={getContribs} onSelectCandidate={openCandidate} onBrowseAll={() => setView("browse")} onBack={() => setView("landing")} />;
  if (view === "browse") return <BrowseAll allContribs={allContribs} getContribs={getContribs} onSelectCandidate={openCandidate} onBack={() => setView("landing")} />;
  if (view === "state-import")  return <DataImport level="state"  data={stateData}  onSave={saveState}  onBack={() => setView("landing")} allContribs={allContribs} />;
  if (view === "county-import") return <DataImport level="county" data={countyData} onSave={saveCounty} onBack={() => setView("landing")} allContribs={allContribs} />;

  return (
    <>
      <Landing
        onBrowseAll={() => setView("browse")}
        onAddressResult={(result) => { setAddressResult(result); setView("races"); }}
      />
      {/* Admin links — only shown when ?admin=1 is in URL */}
      {isAdmin && (
        <div style={{ position: "fixed", bottom: "16px", right: "16px", display: "flex", gap: "8px" }}>
          <button onClick={() => setView("state-import")} style={{ padding: "8px 12px", background: "#1e3a5f", border: "1px solid #2563eb44", borderRadius: "6px", color: "#93c5fd", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}>⬆ State Data</button>
          <button onClick={() => setView("county-import")} style={{ padding: "8px 12px", background: "#1a2a0a", border: "1px solid #16653444", borderRadius: "6px", color: "#86efac", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}>⬆ County Data</button>
        </div>
      )}
    </>
  );
}
