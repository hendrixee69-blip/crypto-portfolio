import { useEffect, useState } from 'react';
import { COINS } from '../lib/coins';

function fmtPrice(n) {
  if (n === undefined || n === null) return '—';
  return n >= 1
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : `$${n.toFixed(4)}`;
}

function fmtCompact(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

export default function Home() {
  const [prices, setPrices] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/prices');
        if (!res.ok) throw new Error('Could not load prices right now');
        const data = await res.json();
        if (!cancelled) setPrices(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const gainers = prices ? COINS.filter((c) => (prices[c.id]?.usd_24h_change || 0) > 0).length : 0;
  const totalMarketCap = prices
    ? COINS.reduce((sum, c) => sum + (prices[c.id]?.market_cap || 0), 0)
    : null;

  return (
    <>
      <div className="ticker-wrap">
        <div className="ticker-track">
          {[...COINS, ...COINS].map((c, i) => {
            const p = prices?.[c.id];
            const change = p?.usd_24h_change;
            return (
              <span className="ticker-item" key={`${c.symbol}-${i}`}>
                <span className="sym">{c.symbol}</span>
                <span>{fmtPrice(p?.usd)}</span>
                {change !== undefined && (
                  <span className={change >= 0 ? 'up' : 'down'}>
                    {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      <div className="container">
        <div className="header">
          <div className="brand"><span className="dot" /> Ledger</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <a className="nav-link" href="/login">Sign in</a>
            <a className="nav-link primary" href="/admin/login">Admin</a>
          </div>
        </div>

        <div className="hero">
          <div className="hero-badge"><span className="pulse" /> Live market data · updates every 30s</div>
          <h1>
            Your portfolio,<br />
            <span className="gradient-text">tracked in real time.</span>
          </h1>
          <p className="lede">
            Watch live prices across major crypto assets, and see your own holdings
            the moment you sign in. No noise, just your numbers.
          </p>
          <div className="hero-actions">
            <a href="/login" className="btn btn-lg btn-gradient">View my portfolio</a>
            <a href="/admin/login" className="btn btn-lg btn-ghost">Admin sign in</a>
          </div>
        </div>

        <div className="stat-strip">
          <div className="glass-card stat-tile">
            <span className="num">{COINS.length}</span>
            <span className="label">Assets tracked</span>
          </div>
          <div className="glass-card stat-tile">
            <span className="num" style={{ color: 'var(--accent)' }}>{prices ? gainers : '—'}</span>
            <span className="label">In the green (24h)</span>
          </div>
          <div className="glass-card stat-tile">
            <span className="num">{totalMarketCap ? `$${fmtCompact(totalMarketCap)}` : '—'}</span>
            <span className="label">Combined market cap</span>
          </div>
        </div>

        <div className="glass-card">
          <div className="eyebrow">Live market</div>
          <h2 style={{ marginBottom: 4 }}>Prices right now</h2>
          <p className="muted" style={{ marginBottom: 20 }}>No account needed to view. Sign in to see your own holdings.</p>

          {error && <p className="error-text">{error}</p>}

          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Price</th>
                <th>24h</th>
                <th>Market cap</th>
              </tr>
            </thead>
            <tbody>
              {COINS.map((c, i) => {
                const p = prices?.[c.id];
                const change = p?.usd_24h_change;
                return (
                  <tr key={c.symbol}>
                    <td>
                      <div className="coin-cell">
                        <span className="coin-rank">{i + 1}</span>
                        {p?.image ? (
                          <img src={p.image} alt={c.name} className="coin-logo" />
                        ) : (
                          <span className="coin-logo" />
                        )}
                        <span>
                          <strong>{c.symbol}</strong> <span className="muted">{c.name}</span>
                        </span>
                      </div>
                    </td>
                    <td className="num">{fmtPrice(p?.usd)}</td>
                    <td className="num" style={{ color: change >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                      {change !== undefined ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}
                    </td>
                    <td className="num muted">{p?.market_cap ? `$${fmtCompact(p.market_cap)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
