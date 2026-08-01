// lib/kpis.js — v2
// Parser + cálculo de KPIs para el Sheet "Avance de obra" (Artigraf Torreón).
// CORRECCIONES v2:
//   1. Fechas dd/mm/yyyy (antes se parseaban como mm/dd y se desbordaban a 2027/2028).
//   2. Hitos leídos de las filas "Subhito" de la tabla de detalle (antes dependía de una
//      lista fija de nombres que ya no coincidía con el Sheet -> peso null / avance 0).
//   3. Estatus "Concluido" normalizado a "Completado" (el front solo conoce Completado).
//   4. Fechas de cada fila leídas de las columnas del cronograma BASE (antes se mezclaban
//      fechas base y reales, y las 30/12/1899 contaminaban el orden).
//   5. Curva S calculada desde los subhitos de construcción (peso x fechas base), inmune a
//      los #DIV/0! de las tablas semanales del Sheet.

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
  if (t === "" || t === "-" || /^#/.test(t)) return null;   // #DIV/0!, #REF!, #N/A -> null
  const n = parseFloat(t); return isNaN(n) ? null : n;
}
function toNum(s) {
  if (s == null) return null;
  const t = String(s).replace(/,/g, "").trim();
  if (t === "" || t === "-" || /^#/.test(t)) return null;
  const n = parseFloat(t); return isNaN(n) ? null : n;
}
function isPctToken(s) { return /^-?\d+(\.\d+)?%$/.test(String(s || "").trim()); }
function isIntToken(s) { return /^-?\d+$/.test(String(s || "").trim()); }

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
function isDate(s) {
  if (!s) return false;
  const m = String(s).trim().match(DATE_RE);
  if (!m) return false;
  if (m[3] === "1899") return false;          // 30/12/1899 = fórmula sobre celda vacía
  return true;
}
// FIX #1: el Sheet está en formato dd/mm/yyyy
function parseDate(s) {
  if (!isDate(s)) return null;
  const m = String(s).trim().match(DATE_RE);
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));  // año, MES=2do, DÍA=1ro
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(d) {
  if (!d) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

function shortName(name) {
  const map = {
    "Kick off & Ingenierías": "Kick off",
    "Kick off": "Kick off",
    "Recepción de equipos principales": "Recepción de equipos",
    "Obra Civil BESS": "Obra Civil BESS",
    "Montaje y Canalización BESS": "Montaje BESS",
    "Soportería FV": "Soportería FV",
    "Soportería": "Soportería",
    "Paneles FV, Inversores": "Paneles FV",
    "Instalación de Corriente Directa": "Corriente Directa",
    "Trayectorias en Corriente Directa": "Trayectorias CD",
    "Trayectorias en Corriente Alterna": "Trayectorias CA",
    "Interconexión": "Interconexión",
    "Etiquetado": "Etiquetado",
    "Tramites CFE": "Tramites CFE",
  };
  return map[name] || name;
}
// FIX #3: "Concluido" -> "Completado"
function normStatus(s) {
  const t = (s || "").toLowerCase();
  if (t.includes("cancel")) return "Cancelado";
  if (t.includes("conclu") || t.includes("complet") || t.includes("termin") || t.includes("hecho") || t === "ok") return "Completado";
  if (t.includes("proceso") || t.includes("curso")) return "En proceso";
  if (t.includes("pend")) return "Pendiente";
  return s ? s : "Pendiente";
}
const norm = (s) => (s == null ? "" : String(s).trim());

function extractKPIs(grid) {
  // ---------- 1. Tabla de detalle (fuente principal, anclada en la col. "Hito/Subhito/Actividad") ----------
  const hitos = [];        // filas Subhito
  const activities = [];   // filas Actividad
  let currentSub = null;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const tipoIdx = row.findIndex(c => c === "Subhito" || c === "Actividad" || c === "Hito");
    if (tipoIdx === -1) continue;
    const tipo = row[tipoIdx];
    if (tipo === "Hito") continue; // fila de encabezado

    const name   = norm(row[tipoIdx - 1]);
    if (!name) continue;
    const peso   = toPct(row[tipoIdx - 2]);          // col peso ("7%")
    const status = norm(row[tipoIdx + 1]);           // Subhito: "76%" · Actividad: "Concluido"
    const avance = toPct(row[tipoIdx + 2]);          // "% Avance"
    // FIX #4: fechas del cronograma BASE (cols +3 y +4), no la mezcla de todas las fechas
    const iniB   = parseDate(row[tipoIdx + 3]);
    const finB   = parseDate(row[tipoIdx + 4]);
    const diasB  = toNum(row[tipoIdx + 5]);

    if (tipo === "Subhito") {
      currentSub = name;
      hitos.push({
        name, peso: peso == null ? 0 : peso,
        avance: avance == null ? 0 : avance,
        dias: diasB, inicio: iniB, fin: finB,
      });
    } else { // Actividad
      activities.push({
        hito: currentSub, nombre: name,
        estatus: normStatus(status),
        avance: avance == null ? 0 : avance,
        inicio: iniB ? fmtDate(iniB) : null,
        fin: finB ? fmtDate(finB) : (iniB ? fmtDate(iniB) : null),
        _inicio: iniB || null,
      });
    }
  }

  const hitosConstr = hitos.filter(h => h.name !== "Tramites CFE");
  const hitoCFE     = hitos.find(h => h.name === "Tramites CFE") || null;

  // ---------- 2. Bloque resumen superior (avance oficial Construcción / CFE) ----------
  // Busca la fila con etiqueta y toma el primer token % después de ella. Tolerante a columnas movidas.
  let topConstr = null, topCFE = null, actMarker = -1;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const iAct = row.findIndex(c => norm(c) === "Actividades");
    if (iAct !== -1 && actMarker === -1) { actMarker = r; }
    if (actMarker !== -1 && r > actMarker) break;   // solo el bloque de arriba
    const iC = row.findIndex(c => norm(c) === "Construcción");
    const iF = row.findIndex(c => norm(c) === "Tramites CFE");
    const grabPct = (i) => { for (let k = i + 1; k < row.length; k++) if (isPctToken(row[k])) return toPct(row[k]); return null; };
    if (iC !== -1 && topConstr == null) topConstr = grabPct(iC);
    if (iF !== -1 && topCFE == null) topCFE = grabPct(iF);
  }

  // Fallback: promedio ponderado peso x avance de los subhitos
  const wAvg = (list) => {
    const tot = list.reduce((s, h) => s + (h.peso || 0), 0);
    if (!tot) return 0;
    return +(list.reduce((s, h) => s + (h.peso || 0) * (h.avance || 0), 0) / tot).toFixed(1);
  };
  const avanceConstruccion = topConstr != null ? topConstr : wAvg(hitosConstr);
  const avanceCFE          = topCFE != null ? topCFE : (hitoCFE ? hitoCFE.avance : 0);

  // ---------- 3. Días de cronograma / faltantes ----------
  // Días oficiales: bloque "Actividades" (fila Construcción / Tramites CFE con el entero junto a la etiqueta)
  let diasConstrTop = null, diasCFETop = null;
  if (actMarker !== -1) {
    for (let r = actMarker + 1; r < grid.length; r++) {
      const row = grid[r];
      if (row.some(c => c === "Subhito" || c === "Hito")) break;  // llegó a la tabla de detalle
      const grabInt = (i) => { for (let k = i + 1; k < row.length; k++) if (isIntToken(row[k])) return toNum(row[k]); return null; };
      const iC = row.findIndex(c => norm(c) === "Construcción");
      const iF = row.findIndex(c => norm(c) === "Tramites CFE");
      if (iC !== -1 && diasConstrTop == null) diasConstrTop = grabInt(iC);
      if (iF !== -1 && diasCFETop == null) diasCFETop = grabInt(iF);
    }
  }
  const diasConstr = diasConstrTop || hitosConstr.reduce((s, h) => s + (h.dias || 0), 0) || 224;
  const diasCFE    = diasCFETop || (hitoCFE && hitoCFE.dias) || 60;
  const diasTotal  = diasConstr + diasCFE;

  const hoy = new Date();
  const iniConstr = hitosConstr.length ? new Date(Math.min(...hitosConstr.filter(h => h.inicio).map(h => h.inicio.getTime()))) : null;
  const finConstr = hitosConstr.length ? new Date(Math.max(...hitosConstr.filter(h => h.fin).map(h => h.fin.getTime()))) : null;
  const finProyecto = (hitoCFE && hitoCFE.fin) ? hitoCFE.fin : finConstr;

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const transcurridosConstr = iniConstr ? clamp(daysBetween(iniConstr, hoy), 0, diasConstr) : 0;
  const diasFaltantesConstr = diasConstr - transcurridosConstr;
  const transcurridosCFE = (hitoCFE && hitoCFE.inicio) ? clamp(daysBetween(hitoCFE.inicio, hoy), 0, diasCFE) : 0;
  const diasFaltantesCFE = diasCFE - transcurridosCFE;

  const avanceGeneral = +((avanceConstruccion * diasConstr + avanceCFE * diasCFE) / diasTotal).toFixed(1);

  // ---------- 4. Curva S programada (FIX #5: desde subhitos, no de las tablas semanales) ----------
  const ranges = hitosConstr.filter(h => h.inicio && h.fin && (h.peso || 0) > 0);
  const totalPeso = ranges.reduce((s, r) => s + r.peso, 0) || 100;
  const progAt = (d) => {
    let p = 0;
    for (const r of ranges) {
      const span = Math.max(1, daysBetween(r.inicio, r.fin));
      p += r.peso * clamp(daysBetween(r.inicio, d) / span, 0, 1);
    }
    return +(100 * p / totalPeso).toFixed(1);
  };
  let curva = [];
  if (ranges.length && iniConstr && finConstr) {
    const weeks = Math.ceil(daysBetween(iniConstr, finConstr) / 7);
    for (let w = 0; w <= weeks + 1; w++) {
      const d = new Date(iniConstr.getTime() + w * 7 * 86400000);
      curva.push({ fecha: fmtDate(d), programado: progAt(d) });
    }
  }
  const programadoHoy = ranges.length ? progAt(hoy) : 0;
  const tasaDiaria = diasConstr > 0 ? 100 / diasConstr : 1.35;
  const diasDesviacion = +(((avanceConstruccion - programadoHoy) / tasaDiaria)).toFixed(1);

  // ---------- 5. Metadatos del proyecto (columna a la izquierda del nombre de hito del bloque superior) ----------
  const metaVals = [];
  if (actMarker !== -1) {
    for (let r = actMarker; r < Math.min(grid.length, actMarker + 14); r++) {
      const v = norm(grid[r][2]);
      if (v) metaVals.push(v);
    }
  }
  const nonDates = metaVals.filter(v => !isDate(v));
  const dates = metaVals.filter(isDate);
  const meta = {
    cliente: nonDates[0] || null, proyecto: nonDates[1] || null,
    ubicacion: nonDates[2] || null, pm: nonDates[3] || null,
    fechaArranque: dates[0] || null,
  };

  // ---------- 6. Conteos y próximas ----------
  const statusCounts = {};
  for (const a of activities) statusCounts[a.estatus] = (statusCounts[a.estatus] || 0) + 1;
  const completadas = statusCounts["Completado"] || 0;

  const proximas = activities
    .filter(a => a.estatus !== "Completado" && a.estatus !== "Cancelado")
    .filter(a => a._inicio)
    .sort((a, b) => a._inicio - b._inicio)
    .slice(0, 8)
    .map(({ _inicio, ...rest }) => rest);

  return {
    generadoEn: new Date().toISOString(),
    proyecto: {
      cliente: meta.cliente || "ARTIGRAF",
      nombre: meta.proyecto || "SISTEMA FOTOVOLTAICO + BESS",
      ubicacion: meta.ubicacion || "TORREON, COAHUILA",
      pm: meta.pm || "-",
      fechaArranque: meta.fechaArranque || (iniConstr ? fmtDate(iniConstr) : null),
      fechaFinConstruccion: finConstr ? fmtDate(finConstr) : null,
      fechaFinProyecto: finProyecto ? fmtDate(finProyecto) : null,
    },
    kpis: {
      avanceGeneral, avanceConstruccion, avanceCFE, programadoHoy, diasDesviacion,
      diasTotal, diasConstruccion: diasConstr, diasCFE,
      diasFaltantesConstr, diasFaltantesCFE,
      totalActividades: activities.length, completadas,
    },
    hitos: hitos.map(h => ({
      nombre: shortName(h.name), nombreLargo: h.name,
      peso: h.peso, avance: h.avance, dias: h.dias,
      inicio: h.inicio ? fmtDate(h.inicio) : null,
      fin: h.fin ? fmtDate(h.fin) : null,
    })),
    cfe: hitoCFE ? { avance: hitoCFE.avance, dias: hitoCFE.dias } : { avance: avanceCFE, dias: diasCFE },
    estatusActividades: statusCounts,
    proximasActividades: proximas,
    actividades: activities.map(({ _inicio, ...rest }) => rest),
    curvaS: curva,
  };
}

function buildKPIsFromCSV(csvText) { return extractKPIs(parseCSV(csvText)); }
module.exports = { parseCSV, extractKPIs, buildKPIsFromCSV };
