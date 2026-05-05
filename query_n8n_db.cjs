/**
 * Lee la base de datos SQLite de N8N para obtener usuarios y crear API Key
 */
try {
  const Database = require('better-sqlite3');
  const db = new Database('C:\\Users\\samue\\.n8n\\database.sqlite', { readonly: true });
  
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tablas:', tables.map(t => t.name).join(', '));
  
  // Obtener usuarios
  try {
    const users = db.prepare('SELECT id, email, "firstName", "lastName", role FROM "user" LIMIT 5').all();
    console.log('\nUsuarios:', JSON.stringify(users, null, 2));
  } catch(e) { console.log('Error users:', e.message); }
  
  // Obtener API keys
  try {
    const keys = db.prepare('SELECT * FROM api_key LIMIT 5').all();
    console.log('\nAPI Keys:', JSON.stringify(keys, null, 2));
  } catch(e) { console.log('No api_key table:', e.message); }
  
  db.close();
} catch(e) {
  console.log('better-sqlite3 no disponible:', e.message);
  
  // Intentar con el módulo n8n interno
  console.log('\nBuscando módulo sqlite en node_modules global de n8n...');
  const { execSync } = require('child_process');
  try {
    const n8nPath = execSync('cmd /c "where n8n"', { encoding: 'utf8' }).trim();
    console.log('n8n en:', n8nPath);
  } catch(e2) { console.log(e2.message); }
}
