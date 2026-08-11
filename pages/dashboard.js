import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { requireRole } from '../lib/auth';
import { COINS, BY_SYMBOL } from '../lib/coins';
import LanguageSelector from '../components/LanguageSelector';

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

// Default toLocaleString() caps at 3 decimal places, which silently rounds
// small crypto amounts like 0.00017 BTC down to "0". Coin amounts need more
// room — up to 8 decimals — while still trimming trailing zeros.
function fmtCoin(n) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export default function Dashboard({ username }) {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState(null);
  const [prices, setPrices] = useState(null);
  const [error, setError] = useState('');
  const [addresses, setAddresses] = useState({});
  const [depositStep, setDepositStep] = useState('closed'); // closed | picking | amount | showing
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositUnit, setDepositUnit] = useState('coin'); // coin | usd
  const [depositCoinAmount, setDepositCoinAmount] = useState(null);
  const [depositAmountBusy, setDepositAmountBusy] = useState(false);
  const [depositAmountError, setDepositAmountError] = useState('');
  const [copied, setCopied] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawStep, setWithdrawStep] = useState('closed'); // closed | picking | form
  const [withdrawCoin, setWithdrawCoin] = useState(null);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', address: '' });
  const [withdrawUnit, setWithdrawUnit] = useState('coin'); // coin | usd
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [convertStep, setConvertStep] = useState('closed'); // closed | from | to | amount
  const [convertFrom, setConvertFrom] = useState(null);
  const [convertTo, setConvertTo] = useState(null);
  const [convertAmount, setConvertAmount] = useState('');
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertError, setConvertError] = useState('');
  const [convertSuccess, setConvertSuccess] = useState(null);

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

    // Refresh everything on a timer — prices AND holdings/withdrawals — so
    // changes an admin makes while the user's tab is open (a new deposit,
    // withdrawal, or adjustment) actually show up without a manual reload.
    async function refreshAll() {
      try {
        const [pRes, priceRes, wRes] = await Promise.all([
          fetch('/api/portfolio'),
          fetch('/api/prices'),
          fetch('/api/withdrawals'),
        ]);
        if (cancelled) return;
        if (pRes.ok) setPortfolio(await pRes.json());
        if (priceRes.ok) setPrices(await priceRes.json());
        if (wRes.ok) {
          const w = await wRes.json();
          setWithdrawals(w.requests || []);
        }
      } catch {
        // Silent — a missed periodic refresh isn't worth surfacing an error for.
      }
    }

    loadAll();
    const interval = setInterval(refreshAll, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function openDeposit() {
    setDepositStep('picking');
  }

  function closeDeposit() {
    setDepositStep('closed');
    setSelectedCoin(null);
    setDepositAmount('');
    setDepositUnit('coin');
    setDepositCoinAmount(null);
    setDepositAmountError('');
    setCopied(false);
  }

  function pickCoin(coin) {
    setSelectedCoin(coin);
    setDepositStep('amount');
  }

  function backToPicking() {
    setDepositStep('picking');
    setSelectedCoin(null);
    setDepositAmount('');
    setDepositUnit('coin');
    setDepositCoinAmount(null);
    setDepositAmountError('');
    setCopied(false);
  }

  function backToAmount() {
    setDepositStep('amount');
    setCopied(false);
  }

  async function submitDepositAmount(e) {
    e.preventDefault();
    setDepositAmountError('');

    const price = prices?.[BY_SYMBOL[selectedCoin]?.id]?.usd;
    let coinAmount;
    if (depositUnit === 'usd') {
      if (!price) {
        setDepositAmountError('Live price unavailable right now — try again in a moment, or switch to entering the coin amount directly.');
        return;
      }
      coinAmount = Number(depositAmount) / price;
    } else {
      coinAmount = Number(depositAmount);
    }
    if (!(coinAmount > 0)) {
      setDepositAmountError('Enter a valid amount');
      return;
    }

    setDepositAmountBusy(true);
    try {
      const res = await fetch('/api/deposit-intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: selectedCoin, amount: coinAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDepositCoinAmount(coinAmount);
      setDepositStep('showing');
    } catch (err) {
      setDepositAmountError(err.message);
    } finally {
      setDepositAmountBusy(false);
    }
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
    setWithdrawUnit('coin');
    setWithdrawError('');
  }

  function pickWithdrawCoin(coin) {
    setWithdrawCoin(coin);
    setWithdrawStep('form');
  }

  function backToWithdrawPicking() {
    setWithdrawStep('picking');
    setWithdrawCoin(null);
    setWithdrawUnit('coin');
    setWithdrawError('');
  }

  async function submitWithdrawal(e) {
    e.preventDefault();
    setWithdrawError('');

    const price = prices?.[BY_SYMBOL[withdrawCoin]?.id]?.usd;
    let coinAmount;
    if (withdrawUnit === 'usd') {
      if (!price) {
        setWithdrawError('Live price unavailable right now — try again in a moment, or switch to entering the coin amount directly.');
        return;
      }
      coinAmount = Number(withdrawForm.amount) / price;
    } else {
      coinAmount = Number(withdrawForm.amount);
    }
    if (!(coinAmount > 0)) {
      setWithdrawError('Enter a valid amount');
      return;
    }

    setWithdrawBusy(true);
    try {
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coin: withdrawCoin,
          amount: coinAmount,
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

  function openConvert() {
    setConvertStep('from');
    setConvertSuccess(null);
  }

  function closeConvert() {
    setConvertStep('closed');
    setConvertFrom(null);
    setConvertTo(null);
    setConvertAmount('');
    setConvertError('');
  }

  function pickConvertFrom(coin) {
    setConvertFrom(coin);
    setConvertStep('to');
  }

  function pickConvertTo(coin) {
    setConvertTo(coin);
    setConvertStep('amount');
  }

  function backConvertStep() {
    if (convertStep === 'amount') { setConvertStep('to'); setConvertTo(null); }
    else if (convertStep === 'to') { setConvertStep('from'); setConvertFrom(null); }
  }

  async function submitConvert(e) {
    e.preventDefault();
    setConvertError('');
    setConvertBusy(true);
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_coin: convertFrom, to_coin: convertTo, amount: convertAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConvertSuccess(data);
      closeConvert();
      const pRes = await fetch('/api/portfolio');
      if (pRes.ok) setPortfolio(await pRes.json());
    } catch (err) {
      setConvertError(err.message);
    } finally {
      setConvertBusy(false);
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
          <LanguageSelector />
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

        {convertSuccess && (
          <p style={{ fontSize: 13, marginTop: 10, color: 'var(--green)' }}>
            Converted {Number(convertSuccess.converted_amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} {convertSuccess.to_coin} received for {convertSuccess.from_coin}.
          </p>
        )}

        {depositStep === 'closed' && withdrawStep === 'closed' && convertStep === 'closed' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {Object.keys(addresses).length > 0 && (
              <button className="btn btn-primary" onClick={openDeposit}>Deposit</button>
            )}
            {portfolio?.holdings?.length > 0 && (
              <button className="btn btn-ghost" onClick={openWithdraw}>Withdraw</button>
            )}
            {portfolio?.holdings?.length > 0 && (
              <button className="btn btn-ghost" onClick={openConvert}>Convert</button>
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

        {depositStep === 'amount' && selectedCoin && (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-soft)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>How much {selectedCoin}?</span>
              <button className="btn btn-ghost" onClick={backToPicking}>← Back</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button
                type="button"
                className="btn"
                style={{
                  fontSize: 12, padding: '6px 12px',
                  background: depositUnit === 'coin' ? 'var(--accent)' : 'var(--bg)',
                  color: depositUnit === 'coin' ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)',
                }}
                onClick={() => { setDepositUnit('coin'); setDepositAmount(''); }}
              >
                {selectedCoin}
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  fontSize: 12, padding: '6px 12px',
                  background: depositUnit === 'usd' ? 'var(--accent)' : 'var(--bg)',
                  color: depositUnit === 'usd' ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)',
                }}
                onClick={() => { setDepositUnit('usd'); setDepositAmount(''); }}
              >
                USD
              </button>
            </div>
            <form onSubmit={submitDepositAmount}>
              <div className="field">
                <label>
                  {depositUnit === 'usd' ? 'Amount in USD' : `Amount you plan to send (${selectedCoin})`}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {depositUnit === 'usd' && depositAmount && prices?.[BY_SYMBOL[selectedCoin]?.id]?.usd && (
                <p className="muted num" style={{ fontSize: 13, marginTop: -8, marginBottom: 12 }}>
                  ≈ {fmtCoin(Number(depositAmount) / prices[BY_SYMBOL[selectedCoin].id].usd)} {selectedCoin}
                </p>
              )}
              {depositAmountError && <p className="error-text">{depositAmountError}</p>}
              <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                This lets the admin know what to expect — you'll see the deposit address next.
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={depositAmountBusy}>
                {depositAmountBusy ? 'Continuing…' : 'Continue'}
              </button>
            </form>
          </div>
        )}

        {depositStep === 'showing' && selectedCoin && (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-soft)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Send {depositCoinAmount !== null ? `${fmtCoin(depositCoinAmount)} ` : ''}{selectedCoin} to this address
              </span>
              <button className="btn btn-ghost" onClick={backToAmount}>← Back</button>
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
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button
                type="button"
                className="btn"
                style={{
                  fontSize: 12, padding: '6px 12px',
                  background: withdrawUnit === 'coin' ? 'var(--accent)' : 'var(--bg)',
                  color: withdrawUnit === 'coin' ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)',
                }}
                onClick={() => { setWithdrawUnit('coin'); setWithdrawForm({ ...withdrawForm, amount: '' }); }}
              >
                {withdrawCoin}
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  fontSize: 12, padding: '6px 12px',
                  background: withdrawUnit === 'usd' ? 'var(--accent)' : 'var(--bg)',
                  color: withdrawUnit === 'usd' ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)',
                }}
                onClick={() => { setWithdrawUnit('usd'); setWithdrawForm({ ...withdrawForm, amount: '' }); }}
              >
                USD
              </button>
            </div>
            <form onSubmit={submitWithdrawal}>
              <div className="field">
                <label>{withdrawUnit === 'usd' ? 'Amount in USD' : `Amount (${withdrawCoin})`}</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={withdrawForm.amount}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                  required
                />
              </div>
              {withdrawUnit === 'usd' && withdrawForm.amount && prices?.[BY_SYMBOL[withdrawCoin]?.id]?.usd && (
                <p className="muted num" style={{ fontSize: 13, marginTop: -8, marginBottom: 12 }}>
                  ≈ {fmtCoin(Number(withdrawForm.amount) / prices[BY_SYMBOL[withdrawCoin].id].usd)} {withdrawCoin}
                </p>
              )}
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

        {convertStep === 'from' && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Convert from</span>
              <button className="btn btn-ghost" onClick={closeConvert}>Cancel</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {portfolio.holdings.map((h) => (
                <button
                  key={h.coin}
                  className="quick-action"
                  style={{ width: '100%' }}
                  onClick={() => pickConvertFrom(h.coin)}
                >
                  <span className="icon-circle">{h.coin[0]}</span>
                  {h.coin}
                </button>
              ))}
            </div>
          </div>
        )}

        {convertStep === 'to' && convertFrom && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Convert {convertFrom} to</span>
              <button className="btn btn-ghost" onClick={backConvertStep}>← Back</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {COINS.filter((c) => c.symbol !== convertFrom).map((c) => (
                <button
                  key={c.symbol}
                  className="quick-action"
                  style={{ width: '100%' }}
                  onClick={() => pickConvertTo(c.symbol)}
                >
                  <span className="icon-circle">{c.symbol[0]}</span>
                  {c.symbol}
                </button>
              ))}
            </div>
          </div>
        )}

        {convertStep === 'amount' && convertFrom && convertTo && (() => {
          const holding = portfolio.holdings.find((h) => h.coin === convertFrom);
          const available = holding ? Number(holding.balance) : 0;
          const fromPrice = prices?.[BY_SYMBOL[convertFrom]?.id]?.usd;
          const toPrice = prices?.[BY_SYMBOL[convertTo]?.id]?.usd;
          const numeric = Number(convertAmount);
          const estimate = fromPrice && toPrice && numeric > 0 ? (numeric * fromPrice) / toPrice : null;
          return (
            <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-soft)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{convertFrom} → {convertTo}</span>
                <button className="btn btn-ghost" onClick={backConvertStep}>← Back</button>
              </div>
              <form onSubmit={submitConvert}>
                <div className="field">
                  <label>Amount ({convertFrom}) — {fmtCoin(available)} available</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={available}
                    value={convertAmount}
                    onChange={(e) => setConvertAmount(e.target.value)}
                    required
                  />
                </div>
                {estimate !== null && (
                  <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                    ≈ <span className="num" style={{ fontWeight: 700, color: 'var(--text)' }}>
                      {estimate.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                    </span> {convertTo} at the current rate
                  </p>
                )}
                {convertError && <p className="error-text">{convertError}</p>}
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={convertBusy}>
                  {convertBusy ? 'Converting…' : 'Convert'}
                </button>
              </form>
            </div>
          );
        })()}
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
                        <span className="coin-logo-wrap">
                          <img src={p.image} alt={c.name} className="coin-logo-img" />
                        </span>
                      ) : (
                        <span className="coin-logo-wrap" />
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
                    <td className="num">{fmtCoin(h.balance)}</td>
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
                  <td className="num">{fmtCoin(w.amount)}</td>
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
                  <td className="num">{fmtCoin(h.amount)}</td>
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
