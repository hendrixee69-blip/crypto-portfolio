import { useState } from 'react';
import { useRouter } from 'next/router';
import { requireRole } from '../../lib/auth';

export async function getServerSideProps({ req }) {
  const session = requireRole(req, 'admin');
  if (!session) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  return { props: { adminUsername: session.username } };
}

export default function ChangePassword({ adminUsername }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="container">
      <div className="header">
        <div className="brand"><span className="dot" /> Coinmy <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· admin</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 14 }}>{adminUsername}</span>
          <a className="nav-link" href="/admin">Back to admin</a>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <div className="eyebrow">Account</div>
        <h1>Change password</h1>
        <p className="muted" style={{ marginBottom: 20 }}>Update the password for this admin account.</p>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && <p className="error-text">{error}</p>}
          {success && <p style={{ color: 'var(--accent)', fontSize: 13, marginTop: 8 }}>Password updated successfully.</p>}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
      </div>
    </>
  );
}
