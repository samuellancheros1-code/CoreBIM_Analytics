/**
 * Lee datos del usuario de la DB de N8N para entender el schema de contraseña
 */
const sqlite3 = require('C:\\Users\\samue\\AppData\\Roaming\\npm\\node_modules\\n8n\\node_modules\\sqlite3');

const DB_PATH = 'C:\\Users\\samue\\.n8n\\database.sqlite';
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) { console.error('Error:', err.message); process.exit(1); }
});

// Ver columnas de user
db.all("PRAGMA table_info('user')", [], (err, cols) => {
  console.log('Columnas de user:', cols.map(c => `${c.name}(${c.type})`).join('\n  '));
  
  // Leer todos los datos de usuario
  db.all('SELECT * FROM user', [], (err2, rows) => {
    if (err2) { console.error(err2.message); db.close(); return; }
    rows.forEach(r => {
      const copy = {...r};
      // Mostrar todo excepto truncar el hash de password
      if (copy.password) copy.password = copy.password.substring(0, 60) + '...';
      console.log('\nUsuario:', JSON.stringify(copy, null, 2));
    });
    
    // Ver columnas de user_api_keys con los datos insertados
    db.all('SELECT * FROM user_api_keys', [], (err3, keys) => {
      console.log('\nAPI Keys en DB:', JSON.stringify(keys, null, 2));
      db.close();
    });
  });
});
