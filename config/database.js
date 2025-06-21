const { Pool } = require('pg');
const createMySQLAdapter = require('./database-mysql');

let pool;

// Détecter le type de base de données par l'URL
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('mysql://')) {
  // MySQL
  pool = createMySQLAdapter(process.env.DATABASE_URL);
  console.log('Using MySQL database');
} else {
  // PostgreSQL (par défaut)
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : false
  });
  console.log('Using PostgreSQL database');
}

// Events pour PostgreSQL seulement
if (pool.on) {
  pool.on('connect', () => {
    console.log('Connected to database');
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });
}

module.exports = pool;