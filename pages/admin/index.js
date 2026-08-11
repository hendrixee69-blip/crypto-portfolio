import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { requireRole } from '../../lib/auth';
import { COINS } from '../../lib/coins';

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
  const [entry, setEntry] = useState({ type: 'deposit', coin: 'BTC', amount: '', note: '' });
  const [addresses, setAddresses] = useState({});
  const [addrForm, setAddrForm] = useState({ coin: 'BTC', address: '' });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [resolvingId, setResolvingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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

  useEffect(() => { loadUsers(); loadSettings(); loadWithdrawalRequests(); }, []);

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
    setBusy(true);
    try {
      const res = await fetch('/api/admin/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, user_id: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntry({ type: 'deposit', coin: 'BTC', amount: '', note: '' });
      await Promise.all([loadUsers(), loadLedger(selectedId)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
                  <td className="num">{Number(r.amount).toLocaleString()}</td>
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
                    {u.holdings.length ? u.holdings.map((h) => `${Number(h.balance).toLocaleString()} ${h.coin}`).join(', ') : '—'}
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
                  <label>Amount</label>
                  <input type="number" step="any" min="0" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Note (optional)</label>
                  <input value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} placeholder="e.g. wire ref #4471" />
                </div>
                <button className="btn btn-primary" disabled={busy}>Record entry</button>
              </form>

              <h3 style={{ marginTop: 24 }}>Ledger history</h3>
              <table style={{ marginTop: 12 }}>
                <thead><tr><th>Type</th><th>Coin</th><th>Amount</th><th>By</th><th>Date</th></tr></thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <td><span className={`pill pill-${l.type}`}>{l.type}</span></td>
                      <td>{l.coin}</td>
                      <td className="num">{Number(l.amount).toLocaleString()}</td>
                      <td className="muted">{l.created_by}</td>
                      <td className="muted">{new Date(l.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!ledger.length && (
                    <tr><td colSpan={5} className="muted empty-state">No entries yet.</td></tr>
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
