/**
 * apuEngine.ts
 * Motor Experto de Análisis de Precios Unitarios (APU) para Construcción.
 * 
 * Estructura de un APU según estándar colombiano SICE/IDU:
 * Precio Unitario = Materiales + Mano de Obra + Equipos + Transporte
 * 
 * Los precios base están en COP (Pesos Colombianos) - Actualización 2024.
 */

import { MaterialQuantity } from './ifcParser';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface APUInsumo {
  descripcion: string;
  unidad: string;
  rendimiento: number;    // Cantidad del insumo por unidad de la partida
  precioUnitario: number; // COP por unidad del insumo
  subtotal: number;       // rendimiento * precioUnitario
}

export interface APUDetalle {
  codigo: string;
  descripcion: string;
  unidad: string;
  materiales: APUInsumo[];
  manoDeObra: APUInsumo[];
  equipos: APUInsumo[];
  transporte: APUInsumo[];
  totalMateriales: number;
  totalManoDeObra: number;
  totalEquipos: number;
  totalTransporte: number;
  precioUnitarioTotal: number;
  aiuPorcentaje: number;  // Administración, Imprevistos y Utilidad (%)
  precioUnitarioConAIU: number;
}

export interface LineaPresupuesto {
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
  apu: APUDetalle;
  materialRef: string;    // Nombre del material IFC de origen
}

export interface PresupuestoGeneral {
  items: LineaPresupuesto[];
  subtotalMateriales: number;
  subtotalManoDeObra: number;
  subtotalEquipos: number;
  subtotalTransporte: number;
  costoDirectoTotal: number;
  aiu: {
    porcentaje: number;
    valor: number;
  };
  totalGeneral: number;
  moneda: string;
}

// ─── Base de Datos de APUs ─────────────────────────────────────────────────────

/**
 * Biblioteca de APU por categoría de material/actividad.
 * Precios en COP, año 2024. Fuente: SICE - Ministerio de Transporte Colombia.
 */
const APU_DATABASE: Record<string, () => APUDetalle> = {

  // ─ Concreto Estructural (m³) ──────────────────────────────────────────────
  'concreto': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Cemento Portland tipo I (50kg)', unidad: 'Bolsa', rendimiento: 7.0, precioUnitario: 32000, subtotal: 7.0 * 32000 },
      { descripcion: 'Arena de río lavada', unidad: 'm³', rendimiento: 0.55, precioUnitario: 85000, subtotal: 0.55 * 85000 },
      { descripcion: 'Grava o Triturado 1"', unidad: 'm³', rendimiento: 0.75, precioUnitario: 95000, subtotal: 0.75 * 95000 },
      { descripcion: 'Agua potable', unidad: 'm³', rendimiento: 0.22, precioUnitario: 5000, subtotal: 0.22 * 5000 },
      { descripcion: 'Aditivo plastificante', unidad: 'L', rendimiento: 1.5, precioUnitario: 8500, subtotal: 1.5 * 8500 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Oficial de construcción', unidad: 'Jornal', rendimiento: 0.8, precioUnitario: 95000, subtotal: 0.8 * 95000 },
      { descripcion: 'Ayudante de construcción', unidad: 'Jornal', rendimiento: 1.6, precioUnitario: 80000, subtotal: 1.6 * 80000 },
      { descripcion: 'Maestro de obra (fracción)', unidad: 'Jornal', rendimiento: 0.15, precioUnitario: 120000, subtotal: 0.15 * 120000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Mezcladora de concreto 1 saco', unidad: 'H-M', rendimiento: 0.8, precioUnitario: 35000, subtotal: 0.8 * 35000 },
      { descripcion: 'Vibrador de concreto', unidad: 'H-M', rendimiento: 0.4, precioUnitario: 18000, subtotal: 0.4 * 18000 },
      { descripcion: 'Herramienta menor (5% MO)', unidad: 'Global', rendimiento: 0.05, precioUnitario: mo.reduce((s,i) => s+i.subtotal, 0), subtotal: 0 },
    ];
    eq[2].subtotal = eq[2].rendimiento * eq[2].precioUnitario;
    const tr: APUInsumo[] = [
      { descripcion: 'Flete materiales áridos', unidad: 'm³', rendimiento: 1.3, precioUnitario: 18000, subtotal: 1.3 * 18000 },
    ];
    return buildAPU('APU-C001', 'Suministro y colocación de Concreto Estructural f\'c=210 kg/cm²', 'm³', mats, mo, eq, tr);
  },

  // ─ Acero de Refuerzo (kg) ─────────────────────────────────────────────────
  'acero': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Varilla corrugada Fy=420 MPa', unidad: 'kg', rendimiento: 1.03, precioUnitario: 4200, subtotal: 1.03 * 4200 },
      { descripcion: 'Alambre negro calibre 16', unidad: 'kg', rendimiento: 0.025, precioUnitario: 6000, subtotal: 0.025 * 6000 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Armador (fierrero)', unidad: 'Jornal', rendimiento: 0.045, precioUnitario: 100000, subtotal: 0.045 * 100000 },
      { descripcion: 'Ayudante de armado', unidad: 'Jornal', rendimiento: 0.035, precioUnitario: 80000, subtotal: 0.035 * 80000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Dobladora y cortadora de varilla', unidad: 'H-M', rendimiento: 0.005, precioUnitario: 25000, subtotal: 0.005 * 25000 },
      { descripcion: 'Herramienta menor (5% MO)', unidad: 'Global', rendimiento: 1, precioUnitario: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0), subtotal: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0) },
    ];
    const tr: APUInsumo[] = [
      { descripcion: 'Transporte de acero a obra', unidad: 'kg', rendimiento: 1.0, precioUnitario: 120, subtotal: 120 },
    ];
    return buildAPU('APU-A001', 'Suministro, corte, figurado y colocación de Acero de Refuerzo', 'kg', mats, mo, eq, tr);
  },

  // ─ Mampostería (m²) ───────────────────────────────────────────────────────
  'mamposteria': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Bloque de concreto 20x20x40 cm', unidad: 'und', rendimiento: 12.5, precioUnitario: 4200, subtotal: 12.5 * 4200 },
      { descripcion: 'Cemento Portland (50kg)', unidad: 'Bolsa', rendimiento: 0.35, precioUnitario: 32000, subtotal: 0.35 * 32000 },
      { descripcion: 'Arena de pega', unidad: 'm³', rendimiento: 0.025, precioUnitario: 85000, subtotal: 0.025 * 85000 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Oficial mampostero', unidad: 'Jornal', rendimiento: 0.25, precioUnitario: 95000, subtotal: 0.25 * 95000 },
      { descripcion: 'Ayudante', unidad: 'Jornal', rendimiento: 0.25, precioUnitario: 80000, subtotal: 0.25 * 80000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Andamios (alquiler)', unidad: 'm²-día', rendimiento: 0.15, precioUnitario: 3500, subtotal: 0.15 * 3500 },
      { descripcion: 'Herramienta menor', unidad: 'Global', rendimiento: 1, precioUnitario: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0), subtotal: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0) },
    ];
    const tr: APUInsumo[] = [
      { descripcion: 'Flete bloques y arena', unidad: 'Global', rendimiento: 1, precioUnitario: 3500, subtotal: 3500 },
    ];
    return buildAPU('APU-M001', 'Mampostería en bloque de concreto e=15 cm', 'm²', mats, mo, eq, tr);
  },

  // ─ Excavación (m³) ────────────────────────────────────────────────────────
  'excavacion': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Materiales fungibles (señalización, estacas)', unidad: 'Global', rendimiento: 1, precioUnitario: 2500, subtotal: 2500 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Oficial topógrafo (fracción)', unidad: 'Jornal', rendimiento: 0.05, precioUnitario: 120000, subtotal: 0.05 * 120000 },
      { descripcion: 'Operador de retroexcavadora', unidad: 'Jornal', rendimiento: 0.06, precioUnitario: 150000, subtotal: 0.06 * 150000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Retroexcavadora sobre orugas 1 m³', unidad: 'H-M', rendimiento: 0.04, precioUnitario: 280000, subtotal: 0.04 * 280000 },
    ];
    const tr: APUInsumo[] = [
      { descripcion: 'Volqueta 8 m³ (retiro de material)', unidad: 'Viaje', rendimiento: 0.15, precioUnitario: 120000, subtotal: 0.15 * 120000 },
    ];
    return buildAPU('APU-E001', 'Excavación mecánica en terreno normal', 'm³', mats, mo, eq, tr);
  },

  // ─ Pavimento en Concreto (m²) ─────────────────────────────────────────────
  'pavimento': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Concreto premezclado 28 MPa', unidad: 'm³', rendimiento: 0.2, precioUnitario: 620000, subtotal: 0.2 * 620000 },
      { descripcion: 'Malla electrosoldada 15-15-4-4', unidad: 'm²', rendimiento: 1.1, precioUnitario: 28000, subtotal: 1.1 * 28000 },
      { descripcion: 'Material granular sub-base', unidad: 'm³', rendimiento: 0.15, precioUnitario: 65000, subtotal: 0.15 * 65000 },
      { descripcion: 'Sello de juntas (silicona)', unidad: 'L', rendimiento: 0.3, precioUnitario: 45000, subtotal: 0.3 * 45000 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Oficial carpintero de formaleta', unidad: 'Jornal', rendimiento: 0.1, precioUnitario: 95000, subtotal: 0.1 * 95000 },
      { descripcion: 'Oficial acabados (planchado)', unidad: 'Jornal', rendimiento: 0.2, precioUnitario: 95000, subtotal: 0.2 * 95000 },
      { descripcion: 'Ayudante', unidad: 'Jornal', rendimiento: 0.3, precioUnitario: 80000, subtotal: 0.3 * 80000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Alisadora de concreto', unidad: 'H-M', rendimiento: 0.15, precioUnitario: 22000, subtotal: 0.15 * 22000 },
      { descripcion: 'Cortadora de juntas', unidad: 'H-M', rendimiento: 0.05, precioUnitario: 35000, subtotal: 0.05 * 35000 },
      { descripcion: 'Vibrador de concreto', unidad: 'H-M', rendimiento: 0.1, precioUnitario: 18000, subtotal: 0.1 * 18000 },
    ];
    const tr: APUInsumo[] = [
      { descripcion: 'Flete material granular', unidad: 'm³', rendimiento: 0.15, precioUnitario: 18000, subtotal: 0.15 * 18000 },
    ];
    return buildAPU('APU-P001', 'Pavimento rígido en concreto e=15 cm', 'm²', mats, mo, eq, tr);
  },

  // ─ Cubierta/Techo (m²) ───────────────────────────────────────────────────
  'cubierta': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Lámina de cubierta tipo zinc', unidad: 'm²', rendimiento: 1.15, precioUnitario: 35000, subtotal: 1.15 * 35000 },
      { descripcion: 'Correa metálica C3" calibre 16', unidad: 'ml', rendimiento: 4.0, precioUnitario: 22000, subtotal: 4.0 * 22000 },
      { descripcion: 'Tornillo autoperforante 2"', unidad: 'und', rendimiento: 8, precioUnitario: 350, subtotal: 8 * 350 },
      { descripcion: 'Impermeabilizante para juntas', unidad: 'L', rendimiento: 0.2, precioUnitario: 38000, subtotal: 0.2 * 38000 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Oficial techador', unidad: 'Jornal', rendimiento: 0.2, precioUnitario: 95000, subtotal: 0.2 * 95000 },
      { descripcion: 'Ayudante', unidad: 'Jornal', rendimiento: 0.2, precioUnitario: 80000, subtotal: 0.2 * 80000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Andamios (alquiler)', unidad: 'm²-día', rendimiento: 0.2, precioUnitario: 3500, subtotal: 0.2 * 3500 },
      { descripcion: 'Herramienta menor', unidad: 'Global', rendimiento: 1, precioUnitario: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0), subtotal: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0) },
    ];
    const tr: APUInsumo[] = [
      { descripcion: 'Flete láminas y correas', unidad: 'Global', rendimiento: 1, precioUnitario: 4500, subtotal: 4500 },
    ];
    return buildAPU('APU-T001', 'Cubierta en lámina de zinc ondulada cal. 26', 'm²', mats, mo, eq, tr);
  },

  // ─ Cimientos/Viga de Amarre (m³) ─────────────────────────────────────────
  'cimiento': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Concreto premezclado 21 MPa', unidad: 'm³', rendimiento: 1.0, precioUnitario: 580000, subtotal: 580000 },
      { descripcion: 'Varilla corrugada Fy=420', unidad: 'kg', rendimiento: 120, precioUnitario: 4200, subtotal: 120 * 4200 },
      { descripcion: 'Alambre negro cal.16', unidad: 'kg', rendimiento: 3, precioUnitario: 6000, subtotal: 3 * 6000 },
      { descripcion: 'Formaleta metálica (alquiler)', unidad: 'm²', rendimiento: 4, precioUnitario: 8500, subtotal: 4 * 8500 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Oficial estructurero', unidad: 'Jornal', rendimiento: 0.5, precioUnitario: 100000, subtotal: 0.5 * 100000 },
      { descripcion: 'Armador', unidad: 'Jornal', rendimiento: 0.7, precioUnitario: 100000, subtotal: 0.7 * 100000 },
      { descripcion: 'Ayudante', unidad: 'Jornal', rendimiento: 1.0, precioUnitario: 80000, subtotal: 80000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Vibrador de concreto', unidad: 'H-M', rendimiento: 0.3, precioUnitario: 18000, subtotal: 0.3 * 18000 },
      { descripcion: 'Herramienta menor', unidad: 'Global', rendimiento: 1, precioUnitario: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0), subtotal: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0) },
    ];
    const tr: APUInsumo[] = [
      { descripcion: 'Flete materiales', unidad: 'Global', rendimiento: 1, precioUnitario: 15000, subtotal: 15000 },
    ];
    return buildAPU('APU-F001', 'Cimiento en concreto reforzado f\'c=210 kg/cm²', 'm³', mats, mo, eq, tr);
  },

  // ─ Recubrimiento/Revoque (m²) ─────────────────────────────────────────────
  'revoque': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Cemento Portland (50kg)', unidad: 'Bolsa', rendimiento: 0.2, precioUnitario: 32000, subtotal: 0.2 * 32000 },
      { descripcion: 'Arena de revoque', unidad: 'm³', rendimiento: 0.018, precioUnitario: 90000, subtotal: 0.018 * 90000 },
      { descripcion: 'Agua', unidad: 'm³', rendimiento: 0.012, precioUnitario: 5000, subtotal: 0.012 * 5000 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Oficial revocador', unidad: 'Jornal', rendimiento: 0.15, precioUnitario: 95000, subtotal: 0.15 * 95000 },
      { descripcion: 'Ayudante', unidad: 'Jornal', rendimiento: 0.15, precioUnitario: 80000, subtotal: 0.15 * 80000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Andamio (alquiler)', unidad: 'm²-día', rendimiento: 0.1, precioUnitario: 3500, subtotal: 0.1 * 3500 },
      { descripcion: 'Herramienta menor', unidad: 'Global', rendimiento: 1, precioUnitario: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0), subtotal: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0) },
    ];
    const tr: APUInsumo[] = [
      { descripcion: 'Flete arena y cemento', unidad: 'Global', rendimiento: 1, precioUnitario: 1500, subtotal: 1500 },
    ];
    return buildAPU('APU-R001', 'Revoque o pañete en mortero 1:4 e=1.5 cm', 'm²', mats, mo, eq, tr);
  },

  // ─ Losa de entrepiso (m²) ─────────────────────────────────────────────────
  'losa': () => {
    const mats: APUInsumo[] = [
      { descripcion: 'Concreto premezclado 28 MPa', unidad: 'm³', rendimiento: 0.22, precioUnitario: 620000, subtotal: 0.22 * 620000 },
      { descripcion: 'Malla electrosoldada 15-15-4-4', unidad: 'm²', rendimiento: 1.1, precioUnitario: 28000, subtotal: 1.1 * 28000 },
      { descripcion: 'Formaleta metálica losa (alquiler)', unidad: 'm²', rendimiento: 1.0, precioUnitario: 12000, subtotal: 12000 },
      { descripcion: 'Puntales telescópicos (alquiler)', unidad: 'und', rendimiento: 0.5, precioUnitario: 8000, subtotal: 0.5 * 8000 },
    ];
    const mo: APUInsumo[] = [
      { descripcion: 'Oficial carpintero formaleta', unidad: 'Jornal', rendimiento: 0.25, precioUnitario: 95000, subtotal: 0.25 * 95000 },
      { descripcion: 'Oficial estructurero', unidad: 'Jornal', rendimiento: 0.2, precioUnitario: 100000, subtotal: 0.2 * 100000 },
      { descripcion: 'Ayudante', unidad: 'Jornal', rendimiento: 0.4, precioUnitario: 80000, subtotal: 0.4 * 80000 },
    ];
    const eq: APUInsumo[] = [
      { descripcion: 'Vibrador de concreto', unidad: 'H-M', rendimiento: 0.15, precioUnitario: 18000, subtotal: 0.15 * 18000 },
      { descripcion: 'Herramienta menor', unidad: 'Global', rendimiento: 1, precioUnitario: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0), subtotal: 0.05 * mo.reduce((s,i)=>s+i.subtotal,0) },
    ];
    const tr: APUInsumo[] = [
      { descripcion: 'Flete de formaleta y materiales', unidad: 'Global', rendimiento: 1, precioUnitario: 6000, subtotal: 6000 },
    ];
    return buildAPU('APU-L001', 'Losa aligerada o maciza en concreto e=20 cm', 'm²', mats, mo, eq, tr);
  },
};

// ─── Función Constructora de APU ───────────────────────────────────────────────

function buildAPU(
  codigo: string,
  descripcion: string,
  unidad: string,
  materiales: APUInsumo[],
  manoDeObra: APUInsumo[],
  equipos: APUInsumo[],
  transporte: APUInsumo[],
  aiuPorcentaje = 0.28
): APUDetalle {
  const totalMateriales = materiales.reduce((s, i) => s + i.subtotal, 0);
  const totalManoDeObra = manoDeObra.reduce((s, i) => s + i.subtotal, 0);
  const totalEquipos = equipos.reduce((s, i) => s + i.subtotal, 0);
  const totalTransporte = transporte.reduce((s, i) => s + i.subtotal, 0);
  const precioUnitarioTotal = totalMateriales + totalManoDeObra + totalEquipos + totalTransporte;
  const precioUnitarioConAIU = precioUnitarioTotal * (1 + aiuPorcentaje);
  return {
    codigo,
    descripcion,
    unidad,
    materiales,
    manoDeObra,
    equipos,
    transporte,
    totalMateriales,
    totalManoDeObra,
    totalEquipos,
    totalTransporte,
    precioUnitarioTotal,
    aiuPorcentaje,
    precioUnitarioConAIU,
  };
}

// ─── Motor de Clasificación: IFC Material → APU ────────────────────────────────

/**
 * Palabras clave para mapeo de materiales IFC a categorías de APU.
 * Prioridad: la primera coincidencia en orden gana.
 */
const MATERIAL_KEYWORDS: { key: string; keywords: string[] }[] = [
  { key: 'acero', keywords: ['acero', 'steel', 'rebar', 'reinforc', 'hierro', 'varilla', 'metal'] },
  { key: 'concreto', keywords: ['concreto', 'concrete', 'hormigon', 'hormigón', 'cement', 'c21', 'c28', 'f\'c', 'fc'] },
  { key: 'losa', keywords: ['losa', 'slab', 'entrepiso', 'forjado', 'placa'] },
  { key: 'cimiento', keywords: ['cimiento', 'footing', 'fundacion', 'fundación', 'foundation', 'zapata', 'pilote', 'pile'] },
  { key: 'mamposteria', keywords: ['bloque', 'ladrillo', 'brick', 'masonry', 'mampostería', 'mamposteria'] },
  { key: 'pavimento', keywords: ['pavimento', 'pavement', 'asphalt', 'asfalto', 'piso exterior', 'via', 'vía', 'road'] },
  { key: 'cubierta', keywords: ['cubierta', 'techo', 'roof', 'zinc', 'teja', 'metal deck', 'deck'] },
  { key: 'revoque', keywords: ['revoque', 'pañete', 'plaster', 'stucco', 'render', 'enlucido', 'acabado', 'revestimiento'] },
  { key: 'excavacion', keywords: ['tierra', 'soil', 'terreno', 'relleno', 'excavacion', 'excavación', 'ground'] },
];

function classifyMaterial(materialName: string): string {
  const lower = materialName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const { key, keywords } of MATERIAL_KEYWORDS) {
    if (keywords.some(k => lower.includes(k))) return key;
  }
  return 'concreto'; // Fallback seguro
}

function getDominantUnit(mq: MaterialQuantity): { cantidad: number; unidad: string } {
  if (mq.volume > 0.01) return { cantidad: parseFloat(mq.volume.toFixed(3)), unidad: 'm³' };
  if (mq.area > 0.01) return { cantidad: parseFloat(mq.area.toFixed(2)), unidad: 'm²' };
  if (mq.length > 0.01) return { cantidad: parseFloat(mq.length.toFixed(2)), unidad: 'm' };
  // Si no hay cantidades en el IFC, estimamos por conteo de elementos
  return { cantidad: mq.count, unidad: 'und' };
}

// ─── Función Principal del Motor APU ──────────────────────────────────────────

export function buildPresupuesto(materialQuantities: MaterialQuantity[]): PresupuestoGeneral {
  const items: LineaPresupuesto[] = [];
  let itemCounter = 1;

  for (const mq of materialQuantities) {
    const category = classifyMaterial(mq.materialName);
    const apuFactory = APU_DATABASE[category] ?? APU_DATABASE['concreto'];
    const apu = apuFactory();
    const { cantidad, unidad } = getDominantUnit(mq);

    // Verificación: no incluir cantidades cero
    if (cantidad <= 0) continue;

    const codigo = String(itemCounter).padStart(3, '0');
    const precioUnitario = apu.precioUnitarioConAIU;
    const precioTotal = cantidad * precioUnitario;

    items.push({
      item: codigo,
      descripcion: `${mq.elementType}: ${mq.materialName}`,
      unidad,
      cantidad,
      precioUnitario: Math.round(precioUnitario),
      precioTotal: Math.round(precioTotal),
      apu,
      materialRef: mq.materialName,
    });

    itemCounter++;
  }

  const subtotalMateriales = items.reduce((s, i) => s + i.cantidad * i.apu.totalMateriales, 0);
  const subtotalManoDeObra = items.reduce((s, i) => s + i.cantidad * i.apu.totalManoDeObra, 0);
  const subtotalEquipos = items.reduce((s, i) => s + i.cantidad * i.apu.totalEquipos, 0);
  const subtotalTransporte = items.reduce((s, i) => s + i.cantidad * i.apu.totalTransporte, 0);
  const costoDirectoTotal = subtotalMateriales + subtotalManoDeObra + subtotalEquipos + subtotalTransporte;
  const aiuPorcentaje = 0.28;
  const aiuValor = costoDirectoTotal * aiuPorcentaje;
  const totalGeneral = costoDirectoTotal + aiuValor;

  return {
    items,
    subtotalMateriales: Math.round(subtotalMateriales),
    subtotalManoDeObra: Math.round(subtotalManoDeObra),
    subtotalEquipos: Math.round(subtotalEquipos),
    subtotalTransporte: Math.round(subtotalTransporte),
    costoDirectoTotal: Math.round(costoDirectoTotal),
    aiu: {
      porcentaje: aiuPorcentaje,
      valor: Math.round(aiuValor),
    },
    totalGeneral: Math.round(totalGeneral),
    moneda: 'COP',
  };
}
