/**
 * ifcParser.ts - Motor de análisis IFC v4 (IFC 4.3 completo)
 * ──────────────────────────────────────────────────────────────────────────────
 * Extrae: materiales, cantidades (QTO), PropertySets (Pset_*) y datos de tipo.
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

// ─── Nuevas interfaces IFC 4.3 ────────────────────────────────────────────────

export interface IFCPropertyValue {
  name: string;
  value: string | number | boolean | null;
  unit?: string;
}

export interface IFCPropertySetData {
  psetName: string;       // e.g. "Pset_WallCommon", "Qto_WallBaseQuantities"
  psetType: 'Pset' | 'Qto' | 'TypePset';
  properties: IFCPropertyValue[];
}

export interface IFCElementData {
  expressId: number;
  globalId: string;
  ifcTypeName: string;    // e.g. "IFCWALL"
  elementLabel: string;   // IFC type human label e.g. "Muro"
  name: string;
  description: string;
  objectType: string;
  tag: string;
  materialName: string;
  propertySets: IFCPropertySetData[];
  quantities: {
    volume: number;
    area: number;
    length: number;
    weight: number;
    count: number;
  };
}

export interface ParsedIFCData {
  projectName: string;
  projectDescription: string;
  location: ProjectLocation;
  materialQuantities: MaterialQuantity[];
  elements: IFCElementData[];
  availablePsets: string[];
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

// ─── buildPropertyIndex: lee todos IfcPropertySet e IfcElementQuantity por elemento ───
function buildPropertyIndex(api, IFC, modelID) {
  var index = new Map();
  try {
    var relIds = api.GetLineIDsWithType(modelID, IFC.IFCRELDEFINESBYPROPERTIES);
    for (var i = 0; i < relIds.size(); i++) {
      try {
        var rel = api.GetLine(modelID, relIds.get(i), true);
        if (!rel || !rel.RelatedObjects || !rel.RelatingPropertyDefinition) continue;
        var pd = api.GetLine(modelID, rel.RelatingPropertyDefinition.value, true);
        if (!pd) continue;
        var psetData = null;
        if (pd.type === IFC.IFCPROPERTYSET) {
          var psetName = (pd.Name && pd.Name.value) || 'Pset_Sin_Nombre';
          var props = [];
          if (pd.HasProperties) {
            var hasProps = Array.isArray(pd.HasProperties) ? pd.HasProperties : [pd.HasProperties];
            for (var j = 0; j < hasProps.length; j++) {
              try {
                var prop = api.GetLine(modelID, hasProps[j].value, true);
                if (!prop) continue;
                var propName = (prop.Name && prop.Name.value) || '';
                var propValue = null;
                if (prop.type === IFC.IFCPROPERTYSINGLEVALUE && prop.NominalValue != null) {
                  propValue = prop.NominalValue.value;
                } else if (prop.type === IFC.IFCPROPERTYENUMERATEDVALUE && prop.EnumerationValues) {
                  var evals = Array.isArray(prop.EnumerationValues) ? prop.EnumerationValues : [prop.EnumerationValues];
                  propValue = evals.map(function(v) { return v && v.value; }).filter(Boolean).join(', ');
                } else if (prop.type === IFC.IFCPROPERTYLISTVALUE && prop.ListValues) {
                  var lvals = Array.isArray(prop.ListValues) ? prop.ListValues : [prop.ListValues];
                  propValue = lvals.map(function(v) { return v && v.value; }).filter(Boolean).join(', ');
                } else if (prop.type === IFC.IFCPROPERTYBOUNDEDVALUE) {
                  var lo = prop.LowerBoundValue && prop.LowerBoundValue.value;
                  var hi = prop.UpperBoundValue && prop.UpperBoundValue.value;
                  propValue = (lo != null && hi != null) ? (lo + ' - ' + hi) : (lo != null ? lo : hi);
                }
                if (propName) props.push({ name: propName, value: propValue });
              } catch(e2) {}
            }
          }
          psetData = { psetName: psetName, psetType: 'Pset', properties: props };
        } else if (pd.type === IFC.IFCELEMENTQUANTITY) {
          var qtoName = (pd.Name && pd.Name.value) || 'Qto_Sin_Nombre';
          var qprops = [];
          if (pd.Quantities) {
            var qs = Array.isArray(pd.Quantities) ? pd.Quantities : [pd.Quantities];
            for (var k = 0; k < qs.length; k++) {
              try {
                var q = api.GetLine(modelID, qs[k].value, true);
                if (!q) continue;
                var qName = (q.Name && q.Name.value) || '';
                var qValue = null; var qUnit = '';
                if (q.type === IFC.IFCQUANTITYVOLUME && q.VolumeValue) { qValue = Math.abs(q.VolumeValue.value || 0); qUnit = 'm³'; }
                else if (q.type === IFC.IFCQUANTITYAREA && q.AreaValue) { qValue = Math.abs(q.AreaValue.value || 0); qUnit = 'm²'; }
                else if (q.type === IFC.IFCQUANTITYLENGTH && q.LengthValue) { qValue = Math.abs(q.LengthValue.value || 0); qUnit = 'm'; }
                else if (q.type === IFC.IFCQUANTITYWEIGHT && q.WeightValue) { qValue = Math.abs(q.WeightValue.value || 0); qUnit = 'kg'; }
                else if (q.type === IFC.IFCQUANTITYCOUNT && q.CountValue) { qValue = q.CountValue.value; qUnit = 'un'; }
                else if (q.type === IFC.IFCQUANTITYTIME && q.TimeValue) { qValue = q.TimeValue.value; qUnit = 'h'; }
                if (qName) qprops.push({ name: qName, value: qValue, unit: qUnit });
              } catch(e3) {}
            }
          }
          psetData = { psetName: qtoName, psetType: 'Qto', properties: qprops };
        }
        if (psetData) {
          var related = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
          for (var r = 0; r < related.length; r++) {
            if (!related[r] || related[r].value == null) continue;
            if (!index.has(related[r].value)) index.set(related[r].value, []);
            index.get(related[r].value).push(psetData);
          }
        }
      } catch(e) {}
    }
  } catch(e) {}
  return index;
}

// ─── buildTypePropertyIndex: propiedades heredadas del IfcTypeObject ───
function buildTypePropertyIndex(api, IFC, modelID) {
  var index = new Map();
  try {
    var relIds = api.GetLineIDsWithType(modelID, IFC.IFCRELDEFINESBYTYPE);
    for (var i = 0; i < relIds.size(); i++) {
      try {
        var rel = api.GetLine(modelID, relIds.get(i), true);
        if (!rel || !rel.RelatedObjects || !rel.RelatingType) continue;
        var typeObj = api.GetLine(modelID, rel.RelatingType.value, true);
        if (!typeObj || !typeObj.HasPropertySets) continue;
        var typePsetsRefs = Array.isArray(typeObj.HasPropertySets) ? typeObj.HasPropertySets : [typeObj.HasPropertySets];
        var psetDataList = [];
        for (var p = 0; p < typePsetsRefs.length; p++) {
          try {
            var pd = api.GetLine(modelID, typePsetsRefs[p].value, true);
            if (!pd || !pd.HasProperties) continue;
            var psetName = ((pd.Name && pd.Name.value) || 'TypePset') + ' (Tipo)';
            var props = [];
            var hasProps = Array.isArray(pd.HasProperties) ? pd.HasProperties : [pd.HasProperties];
            for (var j = 0; j < hasProps.length; j++) {
              try {
                var prop = api.GetLine(modelID, hasProps[j].value, true);
                if (!prop) continue;
                var propName = (prop.Name && prop.Name.value) || '';
                var propValue = null;
                if (prop.type === IFC.IFCPROPERTYSINGLEVALUE && prop.NominalValue != null) {
                  propValue = prop.NominalValue.value;
                }
                if (propName) props.push({ name: propName, value: propValue });
              } catch(e2) {}
            }
            if (props.length > 0) psetDataList.push({ psetName: psetName, psetType: 'TypePset', properties: props });
          } catch(e) {}
        }
        if (psetDataList.length > 0) {
          var related = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
          for (var r = 0; r < related.length; r++) {
            if (!related[r] || related[r].value == null) continue;
            if (!index.has(related[r].value)) index.set(related[r].value, []);
            for (var d = 0; d < psetDataList.length; d++) index.get(related[r].value).push(psetDataList[d]);
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

  report('Indexando materiales...', 38);
  const materialIndex = buildMaterialIndex(api, IFC, modelID);

  report('Indexando cantidades (IfcElementQuantity)...', 44);
  const quantityIndex = buildQuantityIndex(api, IFC, modelID);
  const hasQSets = quantityIndex.size > 0;
  if (!hasQSets) {
    warnings.push('El modelo no contiene IfcElementQuantity. Las cantidades se estimarán.');
  }

  report('Indexando PropertySets (Pset_*)...', 50);
  const propertyIndex = buildPropertyIndex(api, IFC, modelID);

  report('Indexando propiedades de tipo (IfcTypeObject)...', 56);
  const typePropertyIndex = buildTypePropertyIndex(api, IFC, modelID);

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
  const elements = [];
  const psetNamesSet = new Set();
  let rawElementCount = 0;
  const totalTypes = ELEMENT_TYPES_CONFIG.length;

  for (let tIndex = 0; tIndex < totalTypes; tIndex++) {
    const typeConf = ELEMENT_TYPES_CONFIG[tIndex];
    report('Analizando: ' + typeConf.label + '...', 60 + Math.floor((tIndex / totalTypes) * 32));

    let ids = null;
    try { ids = api.GetLineIDsWithType(modelID, typeConf.type); } catch(e) { continue; }
    if (!ids) continue;

    const count = ids.size();
    rawElementCount += count;

    for (let i = 0; i < count; i++) {
      const eid = ids.get(i);
      const matData = materialIndex.get(eid) || { name: 'Sin Material', thickness: 0 };
      let vol = 0, area = 0, len = 0, wgt = 0, cnt = 0, estimated = false;
      const qData = quantityIndex.get(eid);
      if (qData) {
        vol = qData.vol; area = qData.area; len = qData.len;
      } else {
        estimated = true;
        if (matData.thickness > 0) { area = 1; }
      }

      // Propiedades del elemento
      let elemGlobalId = '', elemName = '', elemDesc = '', elemObjType = '', elemTag = '';
      try {
        const line = api.GetLine(modelID, eid, true);
        if (line) {
          elemGlobalId = (line.GlobalId && line.GlobalId.value) || '';
          elemName = (line.Name && line.Name.value) || '';
          elemDesc = (line.Description && line.Description.value) || '';
          elemObjType = (line.ObjectType && line.ObjectType.value) || '';
          elemTag = (line.Tag && line.Tag.value) || '';
        }
      } catch(e) {}

      // Recopilar PSets: del elemento + del tipo
      const elemPsets = [];
      const ownPsets = propertyIndex.get(eid) || [];
      const typePsets = typePropertyIndex.get(eid) || [];
      const allPsets = ownPsets.concat(typePsets);
      for (let p = 0; p < allPsets.length; p++) {
        elemPsets.push(allPsets[p]);
        psetNamesSet.add(allPsets[p].psetName);
        // Acumular cantidades desde QTO psets
        if (allPsets[p].psetType === 'Qto') {
          for (let pp = 0; pp < allPsets[p].properties.length; pp++) {
            const pr = allPsets[p].properties[pp];
            if (pr.unit === 'm³' && pr.value) vol = Math.max(vol, Math.abs(Number(pr.value)));
            if (pr.unit === 'm²' && pr.value) area = Math.max(area, Math.abs(Number(pr.value)));
            if (pr.unit === 'm' && pr.value) len = Math.max(len, Math.abs(Number(pr.value)));
            if (pr.unit === 'kg' && pr.value) wgt += Math.abs(Number(pr.value));
            if (pr.unit === 'un' && pr.value) cnt += Math.abs(Number(pr.value));
          }
        }
      }

      elements.push({
        expressId: eid,
        globalId: elemGlobalId,
        ifcTypeName: String(typeConf.type),
        elementLabel: typeConf.label,
        name: elemName,
        description: elemDesc,
        objectType: elemObjType,
        tag: elemTag,
        materialName: matData.name,
        propertySets: elemPsets,
        quantities: { volume: vol, area: area, length: len, weight: wgt, count: cnt },
      });

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

  const availablePsets = [];
  psetNamesSet.forEach(function(n) { availablePsets.push(n); });
  availablePsets.sort();

  report('¡Análisis completado!', 100);
  self.postMessage({
    type: 'result',
    data: {
      projectName: projectName,
      projectDescription: projectDescription,
      location: location,
      materialQuantities: materialQuantities.filter(function(m) { return m.count > 0; }),
      elements: elements,
      availablePsets: availablePsets,
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
