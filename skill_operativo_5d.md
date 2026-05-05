# 🛠️ Skill Operativo: Estimación 5D por GlobalID

**Objetivo:** Habilitar al agente (Antigravity/BIM-Orchestrator) para leer el identificador único de un elemento IFC (`GlobalID`) y calcular automáticamente una propuesta de costo en tiempo real.

## 📋 Flujo de Ejecución (Skill)

1. **Recepción del GlobalID:** 
   El agente recibe una solicitud con el identificador del modelo (ej. `3O$8z1k311sQn_YQZJ_y$1`).

2. **Extracción de Propiedades (IFC Parsing):**
   - El agente localiza el elemento en el modelo IFC (ej. `IfcWall`).
   - Extrae el material asignado y la propiedad de medición clave del `IfcElementQuantity` (ej. `NetVolume` = 12.5 m³).

3. **Cálculo de Costo Propuesto (5D):**
   - El agente cruza el material/tipo de elemento con la Base de Precios Unitarios (BPU).
   - Ejecuta la operación: `Cantidad Base × Precio Unitario = Costo Propuesto`.

4. **Respuesta Estructurada:**
   El agente retorna el resultado listo para ser inyectado en el ERP o en una alerta de N8N.
   
   *Ejemplo de salida:*
   > "El elemento IfcWall (GlobalID: 3O$...) tiene un volumen de 12.5 m³. A $150/m³, el costo propuesto es de $1,875.00."
