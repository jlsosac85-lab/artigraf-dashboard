// api/data.js  —  Función serverless de Vercel
// Lee el Sheet "Avance de obra" (export CSV de Google) y devuelve los KPIs en JSON.
// Variables de entorno (opcionales):
//   SHEET_ID    -> ID del Google Sheet  (default: el de Artigraf)
//   SHEET_NAME  -> Nombre de la pestaña (default: "Avance de obra")

const { buildKPIsFromCSV } = require("../lib/kpis.js");

const SHEET_ID = process.env.SHEET_ID || "1pSgJSNsoFDLkkvJg2wKLvG_Dkx1Thj5Rkpxrdcf8Rd0";
const SHEET_NAME = process.env.SHEET_NAME || "Avance de obra";

function csvUrl() {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
  const params = `tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
  return `${base}?${params}`;
}

module.exports = async (req, res) => {
  try {
    const r = await fetch(csvUrl(), { redirect: "follow" });
    const text = await r.text();

    // Si el Sheet no es accesible públicamente, Google devuelve HTML (login) en vez de CSV.
    if (!r.ok || text.trimStart().startsWith("<")) {
      res.status(502).json({
        error: "No se pudo leer el Sheet como CSV.",
        detalle:
          "Verifica que el documento esté compartido como 'Cualquier persona con el enlace: Lector' y que la pestaña se llame exactamente '" +
          SHEET_NAME + "'.",
        httpStatus: r.status,
      });
      return;
    }

    const data = buildKPIsFromCSV(text);
    // Cache de borde: respuesta fresca cada 30s, sirve cache mientras revalida.
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "Fallo al generar KPIs", detalle: String(e && e.message || e) });
  }
};
