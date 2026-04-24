/**
 * excelExporter.ts
 * Generador de archivo Excel (.xlsx) de presupuesto BIM con múltiples hojas.
 * Utiliza SheetJS (xlsx) para generar el documento de forma nativa en el navegador.
 * 
 * Estructura del Excel:
 * - Hoja 1: Portada del Proyecto
 * - Hoja 2: Resumen de Cantidades de Materiales
 * - Hoja 3: Presupuesto General
 * - Hoja 4+: APU Detallado por partida
 */

import * as XLSX from 'xlsx';
import { PresupuestoGeneral, LineaPresupuesto } from './apuEngine';
import { ProjectLocation } from './ifcParser';

// ─── Helpers de Formato ────────────────────────────────────────────────────────

const COP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

const PCT = (v: number) => `${(v * 100).toFixed(0)}%`;

function addRow(ws: XLSX.WorkSheet, rowData: (string | number)[], startCol = 0) {
  const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const newRow = ref.e.r + 1;
  rowData.forEach((val, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: newRow, c: startCol + colIdx });
    ws[cellRef] = { v: val, t: typeof val === 'number' ? 'n' : 's' };
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: newRow, c: Math.max(ref.e.c, startCol + rowData.length - 1) } });
  return newRow;
}

function createSheet(headers: string[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let row = 0;
  for (const headerRow of headers) {
    headerRow.forEach((val, col) => {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      ws[cellRef] = { v: val, t: 's' };
    });
    row++;
  }
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: row - 1, c: Math.max(...headers.map(h => h.length - 1)) },
  });
  return ws;
}

// ─── Hoja 1: Portada ──────────────────────────────────────────────────────────

function buildPortadaSheet(
  projectName: string,
  location: ProjectLocation,
  presupuesto: PresupuestoGeneral,
  generatedAt: string
): XLSX.WorkSheet {
  const data: (string | number)[][] = [
    ['ANÁLISIS Y PRESUPUESTO DE CONSTRUCCIÓN'],
    ['Herramienta: CoreBIM Analytics | Estándar: IFC 4.3 buildingSMART'],
    [''],
    ['INFORMACIÓN DEL PROYECTO'],
    ['Nombre del Proyecto', projectName],
    ['Descripción', location.description || 'Proyecto de construcción'],
    ['Ubicación (IfcSite)', location.name],
    ['Dirección', location.address || 'No especificada en IFC'],
    ['Latitud', location.latitude !== null ? location.latitude : 'No especificada en IFC'],
    ['Longitud', location.longitude !== null ? location.longitude : 'No especificada en IFC'],
    ['Elevación (msnm)', location.elevation !== null ? location.elevation : 'No especificada en IFC'],
    ['Fecha Generación', generatedAt],
    [''],
    ['RESUMEN FINANCIERO'],
    ['Concepto', 'Valor (COP)'],
    ['Costo Directo - Materiales', presupuesto.subtotalMateriales],
    ['Costo Directo - Mano de Obra', presupuesto.subtotalManoDeObra],
    ['Costo Directo - Equipos', presupuesto.subtotalEquipos],
    ['Costo Directo - Transporte', presupuesto.subtotalTransporte],
    ['COSTO DIRECTO TOTAL', presupuesto.costoDirectoTotal],
    [`AIU (${PCT(presupuesto.aiu.porcentaje)})`, presupuesto.aiu.valor],
    ['VALOR TOTAL DEL PRESUPUESTO', presupuesto.totalGeneral],
    [''],
    ['Notas'],
    ['* Cantidades extraídas directamente del modelo IFC (IfcElementQuantity)'],
    ['* Precios unitarios basados en SICE Colombia 2024'],
    ['* AIU: Administración 12% + Imprevistos 6% + Utilidad 10% = 28%'],
    ['* Los APU detallados se encuentran en las hojas siguientes'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 40 }, { wch: 30 }, { wch: 20 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
    { s: { r: 13, c: 0 }, e: { r: 13, c: 2 } },
  ];
  return ws;
}

// ─── Hoja 2: Cantidades de Materiales ─────────────────────────────────────────

function buildCantidadesSheet(presupuesto: PresupuestoGeneral): XLSX.WorkSheet {
  const header = [
    ['RESUMEN DE CANTIDADES POR MATERIAL - EXTRAÍDAS DEL MODELO IFC'],
    ['Material (IFC)', 'Tipo de Elemento', 'Volumen (m³)', 'Área (m²)', 'Longitud (m)', 'Unidad APU', 'Cantidad APU'],
  ];
  const data: (string | number)[][] = presupuesto.items.map(item => [
    item.materialRef,
    item.descripcion.split(':')[0]?.trim() || '',
    '',  // Se llena desde el parser
    '',
    '',
    item.unidad,
    item.cantidad,
  ]);

  const allData = [...header, ...data];
  const ws = XLSX.utils.aoa_to_sheet(allData);
  ws['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
  return ws;
}

// ─── Hoja 3: Presupuesto General ──────────────────────────────────────────────

function buildPresupuestoSheet(presupuesto: PresupuestoGeneral): XLSX.WorkSheet {
  const header = [
    ['PRESUPUESTO GENERAL DE OBRA'],
    ['Ítem', 'Descripción', 'Unidad', 'Cantidad', 'Precio Unitario (COP)', 'Precio Total (COP)', 'Ref. APU'],
  ];

  const rows: (string | number)[][] = presupuesto.items.map(item => [
    item.item,
    item.descripcion,
    item.unidad,
    item.cantidad,
    item.precioUnitario,
    item.precioTotal,
    item.apu.codigo,
  ]);

  const footer: (string | number)[][] = [
    ['', ''],
    ['', 'COSTO DIRECTO TOTAL', '', '', '', presupuesto.costoDirectoTotal, ''],
    ['', `DESGLOSE CD - Materiales`, '', '', '', presupuesto.subtotalMateriales, ''],
    ['', `DESGLOSE CD - Mano de Obra`, '', '', '', presupuesto.subtotalManoDeObra, ''],
    ['', `DESGLOSE CD - Equipos`, '', '', '', presupuesto.subtotalEquipos, ''],
    ['', `DESGLOSE CD - Transporte`, '', '', '', presupuesto.subtotalTransporte, ''],
    ['', `AIU (${PCT(presupuesto.aiu.porcentaje)})`, '', '', '', presupuesto.aiu.valor, ''],
    ['', 'VALOR TOTAL DEL PRESUPUESTO', '', '', '', presupuesto.totalGeneral, ''],
  ];

  const allData = [...header, ...rows, ...footer];
  const ws = XLSX.utils.aoa_to_sheet(allData);
  ws['!cols'] = [
    { wch: 6 }, { wch: 50 }, { wch: 8 },
    { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 12 }
  ];
  return ws;
}

// ─── Hoja 4+: APU Detallado por Partida ────────────────────────────────────────

function buildAPUSheet(item: LineaPresupuesto): XLSX.WorkSheet {
  const apu = item.apu;
  const data: (string | number)[][] = [
    [`ANÁLISIS DE PRECIO UNITARIO - ${apu.codigo}`],
    [''],
    ['Descripción:', apu.descripcion],
    ['Unidad:', apu.unidad],
    [''],
    ['A. MATERIALES'],
    ['Descripción del Insumo', 'Unidad', 'Rendimiento', 'Precio Unit. (COP)', 'Subtotal (COP)'],
    ...apu.materiales.map(m => [m.descripcion, m.unidad, m.rendimiento, m.precioUnitario, m.subtotal]),
    ['', '', '', 'TOTAL MATERIALES', apu.totalMateriales],
    [''],
    ['B. MANO DE OBRA'],
    ['Descripción del Insumo', 'Unidad', 'Rendimiento', 'Precio Unit. (COP)', 'Subtotal (COP)'],
    ...apu.manoDeObra.map(m => [m.descripcion, m.unidad, m.rendimiento, m.precioUnitario, m.subtotal]),
    ['', '', '', 'TOTAL MANO DE OBRA', apu.totalManoDeObra],
    [''],
    ['C. EQUIPOS Y HERRAMIENTA'],
    ['Descripción del Insumo', 'Unidad', 'Rendimiento', 'Precio Unit. (COP)', 'Subtotal (COP)'],
    ...apu.equipos.map(m => [m.descripcion, m.unidad, m.rendimiento, m.precioUnitario, m.subtotal]),
    ['', '', '', 'TOTAL EQUIPOS', apu.totalEquipos],
    [''],
    ['D. TRANSPORTE'],
    ['Descripción del Insumo', 'Unidad', 'Rendimiento', 'Precio Unit. (COP)', 'Subtotal (COP)'],
    ...apu.transporte.map(m => [m.descripcion, m.unidad, m.rendimiento, m.precioUnitario, m.subtotal]),
    ['', '', '', 'TOTAL TRANSPORTE', apu.totalTransporte],
    [''],
    ['PRECIO UNITARIO DIRECTO (A+B+C+D)', '', '', '', apu.precioUnitarioTotal],
    [`AIU (${PCT(apu.aiuPorcentaje)})`, '', '', '', apu.precioUnitarioTotal * apu.aiuPorcentaje],
    ['PRECIO UNITARIO TOTAL (con AIU)', '', '', '', apu.precioUnitarioConAIU],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 42 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 20 }
  ];
  return ws;
}

// ─── Exportador Principal ──────────────────────────────────────────────────────

export function exportToExcel(
  projectName: string,
  location: ProjectLocation,
  presupuesto: PresupuestoGeneral
): void {
  const wb = XLSX.utils.book_new();
  const now = new Date().toLocaleString('es-CO');

  // Hoja 1: Portada
  const portada = buildPortadaSheet(projectName, location, presupuesto, now);
  XLSX.utils.book_append_sheet(wb, portada, 'Portada');

  // Hoja 2: Cantidades
  const cantidades = buildCantidadesSheet(presupuesto);
  XLSX.utils.book_append_sheet(wb, cantidades, 'Cantidades IFC');

  // Hoja 3: Presupuesto General
  const presupuestoSheet = buildPresupuestoSheet(presupuesto);
  XLSX.utils.book_append_sheet(wb, presupuestoSheet, 'Presupuesto General');

  // Hojas 4+: APU por partida (max 10 para no sobrecargar)
  const maxAPU = Math.min(presupuesto.items.length, 10);
  for (let i = 0; i < maxAPU; i++) {
    const item = presupuesto.items[i];
    const apuSheet = buildAPUSheet(item);
    const sheetName = `APU-${String(i + 1).padStart(2, '0')}`;
    XLSX.utils.book_append_sheet(wb, apuSheet, sheetName);
  }

  // Descargar
  const safeName = projectName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const fileName = `CoreBIM_Presupuesto_${safeName}_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
