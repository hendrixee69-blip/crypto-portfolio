import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { requireRole } from '../../lib/auth';
import { COINS, BY_SYMBOL } from '../../lib/coins';

// Default toLocaleString() caps at 3 decimal places, which silently rounds
// small crypto amounts like 0.00017 BTC down to "0". Coin amounts need more
// room — up to 8 decimals, same precision Bitcoin itself uses — while still
// trimming trailing zeros so whole numbers don't show a wall of zeros.
function fmtCoin(n) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function fmtUsd(n) {
  if (n === undefined || n === null) return null;
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function usdValue(prices, coin, amount) {
  const price = prices?.[BY_SYMBOL[coin]?.id]?.usd;
  if (!price) return null;
  return fmtUsd(Number(amount) * price);
}

export async function getServerSideProps({ req }) {
  const session = requireRole(req, 'admin');
  if (!session) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  return { props: { adminUsername: session.username } };
}

export default function AdminPanel({ adminUsername }) {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [newUser, setNewUser] = useState({ username: '', password: '', display_name: '' });
  const [entry, setEntry] = useState({ type: 'deposit', coin: 'BTC', amount: '', note: '', created_at: '' });
  const [editingDate, setEditingDate] = useState({});
  const [savingDateId, setSavingDateId] = useState(null);
  const [addresses, setAddresses] = useState({});
  const [addrForm, setAddrForm] = useState({ coin: 'BTC', address: '' });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [resolvingId, setResolvingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [passwordResets, setPasswordResets] = useState([]);
  const [resetPasswordInputs, setResetPasswordInputs] = useState({});
  const [resettingId, setResettingId] = useState(null);
  const [resetMsg, setResetMsg] = useState('');
  const [depositIntents, setDepositIntents] = useState([]);
  const [setBalanceForm, setSetBalanceForm] = useState({ coin: 'BTC', target: '' });
  const [setBalanceUnit, setSetBalanceUnit] = useState('usd'); // coin | usd
  const [setBalanceBusy, setSetBalanceBusy] = useState(false);
  const [setBalanceMsg, setSetBalanceMsg] = useState('');
  const [prices, setPrices] = useState(null);
  const [entryUnit, setEntryUnit] = useState('usd'); // coin | usd

  async function loadPrices() {
    const res = await fetch('/api/prices');
    if (res.ok) setPrices(await res.json());
  }

  async function loadDepositIntents() {
    const res = await fetch('/api/admin/deposit-intents');
    if (res.status === 401) return;
    const data = await res.json();
    setDepositIntents(data.intents || []);
  }

  async function loadPasswordResets() {
    const res = await fetch('/api/admin/password-resets');
    if (res.status === 401) return;
    const data = await res.json();
    setPasswordResets(data.requests || []);
  }

  async function resolvePasswordReset(id) {
    const newPassword = resetPasswordInputs[id];
    if (!newPassword || newPassword.length < 8) {
      setResetMsg('Enter a password of at least 8 characters first.');
      return;
    }
    setResettingId(id);
    setResetMsg('');
    try {
      const res = await fetch('/api/admin/password-resets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetPasswordInputs((prev) => ({ ...prev, [id]: '' }));
      setResetMsg('Password updated.');
      await loadPasswordResets();
    } catch (err) {
      setResetMsg(err.message);
    } finally {
      setResettingId(null);
    }
  }

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    if (res.status === 401) return router.push('/admin/login');
    const data = await res.json();
    setUsers(data.users || []);
  }

  async function loadSettings() {
    const res = await fetch('/api/admin/settings');
    if (res.status === 401) return;
    const data = await res.json();
    setAddresses(data.addresses || {});
  }

  async function loadWithdrawalRequests() {
    const res = await fetch('/api/admin/withdrawals');
    if (res.status === 401) return;
    const data = await res.json();
    setWithdrawalRequests(data.requests || []);
  }

  useEffect(() => {
    loadUsers();
    loadSettings();
    loadWithdrawalRequests();
    loadDepositIntents();
    loadPasswordResets();
    loadPrices();
    const interval = setInterval(loadPrices, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function loadLedger(userId) {
    setSelectedId(userId);
    const res = await fetch(`/api/admin/ledger?user_id=${userId}`);
    const data = await res.json();
    setLedger(data.entries || []);
  }

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewUser({ username: '', password: '', display_name: '' });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(id, displayName) {
    if (!window.confirm(`Delete ${displayName}? This permanently removes their account, ledger history, and withdrawal requests. This can't be undone.`)) {
      return;
    }
    setDeletingId(id);
    setError('');
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (selectedId === id) {
        setSelectedId(null);
        setLedger([]);
      }
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function saveAddress(e) {
    e.preventDefault();
    setSettingsMsg('');
    setSettingsBusy(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addrForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddresses((prev) => ({ ...prev, [addrForm.coin]: addrForm.address.trim() }));
      setAddrForm({ coin: addrForm.coin, address: '' });
      setSettingsMsg('Address updated.');
    } catch (err) {
      setSettingsMsg(err.message);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function resolveWithdrawal(id, action) {
    setResolvingId(id);
    setError('');
    try {
      const res = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await Promise.all([loadWithdrawalRequests(), loadUsers()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setResolvingId(null);
    }
  }

  async function recordEntry(e) {
    e.preventDefault();
    if (!selectedId) return;
    setError('');

    const price = prices?.[BY_SYMBOL[entry.coin]?.id]?.usd;
    let coinAmount;
    if (entryUnit === 'usd') {
      if (!price) {
        setError('Live price unavailable right now — try again in a moment, or switch to entering the coin amount directly.');
        return;
      }
      coinAmount = Number(entry.amount) / price;
    } else {
      coinAmount = Number(entry.amount);
    }
    if (!(coinAmount > 0)) {
      setError('Enter a valid amount');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, amount: coinAmount, user_id: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntry({ type: 'deposit', coin: 'BTC', amount: '', note: '', created_at: '' });
      await Promise.all([loadUsers(), loadLedger(selectedId)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEntryDate(id) {
    const newDate = editingDate[id];
    if (!newDate) return;
    setSavingDateId(id);
    setError('');
    try {
      const res = await fetch('/api/admin/ledger', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, created_at: newDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingDate((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadLedger(selectedId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDateId(null);
    }
  }

  async function submitSetBalance(e) {
    e.preventDefault();
    if (!selectedId) return;
    setSetBalanceMsg('');

    const price = prices?.[BY_SYMBOL[setBalanceForm.coin]?.id]?.usd;
    let targetCoinAmount;
    if (setBalanceUnit === 'usd') {
      if (!price) {
        setSetBalanceMsg('Live price unavailable right now — try again in a moment, or switch to entering the coin amount directly.');
        return;
      }
      targetCoinAmount = Number(setBalanceForm.target) / price;
    } else {
      targetCoinAmount = Number(setBalanceForm.target);
    }
    if (!(targetCoinAmount >= 0)) {
      setSetBalanceMsg('Enter a valid target balance');
      return;
    }

    setSetBalanceBusy(true);
    try {
      const res = await fetch('/api/admin/set-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedId, coin: setBalanceForm.coin, target: targetCoinAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSetBalanceMsg(
        data.unchanged
          ? `Already at ${fmtCoin(targetCoinAmount)} ${setBalanceForm.coin}.`
          : `Set to ${fmtCoin(targetCoinAmount)} ${setBalanceForm.coin} (was ${fmtCoin(data.previous)}).`
      );
      setSetBalanceForm({ coin: setBalanceForm.coin, target: '' });
      await Promise.all([loadUsers(), loadLedger(selectedId)]);
    } catch (err) {
      setSetBalanceMsg(err.message);
    } finally {
      setSetBalanceBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    router.push('/');
  }

  const selectedUser = users.find((u) => u.id === selectedId);

  return (
    <>
      <div className="container">
      <div className="header">
        <div className="brand"><span className="dot" /> Coinmy <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· admin</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 14 }}>{adminUsername}</span>
          <a className="nav-link" href="/admin/change-password">Change password</a>
          <button className="nav-link" onClick={logout}>Sign out</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <h3>Add a user</h3>
        <form onSubmit={createUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end', marginTop: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Display name</label>
            <input value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} required />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Username</label>
            <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Temp password</label>
            <input type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={8} />
          </div>
          <button className="btn btn-primary" disabled={busy}>Add user</button>
        </form>
      </div>

      <div className="card">
        <h3>Deposit addresses</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          Set an address per coin. Users see only the coins you've configured here —
          you still credit balances manually once you've confirmed a transfer on-chain.
        </p>
        <form onSubmit={saveAddress} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 12, alignItems: 'end', marginBottom: 14 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Coin</label>
            <select value={addrForm.coin} onChange={(e) => setAddrForm({ ...addrForm, coin: e.target.value })}>
              {COINS.map((c) => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Address</label>
            <input
              value={addrForm.address}
              onChange={(e) => setAddrForm({ ...addrForm, address: e.target.value })}
              placeholder={addresses[addrForm.coin] || 'Not set yet'}
              required
            />
          </div>
          <button className="btn btn-primary" disabled={settingsBusy}>Save</button>
        </form>
        {settingsMsg && (
          <p style={{ fontSize: 13, marginBottom: 10, color: settingsMsg.includes('updated') ? 'var(--green)' : 'var(--red)' }}>
            {settingsMsg}
          </p>
        )}
        {Object.keys(addresses).length > 0 && (
          <table>
            <thead><tr><th>Coin</th><th>Address</th></tr></thead>
            <tbody>
              {Object.entries(addresses).map(([coin, addr]) => (
                <tr key={coin}>
                  <td><strong>{coin}</strong></td>
                  <td className="num muted" style={{ fontSize: 12 }}>{addr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Withdrawal requests</h3>
        {withdrawalRequests.length ? (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr><th>User</th><th>Coin</th><th>Amount</th><th>Destination</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {withdrawalRequests.map((r) => (
                <tr key={r.id}>
                  <td>{r.display_name} <span className="muted" style={{ fontSize: 12 }}>@{r.username}</span></td>
                  <td><strong>{r.coin}</strong></td>
                  <td className="num">
                    {fmtCoin(r.amount)}
                    {usdValue(prices, r.coin, r.amount) && (
                      <div className="muted" style={{ fontSize: 11 }}>{usdValue(prices, r.coin, r.amount)}</div>
                    )}
                  </td>
                  <td className="num muted" style={{ fontSize: 12, maxWidth: 160, wordBreak: 'break-all' }}>{r.destination_address}</td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        background: r.status === 'approved' ? 'var(--green-soft)' : r.status === 'rejected' ? 'var(--red-soft)' : '#FDF3E3',
                        color: r.status === 'approved' ? 'var(--green)' : r.status === 'rejected' ? 'var(--red)' : '#9A6A1B',
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '5px 10px', fontSize: 12 }}
                          disabled={resolvingId === r.id}
                          onClick={() => resolveWithdrawal(r.id, 'approve')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '5px 10px', fontSize: 12 }}
                          disabled={resolvingId === r.id}
                          onClick={() => resolveWithdrawal(r.id, 'reject')}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted empty-state">No withdrawal requests yet.</p>
        )}
      </div>

      <div className="card">
        <h3>Deposit intents</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          What users have said they're about to send — informational only. Once you
          see it actually land in your wallet, credit it via Record entry or Set
          exact balance below.
        </p>
        {depositIntents.length ? (
          <table>
            <thead><tr><th>User</th><th>Coin</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {depositIntents.map((d) => (
                <tr key={d.id}>
                  <td>{d.display_name} <span className="muted" style={{ fontSize: 12 }}>@{d.username}</span></td>
                  <td><strong>{d.coin}</strong></td>
                  <td className="num">
                    {fmtCoin(d.amount)}
                    {usdValue(prices, d.coin, d.amount) && (
                      <div className="muted" style={{ fontSize: 11 }}>{usdValue(prices, d.coin, d.amount)}</div>
                    )}
                  </td>
                  <td className="muted">{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted empty-state">No deposit intents yet.</p>
        )}
      </div>

      <div className="card">
        <h3>Password reset requests</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          Users submit these when they can't sign in. Type a new password for them
          and share it with them directly (there's no email involved).
        </p>
        {resetMsg && (
          <p style={{ fontSize: 13, marginBottom: 10, color: resetMsg.includes('updated') ? 'var(--green)' : 'var(--red)' }}>
            {resetMsg}
          </p>
        )}
        {passwordResets.length ? (
          <table>
            <thead><tr><th>User</th><th>Status</th><th>New password</th><th></th></tr></thead>
            <tbody>
              {passwordResets.map((r) => (
                <tr key={r.id}>
                  <td>{r.display_name} <span className="muted" style={{ fontSize: 12 }}>@{r.username}</span></td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        background: r.status === 'resolved' ? 'var(--green-soft)' : '#FDF3E3',
                        color: r.status === 'resolved' ? 'var(--green)' : '#9A6A1B',
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === 'pending' ? (
                      <input
                        type="text"
                        placeholder="New password"
                        value={resetPasswordInputs[r.id] || ''}
                        onChange={(e) => setResetPasswordInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        style={{
                          width: '100%', maxWidth: 160, border: '1px solid var(--border)', borderRadius: 8,
                          padding: '6px 10px', fontSize: 13,
                        }}
                      />
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        by {r.resolved_by} on {new Date(r.resolved_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.status === 'pending' && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '5px 10px', fontSize: 12 }}
                        disabled={resettingId === r.id}
                        onClick={() => resolvePasswordReset(r.id)}
                      >
                        {resettingId === r.id ? '…' : 'Set password'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted empty-state">No password reset requests.</p>
        )}
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 24 }}>
        <div>
          <h3>Users</h3>
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Name</th><th>Holdings</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  style={{ background: selectedId === u.id ? 'var(--surface-raised)' : 'transparent' }}
                >
                  <td onClick={() => loadLedger(u.id)} style={{ cursor: 'pointer' }}>
                    <strong>{u.display_name}</strong><br />
                    <span className="muted" style={{ fontSize: 12 }}>@{u.username}</span>
                  </td>
                  <td onClick={() => loadLedger(u.id)} className="num" style={{ fontSize: 13, cursor: 'pointer' }}>
                    {u.holdings.length ? (
                      <>
                        {u.holdings.map((h) => `${fmtCoin(h.balance)} ${h.coin}`).join(', ')}
                        {(() => {
                          const total = u.holdings.reduce((sum, h) => {
                            const price = prices?.[BY_SYMBOL[h.coin]?.id]?.usd;
                            return price ? sum + Number(h.balance) * price : sum;
                          }, 0);
                          return total > 0 ? (
                            <div className="muted" style={{ fontSize: 11 }}>{fmtUsd(total)}</div>
                          ) : null;
                        })()}
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '5px 9px', fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-soft)' }}
                      disabled={deletingId === u.id}
                      onClick={() => deleteUser(u.id, u.display_name)}
                    >
                      {deletingId === u.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr><td colSpan={3} className="muted empty-state">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h3>{selectedUser ? `Record entry — ${selectedUser.display_name}` : 'Select a user'}</h3>
          {selectedUser ? (
            <>
              <form onSubmit={recordEntry} style={{ marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field">
                    <label>Type</label>
                    <select value={entry.type} onChange={(e) => setEntry({ ...entry, type: e.target.value })}>
                      <option value="deposit">Deposit</option>
                      <option value="withdrawal">Withdrawal</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Coin</label>
                    <select value={entry.coin} onChange={(e) => setEntry({ ...entry, coin: e.target.value })}>
                      {COINS.map((c) => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{entryUnit === 'usd' ? 'Amount (USD)' : `Amount (${entry.coin})`}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100, border: '1px solid var(--border)',
                          background: entryUnit === 'usd' ? 'var(--accent)' : 'var(--bg)',
                          color: entryUnit === 'usd' ? '#fff' : 'var(--text-muted)',
                        }}
                        onClick={() => { setEntryUnit('usd'); setEntry({ ...entry, amount: '' }); }}
                      >
                        USD
                      </button>
                      <button
                        type="button"
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100, border: '1px solid var(--border)',
                          background: entryUnit === 'coin' ? 'var(--accent)' : 'var(--bg)',
                          color: entryUnit === 'coin' ? '#fff' : 'var(--text-muted)',
                        }}
                        onClick={() => { setEntryUnit('coin'); setEntry({ ...entry, amount: '' }); }}
                      >
                        {entry.coin}
                      </button>
                    </span>
                  </label>
                  <input type="number" step="any" min="0" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} required />
                  {entryUnit === 'usd' && entry.amount && prices?.[BY_SYMBOL[entry.coin]?.id]?.usd && (
                    <p className="muted num" style={{ fontSize: 12, marginTop: 4 }}>
                      ≈ {fmtCoin(Number(entry.amount) / prices[BY_SYMBOL[entry.coin].id].usd)} {entry.coin}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label>Note (optional)</label>
                  <input value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} placeholder="e.g. wire ref #4471" />
                </div>
                <div className="field">
                  <label>Date (optional — defaults to right now)</label>
                  <input
                    type="date"
                    value={entry.created_at}
                    onChange={(e) => setEntry({ ...entry, created_at: e.target.value })}
                  />
                </div>
                <button className="btn btn-primary" disabled={busy}>Record entry</button>
              </form>

              <h3 style={{ marginTop: 24 }}>Set exact balance</h3>
              <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Sets the coin to this exact amount — enter 0 to zero out the account.
                Automatically records a deposit or withdrawal for the difference.
              </p>
              <form onSubmit={submitSetBalance} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Coin</label>
                  <select value={setBalanceForm.coin} onChange={(e) => setSetBalanceForm({ ...setBalanceForm, coin: e.target.value })}>
                    {COINS.map((c) => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{setBalanceUnit === 'usd' ? 'Target (USD)' : `Target (${setBalanceForm.coin})`}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100, border: '1px solid var(--border)',
                          background: setBalanceUnit === 'usd' ? 'var(--accent)' : 'var(--bg)',
                          color: setBalanceUnit === 'usd' ? '#fff' : 'var(--text-muted)',
                        }}
                        onClick={() => { setSetBalanceUnit('usd'); setSetBalanceForm({ ...setBalanceForm, target: '' }); }}
                      >
                        USD
                      </button>
                      <button
                        type="button"
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100, border: '1px solid var(--border)',
                          background: setBalanceUnit === 'coin' ? 'var(--accent)' : 'var(--bg)',
                          color: setBalanceUnit === 'coin' ? '#fff' : 'var(--text-muted)',
                        }}
                        onClick={() => { setSetBalanceUnit('coin'); setSetBalanceForm({ ...setBalanceForm, target: '' }); }}
                      >
                        {setBalanceForm.coin}
                      </button>
                    </span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={setBalanceForm.target}
                    onChange={(e) => setSetBalanceForm({ ...setBalanceForm, target: e.target.value })}
                    placeholder="0"
                    required
                  />
                  {setBalanceUnit === 'usd' && setBalanceForm.target && prices?.[BY_SYMBOL[setBalanceForm.coin]?.id]?.usd && (
                    <p className="muted num" style={{ fontSize: 12, marginTop: 4 }}>
                      ≈ {fmtCoin(Number(setBalanceForm.target) / prices[BY_SYMBOL[setBalanceForm.coin].id].usd)} {setBalanceForm.coin}
                    </p>
                  )}
                </div>
                <button className="btn btn-ghost" disabled={setBalanceBusy}>Set</button>
              </form>
              {setBalanceMsg && (
                <p style={{ fontSize: 13, marginTop: 8, color: setBalanceMsg.startsWith('Set to') || setBalanceMsg.startsWith('Already') ? 'var(--green)' : 'var(--red)' }}>
                  {setBalanceMsg}
                </p>
              )}

              <h3 style={{ marginTop: 24 }}>Ledger history</h3>
              <table style={{ marginTop: 12 }}>
                <thead><tr><th>Type</th><th>Coin</th><th>Amount</th><th>Note</th><th>By</th><th>Date</th></tr></thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <td><span className={`pill pill-${l.type}`}>{l.type}</span></td>
                      <td>{l.coin}</td>
                      <td className="num">
                        {fmtCoin(l.amount)}
                        {usdValue(prices, l.coin, l.amount) && (
                          <div className="muted" style={{ fontSize: 11 }}>{usdValue(prices, l.coin, l.amount)}</div>
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: 13 }}>{l.note || '—'}</td>
                      <td className="muted">{l.created_by}</td>
                      <td className="muted">
                        {editingDate[l.id] !== undefined ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              type="date"
                              value={editingDate[l.id]}
                              onChange={(e) => setEditingDate((prev) => ({ ...prev, [l.id]: e.target.value }))}
                              style={{
                                fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)',
                                borderRadius: 6, width: 130,
                              }}
                            />
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 8px', fontSize: 11 }}
                              disabled={savingDateId === l.id}
                              onClick={() => saveEntryDate(l.id)}
                            >
                              {savingDateId === l.id ? '…' : 'Save'}
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '4px 8px', fontSize: 11 }}
                              onClick={() => setEditingDate((prev) => {
                                const next = { ...prev };
                                delete next[l.id];
                                return next;
                              })}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span
                            style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text-muted)' }}
                            onClick={() => setEditingDate((prev) => ({
                              ...prev,
                              [l.id]: new Date(l.created_at).toISOString().slice(0, 10),
                            }))}
                            title="Click to edit date"
                          >
                            {new Date(l.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!ledger.length && (
                    <tr><td colSpan={6} className="muted empty-state">No entries yet.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted empty-state">Click a user on the left to record a deposit or withdrawal.</p>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
