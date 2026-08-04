const { pool } = require('./db');
const bcrypt = require('bcryptjs');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ledger (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'adjustment')),
        coin TEXT NOT NULL,
        amount NUMERIC NOT NULL CHECK (amount > 0),
        note TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        coin TEXT NOT NULL,
        amount NUMERIC NOT NULL CHECK (amount > 0),
        destination_address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        resolved_by TEXT,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger(user_id);
    `);

    // Seed a default admin if none exists yet, so the panel is reachable on first boot.
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM admins');
    if (rows[0].count === 0) {
      const defaultUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
      const defaultPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme123';
      const hash = await bcrypt.hash(defaultPassword, 10);
      await client.query(
        'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
        [defaultUsername, hash]
      );
      console.log(`Seeded default admin "${defaultUsername}". CHANGE THIS PASSWORD IMMEDIATELY.`);
    }

    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
