const { Pool } = require('pg');

// Uses standard PG* env vars:
// PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT
// Optionally: PGSSL=true to enable SSL

function createPool() {
  const ssl = process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false;
  return new Pool({ ssl });
}

const pool = createPool();

module.exports = { pool };
