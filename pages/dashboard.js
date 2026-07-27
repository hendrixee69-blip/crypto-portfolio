import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { requireRole } from '../lib/auth';
import { BY_SYMBOL } from '../lib/coins';

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

  useEffect(() => {
    async function load() {
      try {
        const [pRes, priceRes] = await Promise.all([
          fetch('/api/portfolio'),
          fetch('/api/prices'),
        ]);
        if (!pRes.ok) throw new Error('Could not load your portfolio');
        setPortfolio(await pRes.json());
        setPrices(await priceRes.json());
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, []);

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

  return (
    <>
      <div className="bg-glow" />
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
        <div className="eyebrow">Portfolio value</div>
        <h1 className="num">
          {totalValue !== undefined
            ? totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
            : '—'}
        </h1>
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
