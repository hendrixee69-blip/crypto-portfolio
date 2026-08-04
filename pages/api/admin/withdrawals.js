const { pool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  const session = requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT wr.id, wr.coin, wr.amount, wr.destination_address, wr.status,
              wr.created_at, wr.resolved_at, wr.resolved_by,
              u.id AS user_id, u.username, u.display_name
       FROM withdrawal_requests wr
       JOIN users u ON u.id = wr.user_id
       ORDER BY (wr.status = 'pending') DESC, wr.created_at DESC
       LIMIT 100`
    );
    return res.status(200).json({ requests: rows });
  }

  if (req.method === 'POST') {
    const { id, action } = req.body || {};
    if (!id || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'id and a valid action (approve/reject) are required' });
    }

    const { rows } = await pool.query('SELECT * FROM withdrawal_requests WHERE id = $1', [id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (action === 'approve') {
        // Re-check balance at approval time too — the user's ledger could have
        // changed since they submitted the request.
        const { rows: balRows } = await client.query(
          `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount
                                     WHEN type = 'withdrawal' THEN -amount
                                     ELSE amount END), 0) AS balance
           FROM ledger WHERE user_id = $1 AND coin = $2`,
          [request.user_id, request.coin]
        );
        if (Number(balRows[0].balance) < Number(request.amount)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'User no longer has sufficient balance for this request' });
        }

        await client.query(
          `INSERT INTO ledger (user_id, type, coin, amount, note, created_by)
           VALUES ($1, 'withdrawal', $2, $3, $4, $5)`,
          [request.user_id, request.coin, request.amount, `Withdrawal request #${request.id} approved`, session.username]
        );
      }

      await client.query(
        `UPDATE withdrawal_requests SET status = $1, resolved_by = $2, resolved_at = now() WHERE id = $3`,
        [action === 'approve' ? 'approved' : 'rejected', session.username, id]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
