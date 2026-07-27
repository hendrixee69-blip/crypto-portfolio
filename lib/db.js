const { Pool } = require('pg');

// Railway injects DATABASE_URL automatically when you attach a Postgres plugin.
// Locally, set it in .env.local (see .env.example).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = { pool };
