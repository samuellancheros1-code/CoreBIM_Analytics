/**
 * ifcWorker.ts - Web Worker dedicado al parseo IFC
 * ────────────────────────────────────────────────────────────────────
 * Este worker ejecuta toda la lógica de web-ifc fuera del hilo principal
 * para evitar que la UI se congele. Se comunica vía postMessage con
 * mensajes tipados: { type: 'progress' | 'result' | 'error', ... }
 */

import * as WebIFC from 'web-ifc';

// ─── Tipos de mensajes ────────────────────────────────────────────────────────
export type WorkerInMessage = { type: 'parse'; buffer: ArrayBuffer };

export type WorkerOutMessage =
  | { type: 'progress'; step: string; pct: number }
  | { type: 'result'; data: ParsedIFCData }
  | { type: 'error'; message: string };

// ─── Interfaces (copiadas aquí para que el worker sea autónomo) ───────────────
export interface ProjectLocation {
  name: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  address: string;
}

export interface MaterialQuantity {
  materialName: string;
  volume: number;
  area: number;
  length: number;
  elementType: string;
  ifcType: string;
  count: number;
  thickness?: number;
  estimatedFromGeometry: boolean;
}

export interface ParsedIFCData {
  projectName: string;
  projectDescription: string;
  location: ProjectLocation;
  materialQuantities: MaterialQuantity[];
  rawElementCount: number;
  parsingWarnings: string[];
  quantitySource: 'IfcElementQuantity' | 'Estimated' | 'Mixed';
}

// ─── Tipos estructurales a analizar ───────────────────────────────────────────
const ELEMENT_TYPES_CONFIG: { type: number; label: string }[] = [
  { type: WebIFC.IFCWALL, label: 'Muro' },
  { type: WebIFC.IFCWALLSTANDARDCASE, label: 'Muro' },
  { type: WebIFC.IFCSLAB, label: 'Losa' },
  { type: WebIFC.IFCCOLUMN, label: 'Columna' },
  { type: WebIFC.IFCBEAM, label: 'Viga' },
  { type: WebIFC.IFCFOOTING, label: 'Cimiento' },
  { type: WebIFC.IFCPILE, label: 'Pilote' },
  { type: WebIFC.IFCROOF, label: 'Cubierta' },
  { type: WebIFC.IFCSTAIR, label: 'Escalera' },
  { type: WebIFC.IFCSTAIRFLIGHT, label: 'Tramo Escalera' },
  { type: WebIFC.IFCRAMP, label: 'Rampa' },
  { type: WebIFC.IFCDOOR, label: 'Puerta' },
  { type: WebIFC.IFCWINDOW, label: 'Ventana' },
  { type: WebIFC.IFCCOVERING, label: 'Revestimiento' },
  { type: WebIFC.IFCMEMBER, label: 'Miembro Estructural' },
  { type: WebIFC.IFCPLATE, label: 'Placa' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compoundAngleToDecimal(angle: number[]): number {
  if (!angle || angle.length === 0) return 0;
  const [deg, min = 0, sec = 0, usec = 0] = angle;
  const sign = deg < 0 ? -1 : 1;
  return deg + sign * (Math.abs(min) / 60) + sign * (Math.abs(sec) / 3600) + sign * (Math.abs(usec) / 3600000000);
}

function extractMaterialName(api: WebIFC.IfcAPI, modelID: number, materialRef: any): { name: string; thickness: number } {
  if (!materialRef) return { name: 'Material Desconocido', thickness: 0 };
  try {
    const entity = api.GetLine(modelID, materialRef.value, true);
    if (!entity) return { name: 'Material Desconocido', thickness: 0 };

    if (entity.type === WebIFC.IFCMATERIAL) {
      return { name: entity.Name?.value || 'Material', thickness: 0 };
    }
    if (entity.type === WebIFC.IFCMATERIALLAYERSETUSAGE) {
      const layerSetRef = entity.ForLayerSet;
      if (layerSetRef) {
        const layerSet = api.GetLine(modelID, layerSetRef.value, true);
        let totalThickness = 0;
        const matNames: string[] = [];
        if (layerSet?.MaterialLayers) {
          const layers = Array.isArray(layerSet.MaterialLayers) ? layerSet.MaterialLayers : [layerSet.MaterialLayers];
          for (const lr of layers) {
            try {
              const layer = api.GetLine(modelID, lr.value, true);
              if (layer) {
                totalThickness += Math.abs(layer.LayerThickness?.value ?? 0);
                if (layer.Material) {
                  const mat = api.GetLine(modelID, layer.Material.value, true);
                  if (mat?.Name?.value) matNames.push(mat.Name.value);
                }
              }
            } catch (_) { }
          }
        }
        const name = matNames.length > 0 ? matNames.join(' + ') : (layerSet?.LayerSetName?.value || 'Material Compuesto');
        return { name, thickness: totalThickness };
      }
    }
    if (entity.type === WebIFC.IFCMATERIALLAYERSET) {
      let totalThickness = 0;
      const matNames: string[] = [];
      if (entity.MaterialLayers) {
        const layers = Array.isArray(entity.MaterialLayers) ? entity.MaterialLayers : [entity.MaterialLayers];
        for (const lr of layers) {
          try {
            const layer = api.GetLine(modelID, lr.value, true);
            if (layer) {
              totalThickness += Math.abs(layer.LayerThickness?.value ?? 0);
              if (layer.Material) {
                const mat = api.GetLine(modelID, layer.Material.value, true);
                if (mat?.Name?.value) matNames.push(mat.Name.value);
              }
            }
          } catch (_) { }
        }
      }
      return { name: matNames.join(' + ') || entity.LayerSetName?.value || 'Capas', thickness: totalThickness };
    }
    if (entity.type === WebIFC.IFCMATERIALCONSTITUENTSET) {
      const names: string[] = [];
      if (entity.MaterialConstituents) {
        const constituents = Array.isArray(entity.MaterialConstituents) ? entity.MaterialConstituents : [entity.MaterialConstituents];
        for (const cr of constituents) {
          try {
            const c = api.GetLine(modelID, cr.value, true);
            if (c?.Material) {
              const m = api.GetLine(modelID, c.Material.value, true);
              if (m?.Name?.value) names.push(m.Name.value);
            }
          } catch (_) { }
        }
      }
      return { name: names.join(' + ') || entity.Name?.value || 'Constituyentes', thickness: 0 };
    }
    if (entity.type === WebIFC.IFCMATERIALPROFILESETUSAGE) {
      const profileSet = entity.ForProfileSet ? api.GetLine(modelID, entity.ForProfileSet.value, true) : null;
      if (profileSet?.MaterialProfiles) {
        const profiles = Array.isArray(profileSet.MaterialProfiles) ? profileSet.MaterialProfiles : [profileSet.MaterialProfiles];
        const names: string[] = [];
        for (const pr of profiles) {
          try {
            const p = api.GetLine(modelID, pr.value, true);
            if (p?.Material) {
              const m = api.GetLine(modelID, p.Material.value, true);
              if (m?.Name?.value) names.push(m.Name.value);
            }
          } catch (_) { }
        }
        if (names.length > 0) return { name: names.join(' + '), thickness: 0 };
      }
    }
  } catch (_) { }
  return { name: 'Material Compuesto', thickness: 0 };
}

function buildMaterialIndex(api: WebIFC.IfcAPI, modelID: number): Map<number, { name: string; thickness: number }> {
  const index = new Map<number, { name: string; thickness: number }>();
  try {
    const relIds = api.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relIds.get(i), true);
        if (!rel?.RelatedObjects || !rel?.RelatingMaterial) continue;
        const matData = extractMaterialName(api, modelID, rel.RelatingMaterial);
        const related = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (const ro of related) {
          if (ro?.value != null) index.set(ro.value, matData);
        }
      } catch (_) { }
    }
  } catch (_) { }
  return index;
}

function buildQuantityIndex(api: WebIFC.IfcAPI, modelID: number): Map<number, { vol: number; area: number; len: number }> {
  const index = new Map<number, { vol: number; area: number; len: number }>();
  try {
    const relIds = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relIds.get(i), true);
        if (!rel?.RelatedObjects || !rel?.RelatingPropertyDefinition) continue;
        const pd = api.GetLine(modelID, rel.RelatingPropertyDefinition.value, true);
        if (!pd || pd.type !== WebIFC.IFCELEMENTQUANTITY) continue;
        let vol = 0, area = 0, len = 0;
        if (pd.Quantities) {
          const qs = Array.isArray(pd.Quantities) ? pd.Quantities : [pd.Quantities];
          for (const qr of qs) {
            try {
              const q = api.GetLine(modelID, qr.value, true);
              if (!q) continue;
              if (q.type === WebIFC.IFCQUANTITYVOLUME) vol += Math.abs(q.VolumeValue?.value ?? 0);
              if (q.type === WebIFC.IFCQUANTITYAREA) area += Math.abs(q.AreaValue?.value ?? 0);
              if (q.type === WebIFC.IFCQUANTITYLENGTH) len += Math.abs(q.LengthValue?.value ?? 0);
            } catch (_) { }
          }
        }
        if (vol > 0 || area > 0 || len > 0) {
          const related = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
          for (const ro of related) {
            if (ro?.value == null) continue;
            const prev = index.get(ro.value) ?? { vol: 0, area: 0, len: 0 };
            index.set(ro.value, { vol: prev.vol + vol, area: prev.area + area, len: prev.len + len });
          }
        }
      } catch (_) { }
    }
  } catch (_) { }
  return index;
}

// ─── Función principal del Worker ─────────────────────────────────────────────

async function runParse(buffer: ArrayBuffer) {
  const warnings: string[] = [];

  const report = (step: string, pct: number) => {
    self.postMessage({ type: 'progress', step, pct } satisfies WorkerOutMessage);
  };

  report('Inicializando motor IFC (web-ifc v0.0.77)...', 5);

  const api = new WebIFC.IfcAPI();

  // Usar modo single-thread (web-ifc.wasm) para mayor compatibilidad.
  // El modo MT requiere SharedArrayBuffer que puede fallar en entornos restrictivos.
  api.SetWasmPath('/');

  try {
    await api.Init();
  } catch (e1) {
    warnings.push('WASM local falló, intentando CDN...');
    try {
      api.SetWasmPath('https://unpkg.com/web-ifc@0.0.77/');
      await api.Init();
    } catch (e2) {
      throw new Error('No se pudo inicializar web-ifc. Detalle: ' + String(e2));
    }
  }

  report('Cargando archivo en memoria...', 15);
  const modelID = api.OpenModel(new Uint8Array(buffer));

  report('Extrayendo metadatos del proyecto (IfcProject)...', 22);

  let projectName = 'Proyecto IFC';
  let projectDescription = '';
  try {
    const pids = api.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (pids.size() > 0) {
      const proj = api.GetLine(modelID, pids.get(0), true);
      projectName = proj?.Name?.value || proj?.LongName?.value || projectName;
      projectDescription = proj?.Description?.value || proj?.LongName?.value || '';
    }
  } catch (_) { warnings.push('No se pudo leer IfcProject.'); }

  report('Localizando el proyecto (IfcSite)...', 30);

  const location: ProjectLocation = { name: projectName, description: '', latitude: null, longitude: null, elevation: null, address: '' };
  try {
    const sids = api.GetLineIDsWithType(modelID, WebIFC.IFCSITE);
    if (sids.size() > 0) {
      const site = api.GetLine(modelID, sids.get(0), true);
      location.name = site?.Name?.value || site?.LongName?.value || projectName;
      location.description = site?.Description?.value || '';
      if (site?.RefLatitude) {
        const arr = Array.isArray(site.RefLatitude)
          ? site.RefLatitude.map((v: any) => (typeof v === 'object' ? v?.value : v) ?? 0)
          : [site.RefLatitude?.value ?? site.RefLatitude];
        location.latitude = compoundAngleToDecimal(arr);
      }
      if (site?.RefLongitude) {
        const arr = Array.isArray(site.RefLongitude)
          ? site.RefLongitude.map((v: any) => (typeof v === 'object' ? v?.value : v) ?? 0)
          : [site.RefLongitude?.value ?? site.RefLongitude];
        location.longitude = compoundAngleToDecimal(arr);
      }
      if (site?.RefElevation) {
        location.elevation = site.RefElevation?.value ?? site.RefElevation ?? null;
      }
      if (site?.SiteAddress) {
        try {
          const addr = api.GetLine(modelID, site.SiteAddress.value, true);
          const parts = [
            ...(Array.isArray(addr?.AddressLines) ? addr.AddressLines.map((l: any) => l?.value).filter(Boolean) : []),
            addr?.Town?.value, addr?.Region?.value, addr?.Country?.value,
          ].filter(Boolean);
          location.address = parts.join(', ');
        } catch (_) { }
      }
    } else {
      warnings.push('El archivo IFC no contiene IfcSite.');
    }
  } catch (e) { warnings.push('Error al leer IfcSite: ' + String(e)); }

  report('Pre-indexando relaciones de materiales...', 40);
  const materialIndex = buildMaterialIndex(api, modelID);

  report('Pre-indexando cantidades (IfcElementQuantity)...', 50);
  const quantityIndex = buildQuantityIndex(api, modelID);

  const hasQSets = quantityIndex.size > 0;
  if (!hasQSets) {
    warnings.push('El modelo no contiene IfcElementQuantity. Las cantidades se estimarán desde el espesor del material y el conteo de elementos.');
  }

  const matMap = new Map<string, MaterialQuantity>();
  let rawElementCount = 0;
  const totalTypes = ELEMENT_TYPES_CONFIG.length;

  for (let tIndex = 0; tIndex < totalTypes; tIndex++) {
    const { type, label } = ELEMENT_TYPES_CONFIG[tIndex];
    report(`Analizando: ${label}...`, 55 + Math.floor((tIndex / totalTypes) * 35));

    let ids: ReturnType<WebIFC.IfcAPI['GetLineIDsWithType']> | null = null;
    try { ids = api.GetLineIDsWithType(modelID, type); } catch (_) { continue; }
    if (!ids) continue;

    const count = ids.size();
    rawElementCount += count;

    for (let i = 0; i < count; i++) {
      const eid = ids.get(i);
      const matData = materialIndex.get(eid) ?? { name: 'Sin Material', thickness: 0 };
      let vol = 0, area = 0, len = 0, estimated = false;
      const qData = quantityIndex.get(eid);
      if (qData) {
        vol = qData.vol; area = qData.area; len = qData.len;
      } else {
        estimated = true;
        if (matData.thickness > 0) { area = 1; }
      }
      const key = `${matData.name}|||${label}`;
      if (matMap.has(key)) {
        const ex = matMap.get(key)!;
        ex.volume += vol; ex.area += area; ex.length += len; ex.count += 1;
        if (!estimated) ex.estimatedFromGeometry = false;
      } else {
        matMap.set(key, {
          materialName: matData.name, volume: vol, area, length: len,
          elementType: label, ifcType: type.toString(), count: 1,
          thickness: matData.thickness, estimatedFromGeometry: estimated,
        });
      }
    }
  }

  report('Consolidando resultados...', 92);
  api.CloseModel(modelID);

  const materialQuantities = Array.from(matMap.values())
    .map(mq => {
      if (mq.estimatedFromGeometry && mq.thickness > 0) {
        const estimatedArea = mq.count * 4;
        return { ...mq, area: estimatedArea, volume: estimatedArea * mq.thickness };
      }
      if (mq.estimatedFromGeometry) {
        return { ...mq, area: mq.count * 2 };
      }
      return mq;
    })
    .filter(mq => mq.count > 0)
    .sort((a, b) => (b.volume || b.area) - (a.volume || a.area));

  const quantitySource: ParsedIFCData['quantitySource'] = hasQSets ? 'IfcElementQuantity' : 'Estimated';

  report('¡Análisis completado!', 100);

  const result: ParsedIFCData = {
    projectName, projectDescription, location,
    materialQuantities, rawElementCount,
    parsingWarnings: warnings, quantitySource,
  };

  self.postMessage({ type: 'result', data: result } satisfies WorkerOutMessage);
}

// ─── Receptor de mensajes del hilo principal ──────────────────────────────────

self.addEventListener('message', async (event: MessageEvent<WorkerInMessage>) => {
  if (event.data.type === 'parse') {
    try {
      await runParse(event.data.buffer);
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) } satisfies WorkerOutMessage);
    }
  }
});
