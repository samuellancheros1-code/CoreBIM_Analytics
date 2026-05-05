/**
 * Crea API Key en N8N (tabla: user_api_keys) con campo audience
 */
const sqlite3 = require('C:\\Users\\samue\\AppData\\Roaming\\npm\\node_modules\\n8n\\node_modules\\sqlite3');
const crypto = require('crypto');

const DB_PATH = 'C:\\Users\\samue\\.n8n\\database.sqlite';
const USER_ID = '60c5c7f7-389d-421b-b254-423aa05a2841';
const USER_EMAIL = 'admin@local.com';

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
  if (err) { console.error('Error DB:', err.message); process.exit(1); }
});

// Ver si ya hay keys existentes
db.all('SELECT * FROM user_api_keys', [], (err, rows) => {
  if (rows && rows.length > 0) {
    console.log('\n🔑 API Keys ya existentes:');
    rows.forEach(r => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('API KEY:', r.apiKey);
      console.log('Label:  ', r.label);
      console.log('UserId: ', r.userId);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
    db.close();
    return;
  }

  const apiKey = 'n8n_api_' + crypto.randomBytes(24).toString('hex');
  const keyId = crypto.randomBytes(18).toString('hex');
  const now = new Date().toISOString();

  // audience = 'api' es el valor estándar que usa N8N internamente
  const sql = `INSERT INTO user_api_keys (id, userId, label, apiKey, createdAt, updatedAt, scopes, audience) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [keyId, USER_ID, 'CoreBIM-Key', apiKey, now, now, null, 'api'], function(err) {
    if (err) {
      console.error('Error INSERT:', err.message);
      // Intentar con audience vacío
      db.run(sql, [keyId + '2', USER_ID, 'CoreBIM-Key', apiKey, now, now, null, ''], function(err2) {
        if (err2) {
          console.error('Error con audience vacío:', err2.message);
        } else {
          console.log('\n✅ API KEY CREADA:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(apiKey);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
        db.close();
      });
      return;
    }
    console.log('\n✅ API KEY CREADA EXITOSAMENTE:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(apiKey);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Usuario:', USER_EMAIL);
    db.close();
  });
});
