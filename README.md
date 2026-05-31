# Dashboard de Avance de Obra — Artigraf Planta Torreón

Dashboard ejecutivo en tiempo real para el proyecto **Sistema Fotovoltaico + BESS**.
Mismo patrón que el Dashboard de Cobranza de Cleangy:

```
Google Sheets ("Avance de obra")  ->  Función Vercel /api/data  ->  Página ejecutiva
```

Cada vez que actualizas el cronograma en Google Sheets y recargas la página (o presionas
**Actualizar**), el dashboard recalcula todos los KPIs. Sin n8n, sin Notion, sin base de datos.

## Qué muestra
- Avance General (real vs. programado a hoy), Construcción y Trámites CFE
- Desviación en días (adelanto / atraso) y días faltantes
- Curva S: avance acumulado programado vs. real
- Avance por hito/etapa (Kick off, Soportería, Paneles FV, Trayectorias CD/CA, Interconexión, Etiquetado)
- Estatus de actividades (donut) y próximas actividades
- Tabla con el detalle de todas las actividades

## Estructura
```
artigraf-dashboard/
├─ api/data.js        Función serverless: lee el Sheet (CSV) y devuelve KPIs en JSON
├─ lib/kpis.js        Parser + cálculo de KPIs (sin dependencias)
├─ public/
│  ├─ index.html      La página del dashboard
│  └─ sample-data.json  Respaldo de muestra (preview local)
├─ preview.html       Vista previa autónoma — ábrela con doble clic, sin desplegar nada
├─ vercel.json · package.json · .gitignore
```

---

## PASO 1 — Compartir el Google Sheet (obligatorio)
La función lee el Sheet por su exportación CSV pública, así que:
1. Abre el Sheet → botón **Compartir** (arriba a la derecha).
2. En "Acceso general" elige **Cualquier persona con el enlace**, rol **Lector**.
3. Confirma que la pestaña se llama exactamente **Avance de obra**.

> Si prefieres mantener el Sheet privado, se puede cambiar a una cuenta de servicio de Google
> (más configuración). Dímelo y lo ajustamos.

## PASO 2 — Desplegar en Vercel

### Opción A — GitHub + Vercel (recomendada, con auto-deploy)
1. Crea un repo nuevo en GitHub (ej. `artigraf-dashboard`) y sube esta carpeta.
2. En https://vercel.com → **Add New → Project** → importa el repo.
3. Framework Preset: **Other**. Deja todo por defecto → **Deploy**.

### Opción B — Vercel CLI (rápida, sin GitHub)
```bash
npm i -g vercel
cd artigraf-dashboard
vercel          # primer deploy (preview)
vercel --prod   # publicar a producción
```

## PASO 3 — Variables de entorno (opcional)
Ya vienen por defecto en el código. Solo cámbialas si usas otro Sheet/pestaña.
En Vercel → Project → **Settings → Environment Variables**:

| Nombre       | Valor por defecto                                   |
|--------------|-----------------------------------------------------|
| `SHEET_ID`   | `1pSgJSNsoFDLkkvJg2wKLvG_Dkx1Thj5Rkpxrdcf8Rd0`      |
| `SHEET_NAME` | `Avance de obra`                                    |

## PASO 4 — Probar
- Abre `https://TU-PROYECTO.vercel.app/api/data` → debe devolver JSON con `kpis`, `hitos`, etc.
- Abre `https://TU-PROYECTO.vercel.app/` → el dashboard.
- Comparte esa URL con el cliente.

## Cómo se actualiza
Editas el cronograma en Google Sheets → el dashboard refleja los cambios al recargar
(hay una caché de ~30 s en el borde de Vercel). El botón **Actualizar** vuelve a consultar.

## Notas
- Los KPIs se calculan a partir de los bloques "Estatus", "Actividades" y la tabla de
  detalle de la pestaña "Avance de obra". Si cambias la estructura de esos bloques, avísame
  para ajustar el parser (`lib/kpis.js`).
