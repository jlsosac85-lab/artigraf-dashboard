// lib/kpis.js
// Parser + calculo de KPIs para el Sheet "Avance de obra" (Artigraf Planta Torreon)
// Sin dependencias externas. Reutilizado por /api/data y por el test local.

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  row.push(field); rows.push(row);
  return rows.map(r => r.map(c => c.trim()));
}

function toPct(s) {
  if (s == null) return null;
  const t = String(s).replace("%", "").replace(/,/g, "").trim();
  if (t === "" || t === "-" || t === "$ -") return null;
  const n = parseFloat(t); return isNaN(n) ? null : n;
}
function toNum(s) {
  if (s == null) return null;
  const t = String(s).replace(/,/g, "").trim();
  if (t === "" || t === "-") return null;
  const n = parseFloat(t); return isNaN(n) ? null : n;
}
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
function isDate(s) {
  if (!s) return false;
  const m = String(s).trim().match(DATE_RE);
  if (!m) return false;
  if (m[3] === "1899") return false;
  return true;
}
function parseDate(s) {
  const m = String(s).trim().match(DATE_RE);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(d) {
  if (!d) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

const MILESTONE_ORDER = [
  "Kick off", "Soporteria", "Soportería", "Paneles FV, Inversores",
  "Trayectorias en Corriente Directa", "Trayectorias en Corriente Alterna",
  "Interconexion", "Interconexión", "Etiquetado",
];
const MILESTONE_CANON = [
  "Kick off", "Soportería", "Paneles FV, Inversores",
  "Trayectorias en Corriente Directa", "Trayectorias en Corriente Alterna",
  "Interconexión", "Etiquetado",
];
function shortName(name) {
  const map = {
    "Kick off": "Kick off",
    "Soportería": "Soportería", "Soporteria": "Soportería",
    "Paneles FV, Inversores": "Paneles FV",
    "Trayectorias en Corriente Directa": "Trayectorias CD",
    "Trayectorias en Corriente Alterna": "Trayectorias CA",
    "Interconexión": "Interconexión", "Interconexion": "Interconexión",
    "Etiquetado": "Etiquetado",
  };
  return map[name] || name;
}
function normStatus(s) {
  const t = (s || "").toLowerCase();
  if (t.includes("cancel")) return "Cancelado";
  if (t.includes("complet") || t.includes("termin") || t.includes("hecho") || t === "ok") return "Completado";
  if (t.includes("proceso") || t.includes("curso")) return "En proceso";
  if (t.includes("pend")) return "Pendiente";
  return s ? s : "Pendiente";
}
function isMilestone(c) { return MILESTONE_CANON.includes(c) || MILESTONE_ORDER.includes(c); }

function extractKPIs(grid) {
  const rowWithFirst = (label) => {
    for (let r = 0; r < grid.length; r++) {
      const idx = grid[r].findIndex(c => c === label);
      if (idx !== -1) return { r, idx };
    }
    return null;
  };

  const meta = {};
  const metaLabels = {
    "Cliente": "cliente", "Proyecto": "proyecto", "Estado,Ciudad": "ubicacion",
    "Project Manager": "pm", "Fecha de Arranque": "fechaArranque",
  };
  for (const [label, key] of Object.entries(metaLabels)) {
    const hit = rowWithFirst(label);
    if (hit) { const after = grid[hit.r].slice(hit.idx + 1).find(c => c && c !== ""); meta[key] = after || null; }
  }

  const tracks = {};
  const estHeader = grid.findIndex(r => r.includes("Estatus") && r.includes("Días de avance"));
  if (estHeader !== -1) {
    for (let r = estHeader + 1; r < Math.min(estHeader + 8, grid.length); r++) {
      const row = grid[r];
      if (row.includes("Total") && !row.some(c => c === "Construcción" || c === "Tramites CFE")) break;
      const labelIdx = row.findIndex(c => c === "Construcción" || c === "Tramites CFE");
      if (labelIdx === -1) continue;
      if (tracks[row[labelIdx]]) continue;
      const vals = row.slice(labelIdx + 1).filter(c => c !== "");
      tracks[row[labelIdx]] = {
        avance: toPct(vals[0]), diasAvance: toNum(vals[3]),
        diasCronograma: toNum(vals[4]), diasFaltantes: toNum(vals[5]),
      };
      if (tracks["Construcción"] && tracks["Tramites CFE"]) break;
    }
  }

  const milestones = [];
  const actHeader = grid.findIndex(r => r.includes("Actividades") && r.includes("Avance") && r.includes("Por avanzar"));
  if (actHeader !== -1) {
    const headIdx = grid[actHeader].findIndex(c => c === "Actividades");
    for (let r = actHeader + 1; r < grid.length; r++) {
      const row = grid[r];
      let name = row[headIdx];
      if (!name || name === "") name = row.find(c => isMilestone(c) || c === "Construcción" || c === "Tramites CFE");
      if (!name) { if (milestones.find(m => m.name === "Tramites CFE")) break; continue; }
      const vals = row.slice(row.indexOf(name) + 1).filter(c => c !== "");
      milestones.push({ name, dias: toNum(vals[0]), avance: toPct(vals[2]), peso: toPct(vals[4]) });
      if (name === "Tramites CFE") break;
    }
  }

  const construccionRow = milestones.find(m => m.name === "Construcción");
  const cfeRow = milestones.find(m => m.name === "Tramites CFE");
  const hitos = milestones.filter(m => isMilestone(m.name));

  const activities = [];
  const subhitoDates = {};
  let currentSub = null;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const tipoIdx = row.findIndex(c => c === "Hito" || c === "Subhito" || c === "Actividad");
    if (tipoIdx === -1) continue;
    const tipo = row[tipoIdx];
    const name = (row[tipoIdx - 1] || "").trim();
    const dates = row.filter(c => isDate(c)).map(parseDate).filter(Boolean).sort((a, b) => a - b);
    if (tipo === "Subhito") {
      currentSub = name;
      if (dates.length) subhitoDates[name] = { inicio: dates[0], fin: dates[dates.length - 1] };
    } else if (tipo === "Actividad") {
      const status = normStatus(row[tipoIdx + 1]);
      let avance = null;
      for (let k = tipoIdx + 2; k < row.length; k++) {
        if (/^\d+(\.\d+)?%$/.test(row[k])) { avance = toPct(row[k]); break; }
      }
      activities.push({
        hito: currentSub, nombre: name, estatus: status,
        avance: avance == null ? 0 : avance,
        inicio: dates[0] ? fmtDate(dates[0]) : null,
        fin: dates[1] ? fmtDate(dates[1]) : (dates[0] ? fmtDate(dates[0]) : null),
        _inicio: dates[0] || null,
      });
    }
  }

  const statusCounts = {};
  for (const a of activities) statusCounts[a.estatus] = (statusCounts[a.estatus] || 0) + 1;
  const totalActividades = activities.length;
  const completadas = statusCounts["Completado"] || 0;

  const proximas = activities
    .filter(a => a.estatus !== "Completado" && a.estatus !== "Cancelado")
    .filter(a => a._inicio)
    .sort((a, b) => a._inicio - b._inicio)
    .slice(0, 8)
    .map(({ _inicio, ...rest }) => rest);

  const avanceConstruccion = construccionRow && construccionRow.avance != null
    ? construccionRow.avance : ((tracks["Construcción"] ? tracks["Construcción"].avance : 0) || 0);
  const avanceCFE = cfeRow && cfeRow.avance != null
    ? cfeRow.avance : ((tracks["Tramites CFE"] ? tracks["Tramites CFE"].avance : 0) || 0);

  const diasConstr = (tracks["Construcción"] && tracks["Construcción"].diasCronograma) || (construccionRow && construccionRow.dias) || 74;
  const diasCFE = (tracks["Tramites CFE"] && tracks["Tramites CFE"].diasCronograma) || (cfeRow && cfeRow.dias) || 44;
  const diasTotal = diasConstr + diasCFE;
  const avanceGeneral = +((avanceConstruccion * diasConstr + avanceCFE * diasCFE) / diasTotal).toFixed(1);

  const ranges = MILESTONE_CANON
    .map(n => ({ name: n, peso: (hitos.find(h => h.name === n) || {}).peso || 0, ...(subhitoDates[n] || {}) }))
    .filter(r => r.inicio && r.fin);
  let curva = [];
  let fechaInicioObra = null, fechaFinConstr = null;
  if (ranges.length) {
    fechaInicioObra = new Date(Math.min(...ranges.map(r => r.inicio.getTime())));
    fechaFinConstr = new Date(Math.max(...ranges.map(r => r.fin.getTime())));
    const totalPeso = ranges.reduce((s, r) => s + (r.peso || 0), 0) || 100;
    const weeks = Math.ceil(daysBetween(fechaInicioObra, fechaFinConstr) / 7) + 1;
    for (let w = 0; w <= weeks; w++) {
      const d = new Date(fechaInicioObra.getTime() + w * 7 * 86400000);
      let prog = 0;
      for (const r of ranges) {
        const span = Math.max(1, daysBetween(r.inicio, r.fin));
        const frac = Math.min(1, Math.max(0, daysBetween(r.inicio, d) / span));
        prog += (r.peso || 0) * frac;
      }
      curva.push({ fecha: fmtDate(d), programado: +(100 * prog / totalPeso).toFixed(1) });
    }
  }

  const hoy = new Date();
  let programadoHoy = 0;
  if (fechaInicioObra && fechaFinConstr) {
    const totalPeso = ranges.reduce((s, r) => s + (r.peso || 0), 0) || 100;
    for (const r of ranges) {
      const span = Math.max(1, daysBetween(r.inicio, r.fin));
      const frac = Math.min(1, Math.max(0, daysBetween(r.inicio, hoy) / span));
      programadoHoy += (r.peso || 0) * frac;
    }
    programadoHoy = +(100 * programadoHoy / totalPeso).toFixed(1);
  }
  const tasaDiaria = diasConstr > 0 ? 100 / diasConstr : 1.35;
  const diasDesviacion = +(((avanceConstruccion - programadoHoy) / tasaDiaria)).toFixed(1);

  return {
    generadoEn: new Date().toISOString(),
    proyecto: {
      cliente: meta.cliente || "ARTIGRAF",
      nombre: meta.proyecto || "SISTEMA FOTOVOLTAICO + BESS",
      ubicacion: meta.ubicacion || "TORREON, COAHUILA",
      pm: meta.pm || "-",
      fechaArranque: meta.fechaArranque || (fechaInicioObra ? fmtDate(fechaInicioObra) : null),
      fechaFinConstruccion: fechaFinConstr ? fmtDate(fechaFinConstr) : null,
    },
    kpis: {
      avanceGeneral, avanceConstruccion, avanceCFE, programadoHoy, diasDesviacion,
      diasTotal, diasConstruccion: diasConstr, diasCFE,
      diasFaltantesConstr: (tracks["Construcción"] && tracks["Construcción"].diasFaltantes) != null ? tracks["Construcción"].diasFaltantes : null,
      diasFaltantesCFE: (tracks["Tramites CFE"] && tracks["Tramites CFE"].diasFaltantes) != null ? tracks["Tramites CFE"].diasFaltantes : null,
      totalActividades, completadas,
    },
    hitos: hitos.map(h => ({
      nombre: shortName(h.name), nombreLargo: h.name, peso: h.peso,
      avance: h.avance == null ? 0 : h.avance, dias: h.dias,
      inicio: subhitoDates[h.name] ? fmtDate(subhitoDates[h.name].inicio) : null,
      fin: subhitoDates[h.name] ? fmtDate(subhitoDates[h.name].fin) : null,
    })),
    cfe: cfeRow ? { avance: cfeRow.avance == null ? 0 : cfeRow.avance, dias: cfeRow.dias } : null,
    estatusActividades: statusCounts,
    proximasActividades: proximas,
    actividades: activities.map(({ _inicio, ...rest }) => rest),
    curvaS: curva,
  };
}

function buildKPIsFromCSV(csvText) { return extractKPIs(parseCSV(csvText)); }

module.exports = { parseCSV, extractKPIs, buildKPIsFromCSV };
