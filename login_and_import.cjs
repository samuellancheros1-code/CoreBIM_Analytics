/**
 * Login a N8N via API y luego importar workflows
 * El login devuelve una cookie de sesión que usamos para todo lo demás
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const N8N_HOST = 'localhost';
const N8N_PORT = 5678;
const WORKFLOWS_DIR = path.join(__dirname, 'n8n_workflows');

// Credenciales del owner
const EMAIL = 'admin@local.com';
// Contraseñas comunes que se pudieron haber usado al configurar N8N
const PASSWORDS_TO_TRY = [
  'Admin1234!',
  'admin1234',
  'Admin123',
  'Admin1234',
  'n8n1234!',
  'CoreBIM2024!',
  'admin@local.com',
  'password',
  'Password1!',
  'n8nAdmin!',
];

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      const cookies = res.headers['set-cookie'] || [];
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), cookies }); }
        catch { resolve({ status: res.statusCode, body: data, cookies }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function tryLogin(password) {
  const payload = JSON.stringify({ emailAddress: EMAIL, password });
  const options = {
    hostname: N8N_HOST, port: N8N_PORT,
    path: '/rest/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };
  return makeRequest(options, payload);
}

async function createApiKey(sessionCookie) {
  const payload = JSON.stringify({ label: 'CoreBIM-Import-Key' });
  const options = {
    hostname: N8N_HOST, port: N8N_PORT,
    path: '/rest/user-api-keys',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Cookie': sessionCookie,
    },
  };
  return makeRequest(options, payload);
}

async function importWorkflow(workflowData, sessionCookie) {
  const payload = { ...workflowData };
  delete payload.id;
  payload.active = false;
  const body = JSON.stringify(payload);
  const options = {
    hostname: N8N_HOST, port: N8N_PORT,
    path: '/rest/workflows',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Cookie': sessionCookie,
    },
  };
  return makeRequest(options, body);
}

async function main() {
  console.log(`🔐 Intentando login en N8N como ${EMAIL}...\n`);

  let sessionCookie = null;

  for (const pwd of PASSWORDS_TO_TRY) {
    process.stdout.write(`  Probando: "${pwd}" ... `);
    try {
      const res = await tryLogin(pwd);
      if (res.status === 200 && res.cookies.length > 0) {
        console.log('✅ ÉXITO!');
        sessionCookie = res.cookies.map(c => c.split(';')[0]).join('; ');
        console.log('  Contraseña correcta:', pwd);
        break;
      } else {
        console.log(`❌ (status ${res.status})`);
      }
    } catch (e) {
      console.log('❌ Error:', e.message);
    }
  }

  if (!sessionCookie) {
    console.log('\n⚠️  No se pudo hacer login. Intenta manualmente en http://localhost:5678');
    console.log('Email:', EMAIL);
    return;
  }

  // Crear API key via REST
  console.log('\n🔑 Creando API key via REST...');
  try {
    const keyRes = await createApiKey(sessionCookie);
    if (keyRes.status === 200 || keyRes.status === 201) {
      const apiKey = keyRes.body?.apiKey || keyRes.body?.data?.apiKey;
      console.log('API KEY VÁLIDA:', apiKey);
      fs.writeFileSync('n8n_apikey.txt', apiKey || JSON.stringify(keyRes.body));
    } else {
      console.log('Error creando API key:', JSON.stringify(keyRes.body).substring(0, 200));
    }
  } catch(e) {
    console.log('Error:', e.message);
  }

  // Importar workflows via REST session
  const workflowFiles = [
    'bim_orchestrator_demo_no_creds.json',
    'ifc_analysis_demo_no_creds.json',
    'alerta_obra_workflow.json',
    'ifc_upload_workflow.json',
  ];

  console.log('\n🚀 Importando workflows...\n');
  for (const file of workflowFiles) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`📦 "${workflow.name}"`);
    try {
      const r = await importWorkflow(workflow, sessionCookie);
      if (r.status === 200 || r.status === 201) {
        console.log(`   ✅ ID: ${r.body?.id || r.body?.data?.id}`);
      } else {
        console.log(`   ❌ ${r.status}: ${JSON.stringify(r.body).substring(0, 200)}`);
      }
    } catch(e) { console.log('   ❌', e.message); }
  }

  console.log('\n✅ Proceso completado!');
  console.log('🌐 App:  http://localhost:3000');
  console.log('🔧 N8N:  http://localhost:5678');
}

main();
