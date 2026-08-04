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
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawStep, setWithdrawStep] = useState('closed'); // closed | picking | form
  const [withdrawCoin, setWithdrawCoin] = useState(null);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', address: '' });
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        const [pRes, priceRes, settingsRes, wRes] = await Promise.all([
          fetch('/api/portfolio'),
          fetch('/api/prices'),
          fetch('/api/settings'),
          fetch('/api/withdrawals'),
        ]);
        if (!pRes.ok) throw new Error('Could not load your portfolio');
        if (cancelled) return;
        setPortfolio(await pRes.json());
        setPrices(await priceRes.json());
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          if (!cancelled) setAddresses(s.addresses || {});
        }
        if (wRes.ok) {
          const w = await wRes.json();
          if (!cancelled) setWithdrawals(w.requests || []);
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

  function openWithdraw() {
    setWithdrawStep('picking');
  }

  function closeWithdraw() {
    setWithdrawStep('closed');
    setWithdrawCoin(null);
    setWithdrawForm({ amount: '', address: '' });
    setWithdrawError('');
  }

  function pickWithdrawCoin(coin) {
    setWithdrawCoin(coin);
    setWithdrawStep('form');
  }

  function backToWithdrawPicking() {
    setWithdrawStep('picking');
    setWithdrawCoin(null);
    setWithdrawError('');
  }

  async function submitWithdrawal(e) {
    e.preventDefault();
    setWithdrawError('');
    setWithdrawBusy(true);
    try {
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coin: withdrawCoin,
          amount: withdrawForm.amount,
          destination_address: withdrawForm.address,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWithdrawals((prev) => [data.request, ...prev]);
      closeWithdraw();
    } catch (err) {
      setWithdrawError(err.message);
    } finally {
      setWithdrawBusy(false);
    }
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
        <div className="brand"><span className="dot" /> Coinmy</div>
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

        {depositStep === 'closed' && withdrawStep === 'closed' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {Object.keys(addresses).length > 0 && (
              <button className="btn btn-primary" onClick={openDeposit}>Deposit</button>
            )}
            {portfolio?.holdings?.length > 0 && (
              <button className="btn btn-ghost" onClick={openWithdraw}>Withdraw</button>
            )}
          </div>
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

        {withdrawStep === 'picking' && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Choose a coin to withdraw</span>
              <button className="btn btn-ghost" onClick={closeWithdraw}>Cancel</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {portfolio.holdings.map((h) => (
                <button
                  key={h.coin}
                  className="quick-action"
                  style={{ width: '100%' }}
                  onClick={() => pickWithdrawCoin(h.coin)}
                >
                  <span className="icon-circle">{h.coin[0]}</span>
                  {h.coin}
                </button>
              ))}
            </div>
          </div>
        )}

        {withdrawStep === 'form' && withdrawCoin && (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-soft)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Withdraw {withdrawCoin}</span>
              <button className="btn btn-ghost" onClick={backToWithdrawPicking}>← Back</button>
            </div>
            <form onSubmit={submitWithdrawal}>
              <div className="field">
                <label>Amount ({withdrawCoin})</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={withdrawForm.amount}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Destination {withdrawCoin} address</label>
                <input
                  value={withdrawForm.address}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, address: e.target.value })}
                  placeholder="Where should we send it?"
                  required
                />
              </div>
              {withdrawError && <p className="error-text">{withdrawError}</p>}
              <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Submitting sends a request to the admin for approval — it isn't sent instantly.
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={withdrawBusy}>
                {withdrawBusy ? 'Submitting…' : 'Submit withdrawal request'}
              </button>
            </form>
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
                      <span className="coin-logo-wrap">
                        {p?.image && <img src={p.image} alt={c.name} className="coin-logo-img" />}
                      </span>
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

      {withdrawals.length > 0 && (
        <div className="card">
          <h3>Withdrawal requests</h3>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Coin</th><th>Amount</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id}>
                  <td><strong>{w.coin}</strong></td>
                  <td className="num">{Number(w.amount).toLocaleString()}</td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        background: w.status === 'approved' ? 'var(--green-soft)' : w.status === 'rejected' ? 'var(--red-soft)' : '#FDF3E3',
                        color: w.status === 'approved' ? 'var(--green)' : w.status === 'rejected' ? 'var(--red)' : '#9A6A1B',
                      }}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="muted">{new Date(w.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
