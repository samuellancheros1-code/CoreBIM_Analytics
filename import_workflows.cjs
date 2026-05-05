/**
 * Importa todos los workflows a N8N via API REST con API Key
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const N8N_API_KEY = 'n8n_api_605358f00bc42dae7c32ab570d0739665ec0928f3460ff46';
const WORKFLOWS_DIR = path.join(__dirname, 'n8n_workflows');

const workflowFiles = [
  'bim_orchestrator_demo_no_creds.json',
  'ifc_analysis_demo_no_creds.json',
  'alerta_obra_workflow.json',
  'ifc_upload_workflow.json',
];

function postWorkflow(workflowData) {
  return new Promise((resolve, reject) => {
    const payload = { ...workflowData };
    delete payload.id;      // dejar que N8N genere el ID
    payload.active = false; // inactivo para no requerir credenciales

    const body = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 5678,
      path: '/api/v1/workflows',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-N8N-API-KEY': N8N_API_KEY,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
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

    const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`📦 Importando: "${workflow.name}"`);

    try {
      const result = await postWorkflow(workflow);
      if (result.status === 200 || result.status === 201) {
        const wf = result.body;
        console.log(`   ✅ ID: ${wf.id} | "${wf.name}"`);
      } else {
        console.log(`   ❌ Error ${result.status}:`, JSON.stringify(result.body).substring(0, 300));
      }
    } catch (err) {
      console.log(`   ❌ Fallo: ${err.message}`);
    }
  }

  console.log('\n🎯 Listo! Abre http://localhost:5678 para ver los workflows.');
}

main();
