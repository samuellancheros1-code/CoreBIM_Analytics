/**
 * ifcParser.ts - Motor de análisis IFC v4
 * ──────────────────────────────────────────────────────────────────────────────
 * Ejecuta web-ifc en un Web Worker (Blob URL) para no bloquear el hilo
 * principal. web-ifc se carga via importScripts() desde /public local.
 */

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

// ─── Código del Worker incrustado como string ─────────────────────────────────
// NOTA: NO declarar variables que el IIFE de web-ifc también declare (WebIFC).
//       Usar siempre self.WebIFC tras importScripts().

const WORKER_CODE = `
'use strict';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compoundAngleToDecimal(angle) {
  if (!angle || angle.length === 0) return 0;
  const deg = angle[0], min = angle[1] || 0, sec = angle[2] || 0, usec = angle[3] || 0;
  const sign = deg < 0 ? -1 : 1;
  return deg + sign * (Math.abs(min) / 60) + sign * (Math.abs(sec) / 3600) + sign * (Math.abs(usec) / 3600000000);
}

function extractMaterialName(api, IFC, modelID, materialRef) {
  if (!materialRef) return { name: 'Material Desconocido', thickness: 0 };
  try {
    const entity = api.GetLine(modelID, materialRef.value, true);
    if (!entity) return { name: 'Material Desconocido', thickness: 0 };

    if (entity.type === IFC.IFCMATERIAL) {
      return { name: entity.Name && entity.Name.value ? entity.Name.value : 'Material', thickness: 0 };
    }
    if (entity.type === IFC.IFCMATERIALLAYERSETUSAGE) {
      const layerSetRef = entity.ForLayerSet;
      if (layerSetRef) {
        const layerSet = api.GetLine(modelID, layerSetRef.value, true);
        let totalThickness = 0;
        const matNames = [];
        if (layerSet && layerSet.MaterialLayers) {
          const layers = Array.isArray(layerSet.MaterialLayers) ? layerSet.MaterialLayers : [layerSet.MaterialLayers];
          for (let k = 0; k < layers.length; k++) {
            try {
              const layer = api.GetLine(modelID, layers[k].value, true);
              if (layer) {
                totalThickness += Math.abs((layer.LayerThickness && layer.LayerThickness.value) ? layer.LayerThickness.value : 0);
                if (layer.Material) {
                  const mat = api.GetLine(modelID, layer.Material.value, true);
                  if (mat && mat.Name && mat.Name.value) matNames.push(mat.Name.value);
                }
              }
            } catch(e) {}
          }
        }
        const n = matNames.length > 0 ? matNames.join(' + ') : ((layerSet && layerSet.LayerSetName && layerSet.LayerSetName.value) || 'Material Compuesto');
        return { name: n, thickness: totalThickness };
      }
    }
    if (entity.type === IFC.IFCMATERIALLAYERSET) {
      let totalThickness = 0;
      const matNames = [];
      if (entity.MaterialLayers) {
        const layers = Array.isArray(entity.MaterialLayers) ? entity.MaterialLayers : [entity.MaterialLayers];
        for (let k = 0; k < layers.length; k++) {
          try {
            const layer = api.GetLine(modelID, layers[k].value, true);
            if (layer) {
              totalThickness += Math.abs((layer.LayerThickness && layer.LayerThickness.value) ? layer.LayerThickness.value : 0);
              if (layer.Material) {
                const mat = api.GetLine(modelID, layer.Material.value, true);
                if (mat && mat.Name && mat.Name.value) matNames.push(mat.Name.value);
              }
            }
          } catch(e) {}
        }
      }
      return { name: matNames.join(' + ') || (entity.LayerSetName && entity.LayerSetName.value) || 'Capas', thickness: totalThickness };
    }
    if (entity.type === IFC.IFCMATERIALCONSTITUENTSET) {
      const names = [];
      if (entity.MaterialConstituents) {
        const cs = Array.isArray(entity.MaterialConstituents) ? entity.MaterialConstituents : [entity.MaterialConstituents];
        for (let k = 0; k < cs.length; k++) {
          try {
            const c = api.GetLine(modelID, cs[k].value, true);
            if (c && c.Material) {
              const m = api.GetLine(modelID, c.Material.value, true);
              if (m && m.Name && m.Name.value) names.push(m.Name.value);
            }
          } catch(e) {}
        }
      }
      return { name: names.join(' + ') || (entity.Name && entity.Name.value) || 'Constituyentes', thickness: 0 };
    }
    if (entity.type === IFC.IFCMATERIALPROFILESETUSAGE) {
      const profileSet = entity.ForProfileSet ? api.GetLine(modelID, entity.ForProfileSet.value, true) : null;
      if (profileSet && profileSet.MaterialProfiles) {
        const profiles = Array.isArray(profileSet.MaterialProfiles) ? profileSet.MaterialProfiles : [profileSet.MaterialProfiles];
        const names = [];
        for (let k = 0; k < profiles.length; k++) {
          try {
            const p = api.GetLine(modelID, profiles[k].value, true);
            if (p && p.Material) {
              const m = api.GetLine(modelID, p.Material.value, true);
              if (m && m.Name && m.Name.value) names.push(m.Name.value);
            }
          } catch(e) {}
        }
        if (names.length > 0) return { name: names.join(' + '), thickness: 0 };
      }
    }
  } catch(e) {}
  return { name: 'Material Compuesto', thickness: 0 };
}

function buildMaterialIndex(api, IFC, modelID) {
  const index = new Map();
  try {
    const relIds = api.GetLineIDsWithType(modelID, IFC.IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relIds.get(i), true);
        if (!rel || !rel.RelatedObjects || !rel.RelatingMaterial) continue;
        const matData = extractMaterialName(api, IFC, modelID, rel.RelatingMaterial);
        const related = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (let j = 0; j < related.length; j++) {
          if (related[j] && related[j].value != null) index.set(related[j].value, matData);
        }
      } catch(e) {}
    }
  } catch(e) {}
  return index;
}

function buildQuantityIndex(api, IFC, modelID) {
  const index = new Map();
  try {
    const relIds = api.GetLineIDsWithType(modelID, IFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relIds.get(i), true);
        if (!rel || !rel.RelatedObjects || !rel.RelatingPropertyDefinition) continue;
        const pd = api.GetLine(modelID, rel.RelatingPropertyDefinition.value, true);
        if (!pd || pd.type !== IFC.IFCELEMENTQUANTITY) continue;
        let vol = 0, area = 0, len = 0;
        if (pd.Quantities) {
          const qs = Array.isArray(pd.Quantities) ? pd.Quantities : [pd.Quantities];
          for (let j = 0; j < qs.length; j++) {
            try {
              const q = api.GetLine(modelID, qs[j].value, true);
              if (!q) continue;
              if (q.type === IFC.IFCQUANTITYVOLUME && q.VolumeValue) vol += Math.abs(q.VolumeValue.value || 0);
              if (q.type === IFC.IFCQUANTITYAREA && q.AreaValue) area += Math.abs(q.AreaValue.value || 0);
              if (q.type === IFC.IFCQUANTITYLENGTH && q.LengthValue) len += Math.abs(q.LengthValue.value || 0);
            } catch(e) {}
          }
        }
        if (vol > 0 || area > 0 || len > 0) {
          const related = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
          for (let j = 0; j < related.length; j++) {
            if (!related[j] || related[j].value == null) continue;
            const prev = index.get(related[j].value) || { vol: 0, area: 0, len: 0 };
            index.set(related[j].value, { vol: prev.vol + vol, area: prev.area + area, len: prev.len + len });
          }
        }
      } catch(e) {}
    }
  } catch(e) {}
  return index;
}

async function runParse(buffer, wasmBaseUrl) {
  const warnings = [];
  const report = function(step, pct) { self.postMessage({ type: 'progress', step: step, pct: pct }); };

  report('Inicializando motor IFC (web-ifc v0.0.77)...', 5);

  // Usar self.WebIFC (declarado por el IIFE) — NO redeclarar con let/const
  const api = new self.WebIFC.IfcAPI();
  const IFC = self.WebIFC;

  api.SetWasmPath(wasmBaseUrl);
  try {
    await api.Init();
  } catch(e1) {
    warnings.push('WASM local falló: ' + String(e1) + '. Reintentando con CDN...');
    try {
      api.SetWasmPath('https://unpkg.com/web-ifc@0.0.77/');
      await api.Init();
    } catch(e2) {
      throw new Error('No se pudo inicializar web-ifc. ' + String(e2));
    }
  }

  report('Cargando archivo en memoria...', 15);
  const modelID = api.OpenModel(new Uint8Array(buffer));

  report('Extrayendo metadatos (IfcProject)...', 22);
  let projectName = 'Proyecto IFC';
  let projectDescription = '';
  try {
    const pids = api.GetLineIDsWithType(modelID, IFC.IFCPROJECT);
    if (pids.size() > 0) {
      const proj = api.GetLine(modelID, pids.get(0), true);
      if (proj) {
        projectName = (proj.Name && proj.Name.value) || (proj.LongName && proj.LongName.value) || projectName;
        projectDescription = (proj.Description && proj.Description.value) || (proj.LongName && proj.LongName.value) || '';
      }
    }
  } catch(e) { warnings.push('No se pudo leer IfcProject.'); }

  report('Localizando proyecto (IfcSite)...', 30);
  const location = { name: projectName, description: '', latitude: null, longitude: null, elevation: null, address: '' };
  try {
    const sids = api.GetLineIDsWithType(modelID, IFC.IFCSITE);
    if (sids.size() > 0) {
      const site = api.GetLine(modelID, sids.get(0), true);
      if (site) {
        location.name = (site.Name && site.Name.value) || (site.LongName && site.LongName.value) || projectName;
        location.description = (site.Description && site.Description.value) || '';
        if (site.RefLatitude) {
          const arr = Array.isArray(site.RefLatitude)
            ? site.RefLatitude.map(function(v) { return (typeof v === 'object' ? (v && v.value) : v) || 0; })
            : [(site.RefLatitude.value !== undefined ? site.RefLatitude.value : site.RefLatitude)];
          location.latitude = compoundAngleToDecimal(arr);
        }
        if (site.RefLongitude) {
          const arr = Array.isArray(site.RefLongitude)
            ? site.RefLongitude.map(function(v) { return (typeof v === 'object' ? (v && v.value) : v) || 0; })
            : [(site.RefLongitude.value !== undefined ? site.RefLongitude.value : site.RefLongitude)];
          location.longitude = compoundAngleToDecimal(arr);
        }
        if (site.RefElevation) {
          location.elevation = (site.RefElevation.value !== undefined ? site.RefElevation.value : site.RefElevation) || null;
        }
        if (site.SiteAddress) {
          try {
            const addr = api.GetLine(modelID, site.SiteAddress.value, true);
            if (addr) {
              const parts = [];
              if (Array.isArray(addr.AddressLines)) {
                addr.AddressLines.forEach(function(l) { if (l && l.value) parts.push(l.value); });
              }
              if (addr.Town && addr.Town.value) parts.push(addr.Town.value);
              if (addr.Region && addr.Region.value) parts.push(addr.Region.value);
              if (addr.Country && addr.Country.value) parts.push(addr.Country.value);
              location.address = parts.join(', ');
            }
          } catch(e) {}
        }
      }
    } else {
      warnings.push('El IFC no contiene IfcSite.');
    }
  } catch(e) { warnings.push('Error al leer IfcSite: ' + String(e)); }

  report('Indexando materiales...', 40);
  const materialIndex = buildMaterialIndex(api, IFC, modelID);

  report('Indexando cantidades (IfcElementQuantity)...', 50);
  const quantityIndex = buildQuantityIndex(api, IFC, modelID);
  const hasQSets = quantityIndex.size > 0;
  if (!hasQSets) {
    warnings.push('El modelo no contiene IfcElementQuantity. Las cantidades se estimarán.');
  }

  const ELEMENT_TYPES_CONFIG = [
    { type: IFC.IFCWALL, label: 'Muro' },
    { type: IFC.IFCWALLSTANDARDCASE, label: 'Muro' },
    { type: IFC.IFCSLAB, label: 'Losa' },
    { type: IFC.IFCCOLUMN, label: 'Columna' },
    { type: IFC.IFCBEAM, label: 'Viga' },
    { type: IFC.IFCFOOTING, label: 'Cimiento' },
    { type: IFC.IFCPILE, label: 'Pilote' },
    { type: IFC.IFCROOF, label: 'Cubierta' },
    { type: IFC.IFCSTAIR, label: 'Escalera' },
    { type: IFC.IFCSTAIRFLIGHT, label: 'Tramo Escalera' },
    { type: IFC.IFCRAMP, label: 'Rampa' },
    { type: IFC.IFCDOOR, label: 'Puerta' },
    { type: IFC.IFCWINDOW, label: 'Ventana' },
    { type: IFC.IFCCOVERING, label: 'Revestimiento' },
    { type: IFC.IFCMEMBER, label: 'Miembro Estructural' },
    { type: IFC.IFCPLATE, label: 'Placa' },
  ];

  const matMap = new Map();
  let rawElementCount = 0;
  const totalTypes = ELEMENT_TYPES_CONFIG.length;

  for (let tIndex = 0; tIndex < totalTypes; tIndex++) {
    const typeConf = ELEMENT_TYPES_CONFIG[tIndex];
    report('Analizando: ' + typeConf.label + '...', 55 + Math.floor((tIndex / totalTypes) * 35));

    let ids = null;
    try { ids = api.GetLineIDsWithType(modelID, typeConf.type); } catch(e) { continue; }
    if (!ids) continue;

    const count = ids.size();
    rawElementCount += count;

    for (let i = 0; i < count; i++) {
      const eid = ids.get(i);
      const matData = materialIndex.get(eid) || { name: 'Sin Material', thickness: 0 };
      let vol = 0, area = 0, len = 0, estimated = false;
      const qData = quantityIndex.get(eid);
      if (qData) {
        vol = qData.vol; area = qData.area; len = qData.len;
      } else {
        estimated = true;
        if (matData.thickness > 0) { area = 1; }
      }
      const key = matData.name + '|||' + typeConf.label;
      if (matMap.has(key)) {
        const ex = matMap.get(key);
        ex.volume += vol; ex.area += area; ex.length += len; ex.count += 1;
        if (!estimated) ex.estimatedFromGeometry = false;
      } else {
        matMap.set(key, {
          materialName: matData.name, volume: vol, area: area, length: len,
          elementType: typeConf.label, ifcType: String(typeConf.type), count: 1,
          thickness: matData.thickness, estimatedFromGeometry: estimated,
        });
      }
    }
  }

  report('Consolidando resultados...', 92);
  api.CloseModel(modelID);

  const materialQuantities = [];
  matMap.forEach(function(mq) {
    if (mq.estimatedFromGeometry && mq.thickness > 0) {
      const estArea = mq.count * 4;
      materialQuantities.push(Object.assign({}, mq, { area: estArea, volume: estArea * mq.thickness }));
    } else if (mq.estimatedFromGeometry) {
      materialQuantities.push(Object.assign({}, mq, { area: mq.count * 2 }));
    } else {
      materialQuantities.push(mq);
    }
  });
  materialQuantities.sort(function(a, b) { return (b.volume || b.area) - (a.volume || a.area); });

  report('¡Análisis completado!', 100);
  self.postMessage({
    type: 'result',
    data: {
      projectName: projectName,
      projectDescription: projectDescription,
      location: location,
      materialQuantities: materialQuantities.filter(function(m) { return m.count > 0; }),
      rawElementCount: rawElementCount,
      parsingWarnings: warnings,
      quantitySource: hasQSets ? 'IfcElementQuantity' : 'Estimated',
    }
  });
}

// ─── Receptor del mensaje del hilo principal ───────────────────────────────────

self.onmessage = function(event) {
  if (event.data && event.data.type === 'parse') {
    try {
      // importScripts carga el IIFE y pone WebIFC en self.WebIFC
      self.importScripts(event.data.iifeUrl);
    } catch(e) {
      self.postMessage({ type: 'error', message: 'No se pudo cargar web-ifc IIFE: ' + String(e) });
      return;
    }
    runParse(event.data.buffer, event.data.wasmBaseUrl).catch(function(err) {
      self.postMessage({ type: 'error', message: String(err) });
    });
  }
};
`;

// ─── Función pública: lanza el worker y devuelve Promise ─────────────────────

export async function parseIFCFile(
  file: File,
  onProgress?: (step: string, percent: number) => void
): Promise<ParsedIFCData> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    const cleanup = () => {
      URL.revokeObjectURL(workerUrl);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.step, msg.pct);
      } else if (msg.type === 'result') {
        cleanup();
        resolve(msg.data as ParsedIFCData);
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (err: ErrorEvent) => {
      cleanup();
      const detail = err?.message || 'Error desconocido en Worker';
      reject(new Error('Worker IFC: ' + detail));
    };

    file.arrayBuffer().then((buffer) => {
      const origin = window.location.origin;
      worker.postMessage({
        type: 'parse',
        buffer,
        wasmBaseUrl: origin + '/',
        iifeUrl: origin + '/web-ifc-api-iife.js',
      }, [buffer]);
    }).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}
