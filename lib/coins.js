// Single source of truth mapping ledger symbols to CoinGecko ids and display names.
const COINS = [
  { symbol: 'BTC', id: 'bitcoin', name: 'Bitcoin' },
  { symbol: 'ETH', id: 'ethereum', name: 'Ethereum' },
  { symbol: 'USDT', id: 'tether', name: 'Tether' },
  { symbol: 'BNB', id: 'binancecoin', name: 'BNB' },
  { symbol: 'SOL', id: 'solana', name: 'Solana' },
  { symbol: 'XRP', id: 'ripple', name: 'XRP' },
  { symbol: 'ADA', id: 'cardano', name: 'Cardano' },
  { symbol: 'DOGE', id: 'dogecoin', name: 'Dogecoin' },
];

const BY_SYMBOL = Object.fromEntries(COINS.map((c) => [c.symbol, c]));

module.exports = { COINS, BY_SYMBOL };
