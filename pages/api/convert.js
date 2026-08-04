const { pool } = require('../../lib/db');
const { requireRole } = require('../../lib/auth');
const { BY_SYMBOL } = require('../../lib/coins');

async function fetchUsdPrices(ids) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Could not fetch live prices');
  return resp.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = requireRole(req, 'user');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { from_coin, to_coin, amount } = req.body || {};
  if (!from_coin || !BY_SYMBOL[from_coin]) {
    return res.status(400).json({ error: `Unknown coin symbol: ${from_coin}` });
  }
  if (!to_coin || !BY_SYMBOL[to_coin]) {
    return res.status(400).json({ error: `Unknown coin symbol: ${to_coin}` });
  }
  if (from_coin === to_coin) {
    return res.status(400).json({ error: 'Choose two different coins' });
  }
  const numericAmount = Number(amount);
  if (!(numericAmount > 0)) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Available balance = confirmed ledger balance minus anything already
    // tied up in a pending withdrawal request, same rule as withdrawals.
    const { rows: balRows } = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount
                                 WHEN type = 'withdrawal' THEN -amount
                                 ELSE amount END), 0) AS balance
       FROM ledger WHERE user_id = $1 AND coin = $2`,
      [session.id, from_coin]
    );
    const { rows: pendingRows } = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS pending
       FROM withdrawal_requests WHERE user_id = $1 AND coin = $2 AND status = 'pending'`,
      [session.id, from_coin]
    );
    const available = Number(balRows[0].balance) - Number(pendingRows[0].pending);
    if (numericAmount > available) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Insufficient available balance: ${available} ${from_coin} available` });
    }

    const fromId = BY_SYMBOL[from_coin].id;
    const toId = BY_SYMBOL[to_coin].id;
    const prices = await fetchUsdPrices([fromId, toId]);
    const fromPrice = prices[fromId]?.usd;
    const toPrice = prices[toId]?.usd;
    if (!fromPrice || !toPrice) {
      await client.query('ROLLBACK');
      return res.status(502).json({ error: 'Could not get a live rate for one of those coins right now' });
    }

    const usdValue = numericAmount * fromPrice;
    const convertedAmount = usdValue / toPrice;

    await client.query(
      `INSERT INTO ledger (user_id, type, coin, amount, note, created_by)
       VALUES ($1, 'withdrawal', $2, $3, $4, $5)`,
      [session.id, from_coin, numericAmount, `Converted to ${to_coin}`, session.username]
    );
    await client.query(
      `INSERT INTO ledger (user_id, type, coin, amount, note, created_by)
       VALUES ($1, 'deposit', $2, $3, $4, $5)`,
      [session.id, to_coin, convertedAmount, `Converted from ${from_coin}`, session.username]
    );

    await client.query('COMMIT');
    return res.status(200).json({
      ok: true,
      from_coin,
      to_coin,
      converted_amount: convertedAmount,
      rate: fromPrice / toPrice,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
