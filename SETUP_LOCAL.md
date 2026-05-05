# 🏗️ CoreBIM Analytics — Guía de Setup Local

Este documento explica cómo levantar el entorno completo desde cero: **App React + N8N Workflows**.

---

## ✅ Pre-requisitos

- Node.js v18+ instalado
- N8N instalado globalmente: `npm install -g n8n`
- Git

---

## 🚀 Paso 1 — Clonar y configurar el proyecto

```bash
git clone https://github.com/samuellancheros1-code/CoreBIM_Analytics.git
cd CoreBIM_Analytics

# Crear el .env desde el ejemplo
copy .env.example .env   # Windows
# cp .env.example .env   # Mac/Linux

# Instalar dependencias
npm install
```

---

## 🖥️ Paso 2 — Levantar la aplicación React

```bash
npm run dev
```

La app estará disponible en: **http://localhost:3000**

---

## 🔧 Paso 3 — Levantar N8N

```bash
n8n start
```

N8N estará disponible en: **http://localhost:5678**

> La primera vez que ejecutes N8N, te pedirá crear un usuario owner.
> Usa: `admin@local.com` / `CoreBIM2024!`

---

## 🔑 Paso 4 — Configurar acceso a N8N (si ya existía una cuenta)

Si N8N ya tiene una cuenta configurada y no recuerdas la contraseña, 
usa el script de reset de contraseña:

```bash
# Asegúrate de que N8N NO esté corriendo antes de ejecutar esto
node reset_n8n_password.cjs
```

Esto establece la contraseña a: `CoreBIM2024!`

Luego reinicia N8N:
```bash
n8n start
```

---

## 📦 Paso 5 — Importar los Workflows de N8N

Con N8N corriendo en `localhost:5678`, ejecuta:

```bash
node login_and_import.cjs
```

Este script:
1. Hace login automático con `admin@local.com` / `CoreBIM2024!`
2. Importa los 4 workflows del directorio `n8n_workflows/`
3. Genera una API Key y la guarda en `n8n_apikey.txt` (ignorado por git)

### Workflows que se importan:
| Archivo | Descripción |
|---|---|
| `bim_orchestrator_demo_no_creds.json` | Demo educativa del flujo BIM completo (sin credenciales externas) |
| `ifc_analysis_demo_no_creds.json` | Análisis IFC → PDF (demo sin API keys) |
| `alerta_obra_workflow.json` | Webhook para alertas de obra con geolocalización |
| `ifc_upload_workflow.json` | Pipeline completo de subida y validación de archivos IFC |

---

## 🛠️ Scripts de utilidad disponibles

| Script | Propósito |
|---|---|
| `reset_n8n_password.cjs` | Resetea la contraseña del owner de N8N a `CoreBIM2024!` |
| `create_n8n_apikey.cjs` | Crea una API Key de N8N directamente en la base de datos |
| `login_and_import.cjs` | Login automático + importación de todos los workflows |
| `import_workflows.cjs` | Importa workflows usando una API Key existente |
| `query_n8n_db.cjs` | Consulta la base de datos SQLite de N8N (diagnóstico) |
| `read_user.cjs` | Lee los datos del usuario owner de N8N |

> ⚠️ **NOTA:** Los scripts que acceden a la DB de N8N requieren que N8N esté **DETENIDO** para evitar conflictos de escritura.

---

## 📁 Estructura del proyecto

```
CoreBIM_Analytics/
├── src/
│   ├── App.tsx              # Componente principal de la app
│   ├── components/
│   │   └── IFCViewer3D.tsx  # Visor 3D de archivos IFC
│   └── lib/
│       ├── ifcParser.ts     # Parser de archivos IFC
│       ├── apuEngine.ts     # Motor de APUs (precios unitarios)
│       ├── bimEngine.ts     # Motor BIM principal
│       ├── excelExporter.ts # Exportador a Excel
│       └── ifcWorker.ts     # Web Worker para procesamiento IFC
├── n8n_workflows/           # Workflows de N8N listos para importar
├── public/                  # Assets estáticos
├── .env.example             # Variables de entorno requeridas
└── SETUP_LOCAL.md           # Este archivo
```

---

## 🌐 URLs del ecosistema

| Servicio | URL | Descripción |
|---|---|---|
| App CoreBIM | http://localhost:3000 | Interfaz principal React/Vite |
| N8N Editor | http://localhost:5678 | Editor de workflows |
| N8N Webhook IFC | http://localhost:5678/webhook/ifc-upload | Endpoint para subir archivos IFC |
| N8N Webhook Alertas | http://localhost:5678/webhook/alerta-obra | Endpoint de alertas de obra |
