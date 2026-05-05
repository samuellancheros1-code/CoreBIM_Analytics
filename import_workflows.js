/**
 * Script para importar workflows a N8N via API REST
 * N8N debe estar corriendo en http://localhost:5678
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const N8N_BASE = 'http://localhost:5678';
const WORKFLOWS_DIR = path.join(__dirname, 'n8n_workflows');

// Archivos a importar
const workflowFiles = [
  'bim_orchestrator_demo_no_creds.json',
  'ifc_analysis_demo_no_creds.json',
  'alerta_obra_workflow.json',
  'ifc_upload_workflow.json',
];

function postWorkflow(workflowData) {
  return new Promise((resolve, reject) => {
    // Quitar el id para que N8N genere uno nuevo
    const payload = { ...workflowData };
    delete payload.id;
    // Asegurarse de que active sea false para no requerir credenciales
    payload.active = false;

    const body = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 5678,
      path: '/api/v1/workflows',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🚀 Importando workflows a N8N...\n');

  for (const file of workflowFiles) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  No encontrado: ${file}`);
      continue;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const workflow = JSON.parse(raw);

    console.log(`📦 Importando: "${workflow.name}"`);
    try {
      const result = await postWorkflow(workflow);
      if (result.status === 200 || result.status === 201) {
        const wf = result.body;
        console.log(`   ✅ Importado  | ID: ${wf.id} | Nombre: ${wf.name}`);
      } else {
        console.log(`   ❌ Error ${result.status}:`, JSON.stringify(result.body).substring(0, 200));
      }
    } catch (err) {
      console.log(`   ❌ Fallo conexión: ${err.message}`);
    }
  }

  console.log('\n✅ Proceso completado. Abre http://localhost:5678 para ver los workflows.');
}

main();
