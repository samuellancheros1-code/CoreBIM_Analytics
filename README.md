# 🏗️ CoreBIM Analytics

> **Plataforma de análisis BIM 4D/5D** — Transforma modelos IFC en presupuestos, cronogramas probabilísticos y mapas georreferenciados, de forma automática y en segundos.

---

## 🚀 ¿Qué hace esta aplicación?

CoreBIM Analytics toma un archivo `.ifc` (estándar universal de modelos BIM) y automáticamente:

1. **Extrae** materiales, cantidades y propiedades de todos los elementos IFC
2. **Genera** un presupuesto completo con APUs (Análisis de Precios Unitarios) según el estándar SICE/IDU Colombia 2024
3. **Ubica** el proyecto en un mapa interactivo usando las coordenadas del `IfcSite` (incluyendo su GUID)
4. **Proyecta** el cronograma con simulación PERT y distribución probabilística de cumplimiento (Curva S)
5. **Alerta** sobre desviaciones en el cronograma y su impacto económico proyectado en COP
6. **Exporta** todo a Excel profesional multi-pestaña con un clic

---

## 🧩 Vistas Principales (Menú A-Z)

| Vista | Descripción |
|---|---|
| **APUs** | Desglose completo de cada Análisis de Precios Unitarios |
| **Dashboard** | KPIs, distribución de costos (COP), top partidas, resumen financiero |
| **Dataset** | Exportación JSON del modelo completo (IFC → APU → JSON) |
| **Elementos** | Inventario IFC agrupado por tipo de elemento con PropertySets |
| **Presupuesto y 4D** | Tabla de presupuesto general + Curva S probabilística + Alertas Tempranas |
| **Ubicación** | Mapa interactivo Leaflet con coordenadas del `IfcSite` (incluye GUID) |
| **Visor 3D** | Renderizado IFC en Three.js con selección de elementos |

---

## 📐 Arquitectura Técnica

```
Archivo .IFC
     │
     ▼
ifcParser.ts  ──►  web-ifc (WASM WebWorker)
     │              Extrae: materiales, cantidades, IfcSite GUID, coordenadas
     ▼
apuEngine.ts  ──►  Clasifica materiales → APUs SICE 2024
     │              Calcula: CD + AIU (28%) = Precio Total en COP
     ▼
bimEngine.ts  ──►  Simulación PERT por tarea (Optimista / Probable / Pesimista)
     │              Genera: Curva S, varianza, alertas de desviación
     ▼
App.tsx       ──►  React + Vite + Recharts + Leaflet + Three.js
     │              7 vistas, menú A-Z, exportación Excel
     ▼
N8N Workflows ──►  Automatización: Alerta de Obra, IFC Upload Pipeline,
                   BIM Orchestrator, IFC Analysis
```

---

## ⚙️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Análisis IFC | `web-ifc` v0.0.77 (WebAssembly) |
| Visualización 3D | Three.js |
| Mapas | Leaflet + CartoDB Dark Matter |
| Gráficos | Recharts |
| Animaciones | Framer Motion |
| Automatización | N8N (local) |
| Exportación | ExcelJS |
| Estándar BIM | IFC 4.3 — buildingSMART International |
| Precios | SICE — Ministerio de Transporte Colombia, 2024 |

---

## 📦 Correr localmente

**Requisitos:** Node.js 18+

```bash
# 1. Clonar el repositorio
git clone https://github.com/samuellancheros1-code/CoreBIM_Analytics.git
cd CoreBIM_Analytics

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus claves si es necesario

# 4. Iniciar la aplicación
npm run dev
# → Abre http://localhost:3000
```

> Para instrucciones detalladas de N8N y scripts de administración, ver [`SETUP_LOCAL.md`](SETUP_LOCAL.md)

---

## 🔄 Últimas Actualizaciones

### `feat: Fase 2 Control 4D + mejoras UI/UX` *(Mayo 2026)*
- ✅ **Control 4D integrado**: Curva S probabilística con 3 escenarios de riesgo
- ✅ **Alertas Tempranas automáticas**: Detecta desviaciones y calcula impacto en COP
- ✅ **IfcSite GUID**: Extraído desde `ifcParser.ts` y visible en la vista de Ubicación
- ✅ **Menú reorganizado A-Z** para navegación más intuitiva
- ✅ **Elementos agrupados por tipo**: Acordeones por `IfcWall`, `IfcSlab`, etc.
- ✅ **Moneda COP explícita** en todos los valores monetarios
- ✅ **Vista fusionada "Presupuesto y 4D"**: relación directa entre costos y cronograma

### `deploy: preparar app para Vercel` *(Mayo 2026)*
- ✅ Configuración de despliegue en Vercel + Netlify

### `feat: integración skill de localización y Visor 3D` *(Mayo 2026)*
- ✅ Extracción de coordenadas IFC (DMS → Decimal WGS84)
- ✅ Integración de Leaflet con modo oscuro (CartoDB)
- ✅ Visor 3D con Three.js y selección de elementos por GlobalID

---

## 🤖 Workflows N8N

| Workflow | Función |
|---|---|
| **BIM Orchestrator** | Demo educativa del flujo BIM completo con IA |
| **IFC Analysis** | Análisis IFC → Generación automática de PDF |
| **Alerta de Obra** | Recibe alertas → resalta elemento en Visor 3D |
| **IFC Upload Pipeline** | Subida, validación y procesamiento automático |

---

## 👥 Equipo

Proyecto desarrollado por el equipo **CoreBIM · Naska Digital 2025-2026**

*Stack: React · TypeScript · Vite · web-ifc WASM · Three.js · Leaflet · Recharts · N8N*
*Estándar: IFC 4.3 – buildingSMART International · Precios: SICE MinTransporte Colombia 2024*
