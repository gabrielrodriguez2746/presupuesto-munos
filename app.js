// Presupuesto Muñoz — dashboard de lectura sobre Google Sheets publicado como CSV.
// Ver PLAN.md para el contexto completo. Patrimonio queda fuera (ver Ajuste 2).

// Las URLs de los CSV publicados no viven en el código (serían públicas en
// el repo). Se pasan en el fragmento de la URL: #p=<presupuesto>&s=<supuestos>&c=<colchon>
// El fragmento nunca se envía al servidor, así que no queda en ningún log.
function getCsvUrlsFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const presupuesto = params.get("p");
  const supuestos = params.get("s");
  const colchon = params.get("c");
  if (!presupuesto || !supuestos || !colchon) return null;
  return { presupuesto, supuestos, colchon };
}

// --- Fase 1: parsing ---------------------------------------------------

// "€4,100" / "-€423" / "27.0" / "70%" -> number. Comma is thousands separator
// in this Sheet's locale (US-style), not decimal.
function parseEUR(str) {
  if (str === undefined || str === null) return null;
  const s = String(str).trim();
  if (s === "") return null;
  const cleaned = s.replace(/[€$\s]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function findRow(rows, label) {
  return rows.find((r) => (r[0] || "").trim() === label);
}

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.status}`);
  const text = await res.text();
  return Papa.parse(text, { skipEmptyLines: false }).data;
}

// Tables aren't at fixed row numbers (titles/notes above them), so every
// value is located by its row label in column A, not by row index.
function parsePresupuesto(rows) {
  const ingresoTotal = parseEUR(findRow(rows, "Total ingresos")[1]);
  const totalGastos = parseEUR(findRow(rows, "TOTAL GASTOS")[2]);

  const bucketLabels = ["Gastos fijo", "Gastos placer", "Ahorro"];
  const buckets = bucketLabels.map((label) => {
    const r = findRow(rows, label);
    return {
      bucket: label,
      objetivo: r[2],
      real: r[3],
      pctReal: r[4],
      estado: r[5],
    };
  });

  const diferencial = parseEUR(findRow(rows, "Diferencial (ingresos − gastos)")[3]);
  const retiroColchon = parseEUR(findRow(rows, "Retiro del colchón (PNC)")[3]);

  return { ingresoTotal, totalGastos, buckets, diferencial, retiroColchon };
}

function parseSupuestos(rows) {
  const escenarioActivo = findRow(rows, "Escenario activo →")[1].trim();
  const ingresoRow = findRow(rows, "Ingreso total");
  const gastoRow = findRow(rows, "Gasto comprometido");
  const deficitRow = findRow(rows, "Superávit / Déficit");
  const mesesRow = findRow(rows, "Meses que aguanta el colchón");

  const escenarios = {
    "Medio tiempo": {
      ingreso: parseEUR(ingresoRow[1]),
      gasto: parseEUR(gastoRow[1]),
      deficit: parseEUR(deficitRow[1]),
      mesesColchon: parseEUR(mesesRow[1]),
    },
    "Tiempo completo": {
      ingreso: parseEUR(ingresoRow[2]),
      gasto: parseEUR(gastoRow[2]),
      deficit: parseEUR(deficitRow[2]),
      mesesColchon: parseEUR(mesesRow[2]),
    },
  };

  return { escenarioActivo, escenarios };
}

function parseColchon(rows) {
  return {
    deficitMensual: parseEUR(findRow(rows, "Déficit mensual a cubrir")[1]),
    fondo: parseEUR(findRow(rows, "Saldo actual del fondo")[1]),
    runwayMax: parseEUR(findRow(rows, "Runway máximo (meses que aguanta)")[1]),
    fondoCubre: findRow(rows, "¿El fondo cubre la fase?")[1].trim(),
  };
}

// --- Fase 3: proyección (función pura) ----------------------------------

// Devuelve el saldo del fondo al final de cada mes.
// months: array de { ingreso, gasto }; fund: saldo inicial del fondo.
function project(months, fund) {
  const balances = [];
  let saldo = fund;
  for (const m of months) {
    const resultado = m.ingreso - m.gasto; // negativo = déficit
    const retiro = Math.max(0, -resultado); // solo se retira si falta
    saldo = saldo - retiro; // el fondo solo baja
    balances.push(saldo);
  }
  return balances;
}

// Primer mes con saldo < 0 (1-indexed), o null si aguanta todos los meses dados.
function runway(balances) {
  const i = balances.findIndex((b) => b < 0);
  return i === -1 ? null : i + 1;
}

function runSelfTests() {
  // Regresión de PLAN.md: mes 1 tiempo completo, resto media jornada, fondo PNC 11440.
  const meses = [{ ingreso: 5540, gasto: 5963 }].concat(
    Array(17).fill({ ingreso: 3820, gasto: 5963 })
  );
  const b = project(meses, 11440);
  const checks = [
    ["b[0] === 11017", Math.round(b[0]) === 11017],
    ["b[1] === 8874", Math.round(b[1]) === 8874],
    ["runway(b) === 7", runway(b) === 7],
  ];
  const allOk = checks.every(([, ok]) => ok);
  for (const [label, ok] of checks) {
    console.log(`${ok ? "✅" : "❌"} ${label}`);
  }
  return allOk;
}

// --- Fase 2/3: render ----------------------------------------------------

function estadoClass(estado) {
  const e = (estado || "").trim().toLowerCase();
  if (e === "alerta") return "estado-rojo";
  if (e === "vigilar") return "estado-ambar";
  if (e === "justo") return "estado-verde";
  return "estado-neutro";
}

function renderResumen(presupuesto) {
  const tbody = document.getElementById("resumen-buckets");
  tbody.innerHTML = "";
  for (const b of presupuesto.buckets) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.bucket}</td>
      <td>${b.objetivo}</td>
      <td>${b.real}</td>
      <td>${b.pctReal}</td>
      <td class="${estadoClass(b.estado)}">${b.estado}</td>
    `;
    tbody.appendChild(tr);
  }

  const totales = document.getElementById("resumen-totales");
  const signo = presupuesto.diferencial >= 0 ? "+" : "";
  totales.textContent =
    `Ingresos: €${presupuesto.ingresoTotal.toLocaleString("es-ES")} · ` +
    `Gastos: €${presupuesto.totalGastos.toLocaleString("es-ES")} · ` +
    `Diferencial: ${signo}€${presupuesto.diferencial.toLocaleString("es-ES")}`;
}

function renderColchon(colchon, supuestos) {
  const dl = document.getElementById("colchon-datos");
  const activo = supuestos.escenarios[supuestos.escenarioActivo];
  dl.innerHTML = `
    <dt>Escenario activo</dt><dd>${supuestos.escenarioActivo}</dd>
    <dt>Déficit mensual</dt><dd>€${colchon.deficitMensual.toLocaleString("es-ES")}</dd>
    <dt>Saldo del fondo</dt><dd>€${colchon.fondo.toLocaleString("es-ES")}</dd>
    <dt>Runway (Sheet)</dt><dd>${colchon.runwayMax} meses</dd>
    <dt>¿Cubre la fase?</dt><dd>${colchon.fondoCubre}</dd>
  `;
  return activo;
}

const HORIZONTE_MESES = 36;
let proyeccionChart = null;

// months: array 1-indexed en la práctica (mesSwitch es el primer mes en
// media jornada). Antes de mesSwitch usa el escenario activo tal cual.
function buildMonths(activo, mesSwitch, ingresoMedioJornada) {
  const meses = [];
  for (let mes = 1; mes <= HORIZONTE_MESES; mes++) {
    const ingreso = mes < mesSwitch ? activo.ingreso : ingresoMedioJornada;
    meses.push({ ingreso, gasto: activo.gasto });
  }
  return meses;
}

function renderProyeccion(activo, fondo, mesSwitch, ingresoMedioJornada) {
  const meses = buildMonths(activo, mesSwitch, ingresoMedioJornada);
  const balances = project(meses, fondo);
  const runwayMes = runway(balances);

  const nota = document.getElementById("proyeccion-nota");
  nota.textContent = runwayMes
    ? `El fondo se agota en el mes ${runwayMes}.`
    : `El fondo aguanta los ${HORIZONTE_MESES} meses proyectados.`;

  const ctx = document.getElementById("proyeccion-chart");
  if (!proyeccionChart) {
    proyeccionChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: balances.map((_, i) => `Mes ${i + 1}`),
        datasets: [
          {
            label: "Saldo del fondo (€)",
            data: balances,
            borderColor: "#1b7f3a",
            tension: 0.15,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        scales: { y: { ticks: { callback: (v) => `€${v}` } } },
        plugins: { legend: { display: false } },
      },
    });
  } else {
    proyeccionChart.data.datasets[0].data = balances;
    proyeccionChart.update();
  }
}

function wireControles(activo, fondo, ingresoMedioJornadaDefault) {
  const slider = document.getElementById("slider-mes");
  const mesLabel = document.getElementById("mes-label");
  const inputIngreso = document.getElementById("input-ingreso-mj");

  slider.value = HORIZONTE_MESES; // por defecto, no cambia de escenario
  inputIngreso.value = ingresoMedioJornadaDefault;
  mesLabel.textContent = slider.value;

  const onChange = () => {
    mesLabel.textContent = slider.value;
    renderProyeccion(
      activo,
      fondo,
      Number(slider.value),
      Number(inputIngreso.value)
    );
  };

  slider.addEventListener("input", onChange);
  inputIngreso.addEventListener("input", onChange);

  onChange();
}

// --- orquestación ----------------------------------------------------------

async function main() {
  runSelfTests();

  const estadoCarga = document.getElementById("estado-carga");

  const urls = getCsvUrlsFromHash();
  if (!urls) {
    estadoCarga.textContent =
      "Falta la configuración de datos en el enlace. Usa el enlace guardado " +
      "con los parámetros #p=...&s=...&c=... (ver README.md).";
    return;
  }

  try {
    const [presupuestoRows, supuestosRows, colchonRows] = await Promise.all([
      fetchCSV(urls.presupuesto),
      fetchCSV(urls.supuestos),
      fetchCSV(urls.colchon),
    ]);

    const presupuesto = parsePresupuesto(presupuestoRows);
    const supuestos = parseSupuestos(supuestosRows);
    const colchon = parseColchon(colchonRows);

    renderResumen(presupuesto);
    const activo = renderColchon(colchon, supuestos);
    const ingresoMedioJornadaDefault = supuestos.escenarios["Medio tiempo"].ingreso;
    wireControles(activo, colchon.fondo, ingresoMedioJornadaDefault);

    estadoCarga.textContent = `Actualizado: ${new Date().toLocaleString("es-ES")}`;
  } catch (err) {
    console.error(err);
    estadoCarga.textContent = "Error al cargar los datos. Revisa la consola.";
  }
}

// Si el usuario pega el enlace guardado estando ya en la página (misma
// URL base, distinto fragmento), el navegador no recarga solo por el hash.
window.addEventListener("hashchange", () => location.reload());

main();
