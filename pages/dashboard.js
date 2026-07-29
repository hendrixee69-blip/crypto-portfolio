import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { requireRole } from '../lib/auth';
import { COINS, BY_SYMBOL } from '../lib/coins';

export async function getServerSideProps({ req }) {
  const session = requireRole(req, 'user');
  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  return { props: { username: session.username } };
}

function fmtPrice(n) {
  if (n === undefined || n === null) return '—';
  return n >= 1
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : `$${n.toFixed(4)}`;
}

export default function Dashboard({ username }) {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState(null);
  const [prices, setPrices] = useState(null);
  const [error, setError] = useState('');
  const [addresses, setAddresses] = useState({});
  const [depositStep, setDepositStep] = useState('closed'); // closed | picking | showing
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        const [pRes, priceRes, settingsRes] = await Promise.all([
          fetch('/api/portfolio'),
          fetch('/api/prices'),
          fetch('/api/settings'),
        ]);
        if (!pRes.ok) throw new Error('Could not load your portfolio');
        if (cancelled) return;
        setPortfolio(await pRes.json());
        setPrices(await priceRes.json());
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          if (!cancelled) setAddresses(s.addresses || {});
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    // Prices alone, on a timer — holdings and the deposit address list rarely
    // change mid-session, so there's no need to re-fetch those every 30s too.
    async function refreshPricesOnly() {
      try {
        const res = await fetch('/api/prices');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPrices(data);
      } catch {
        // Silent — a missed price refresh isn't worth surfacing an error for.
      }
    }

    loadAll();
    const interval = setInterval(refreshPricesOnly, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function openDeposit() {
    setDepositStep('picking');
  }

  function closeDeposit() {
    setDepositStep('closed');
    setSelectedCoin(null);
    setCopied(false);
  }

  function pickCoin(coin) {
    setSelectedCoin(coin);
    setDepositStep('showing');
  }

  function backToPicking() {
    setDepositStep('picking');
    setSelectedCoin(null);
    setCopied(false);
  }

  function copyAddress() {
    if (!selectedCoin || !addresses[selectedCoin]) return;
    navigator.clipboard.writeText(addresses[selectedCoin]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user' }),
    });
    router.push('/');
  }

  const totalValue = portfolio?.holdings?.reduce((sum, h) => {
    const coin = BY_SYMBOL[h.coin];
    const price = prices?.[coin?.id]?.usd || 0;
    return sum + Number(h.balance) * price;
  }, 0);

  // Weighted 24h change across whatever the user actually holds, so the
  // number reflects their real exposure rather than the market in general.
  const portfolioChangePct = (() => {
    if (!portfolio?.holdings?.length || !prices || !totalValue) return null;
    const weightedChange = portfolio.holdings.reduce((sum, h) => {
      const coin = BY_SYMBOL[h.coin];
      const p = prices?.[coin?.id];
      if (!p?.usd) return sum;
      const value = Number(h.balance) * p.usd;
      return sum + value * (p.usd_24h_change || 0);
    }, 0);
    return weightedChange / totalValue;
  })();

  return (
    <>
      <div className="container">
      <div className="header">
        <div className="brand"><span className="dot" /> Ledger</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 14 }}>{username}</span>
          <button className="nav-link" onClick={logout}>Sign out</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div className="eyebrow" style={{ margin: 0 }}>Portfolio value</div>
          <span className="hero-badge" style={{ margin: 0, padding: '3px 9px', fontSize: 10 }}>
            <span className="pulse" /> Live
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="num" style={{ margin: 0 }}>
            {totalValue !== undefined
              ? totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
              : '—'}
          </h1>
          {portfolioChangePct !== null && (
            <span
              className="num"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: portfolioChangePct >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {portfolioChangePct >= 0 ? '▲' : '▼'} {Math.abs(portfolioChangePct).toFixed(2)}% today
            </span>
          )}
        </div>

        {depositStep === 'closed' && Object.keys(addresses).length > 0 && (
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openDeposit}>
            Deposit
          </button>
        )}

        {depositStep === 'picking' && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Choose a coin to deposit</span>
              <button className="btn btn-ghost" onClick={closeDeposit}>Cancel</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {Object.keys(addresses).map((coin) => (
                <button
                  key={coin}
                  className="quick-action"
                  style={{ width: '100%' }}
                  onClick={() => pickCoin(coin)}
                >
                  <span className="icon-circle">{coin[0]}</span>
                  {coin}
                </button>
              ))}
            </div>
          </div>
        )}

        {depositStep === 'showing' && selectedCoin && (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-soft)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Send {selectedCoin} to this address</span>
              <button className="btn btn-ghost" onClick={backToPicking}>← Back</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code className="num" style={{ fontSize: 12, wordBreak: 'break-all', flex: 1 }}>
                {addresses[selectedCoin]}
              </code>
              <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={copyAddress}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Markets</h3>
        <p className="muted" style={{ marginBottom: 4 }}>Live prices, updates automatically.</p>
        <table>
          <tbody>
            {COINS.map((c) => {
              const p = prices?.[c.id];
              const change = p?.usd_24h_change;
              return (
                <tr key={c.symbol}>
                  <td style={{ width: '45%' }}>
                    <div className="coin-cell">
                      {p?.image ? (
                        <img src={p.image} alt={c.name} className="coin-logo" />
                      ) : (
                        <span className="coin-logo" />
                      )}
                      <span><strong>{c.symbol}</strong> <span className="muted">{c.name}</span></span>
                    </div>
                  </td>
                  <td className="num">{fmtPrice(p?.usd)}</td>
                  <td className="num" style={{ color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {change !== undefined ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Holdings</h3>
        {portfolio?.holdings?.length ? (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Asset</th><th>Amount</th><th>Value</th></tr>
            </thead>
            <tbody>
              {portfolio.holdings.map((h) => {
                const coin = BY_SYMBOL[h.coin];
                const price = prices?.[coin?.id]?.usd || 0;
                return (
                  <tr key={h.coin}>
                    <td><strong>{h.coin}</strong></td>
                    <td className="num">{Number(h.balance).toLocaleString()}</td>
                    <td className="num">{fmtPrice(Number(h.balance) * price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted empty-state">No holdings yet. Your admin will record deposits here.</p>
        )}
      </div>

      <div className="card">
        <h3>Recent activity</h3>
        {portfolio?.history?.length ? (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Type</th><th>Asset</th><th>Amount</th><th>Note</th><th>Date</th></tr>
            </thead>
            <tbody>
              {portfolio.history.map((h, i) => (
                <tr key={i}>
                  <td><span className={`pill pill-${h.type}`}>{h.type}</span></td>
                  <td>{h.coin}</td>
                  <td className="num">{Number(h.amount).toLocaleString()}</td>
                  <td className="muted">{h.note || '—'}</td>
                  <td className="muted">{new Date(h.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted empty-state">Nothing recorded yet.</p>
        )}
      </div>
      </div>
    </>
  );
}
