const COINS = [
  { symbol: 'BTC', id: 'bitcoin', name: 'Bitcoin' },
  { symbol: 'ETH', id: 'ethereum', name: 'Ethereum' },
  { symbol: 'USDT', id: 'tether', name: 'Tether' },
  { symbol: 'BNB', id: 'binancecoin', name: 'BNB' },
  { symbol: 'SOL', id: 'solana', name: 'Solana' },
  { symbol: 'XRP', id: 'ripple', name: 'XRP' },
  { symbol: 'ADA', id: 'cardano', name: 'Cardano' },
  { symbol: 'DOGE', id: 'dogecoin', name: 'Dogecoin' },
  { symbol: 'TRX', id: 'tron', name: 'Tron' },
  { symbol: 'TON', id: 'the-open-network', name: 'Toncoin' },
  { symbol: 'MATIC', id: 'matic-network', name: 'Polygon' },
  { symbol: 'LTC', id: 'litecoin', name: 'Litecoin' },
  { symbol: 'DOT', id: 'polkadot', name: 'Polkadot' },
  { symbol: 'AVAX', id: 'avalanche-2', name: 'Avalanche' },
  { symbol: 'LINK', id: 'chainlink', name: 'Chainlink' },
  { symbol: 'SHIB', id: 'shiba-inu', name: 'Shiba Inu' },
  { symbol: 'ATOM', id: 'cosmos', name: 'Cosmos' },
  { symbol: 'UNI', id: 'uniswap', name: 'Uniswap' },
  { symbol: 'XLM', id: 'stellar', name: 'Stellar' },
  { symbol: 'BCH', id: 'bitcoin-cash', name: 'Bitcoin Cash' },
  { symbol: 'NEAR', id: 'near', name: 'NEAR Protocol' },
  { symbol: 'ICP', id: 'internet-computer', name: 'Internet Computer' },
  { symbol: 'ETC', id: 'ethereum-classic', name: 'Ethereum Classic' },
  { symbol: 'FIL', id: 'filecoin', name: 'Filecoin' },
];

const BY_SYMBOL = Object.fromEntries(COINS.map((c) => [c.symbol, c]));

module.exports = { COINS, BY_SYMBOL };
