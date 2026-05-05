/**
 * Resetea la contraseña del owner de N8N directamente en la DB
 * Usa bcrypt de los módulos de n8n para hacer el hash correcto
 */
const sqlite3 = require('C:\\Users\\samue\\AppData\\Roaming\\npm\\node_modules\\n8n\\node_modules\\sqlite3');
const bcrypt = require('C:\\Users\\samue\\AppData\\Roaming\\npm\\node_modules\\n8n\\node_modules\\bcryptjs');

const DB_PATH = 'C:\\Users\\samue\\.n8n\\database.sqlite';
const USER_ID = '60c5c7f7-389d-421b-b254-423aa05a2841';
const NEW_PASSWORD = 'CoreBIM2024!';

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, async (err) => {
  if (err) { console.error('Error DB:', err.message); process.exit(1); }

  try {
    // Hashear la nueva contraseña con bcrypt (salt=10, igual que N8N)
    const hash = await bcrypt.hash(NEW_PASSWORD, 10);
    console.log('Nuevo hash generado:', hash.substring(0, 20) + '...');

    const now = new Date().toISOString();
    db.run(
      'UPDATE user SET password = ?, updatedAt = ? WHERE id = ?',
      [hash, now, USER_ID],
      function(err2) {
        if (err2) {
          console.error('Error UPDATE:', err2.message);
        } else if (this.changes === 0) {
          console.log('⚠️ No se actualizó ningún registro. Verificando ID...');
          db.all('SELECT id, email FROM user', [], (e, rows) => {
            console.log('Usuarios en DB:', JSON.stringify(rows));
            db.close();
          });
        } else {
          console.log('\n✅ CONTRASEÑA ACTUALIZADA EXITOSAMENTE');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('Email:     admin@local.com');
          console.log('Password:  CoreBIM2024!');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('\nAhora puedes hacer login en http://localhost:5678');
          db.close();
        }
      }
    );
  } catch(e) {
    console.error('Error bcrypt:', e.message);
    
    // Intentar con bcrypt normal si bcryptjs no está
    try {
      const bcrypt2 = require('C:\\Users\\samue\\AppData\\Roaming\\npm\\node_modules\\n8n\\node_modules\\bcrypt');
      const hash2 = await bcrypt2.hash(NEW_PASSWORD, 10);
      db.run('UPDATE user SET password = ? WHERE id = ?', [hash2, USER_ID], function(err3) {
        console.log(err3 ? 'Error:' + err3.message : '✅ Contraseña actualizada con bcrypt');
        db.close();
      });
    } catch(e2) {
      console.log('bcrypt también falla:', e2.message);
      db.close();
    }
  }
});
