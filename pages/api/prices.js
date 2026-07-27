// Public endpoint — anyone can view live prices, no auth required.
const { COINS } = require('../../lib/coins');
const COIN_IDS = COINS.map((c) => c.id);

let cache = { data: null, fetchedAt: 0 };
const CACHE_MS = 30_000;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_MS) {
    return res.status(200).json(cache.data);
  }

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COIN_IDS.join(',')}&order=market_cap_desc&price_change_percentage=24h`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`CoinGecko responded ${resp.status}`);
    const list = await resp.json();
    // Reshape into { [coingecko_id]: {...} } for easy lookup, keeping the same
    // usd / usd_24h_change shape the rest of the app already expects, plus
    // an image URL and market cap for the redesigned UI.
    const data = {};
    list.forEach((c) => {
      data[c.id] = {
        usd: c.current_price,
        usd_24h_change: c.price_change_percentage_24h,
        image: c.image,
        market_cap: c.market_cap,
        market_cap_rank: c.market_cap_rank,
      };
    });
    cache = { data, fetchedAt: now };
    return res.status(200).json(data);
  } catch (err) {
    if (cache.data) return res.status(200).json(cache.data); // serve stale on failure
    return res.status(502).json({ error: 'Failed to fetch live prices' });
  }
};
