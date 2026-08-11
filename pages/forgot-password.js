import { useState } from 'react';
import { useRouter } from 'next/router';

export default function ForgotPassword() {
  const router = useRouter();
  const [mode, setMode] = useState('self'); // self | admin

  // Self-service reset (username + recovery code + new password)
  const [username, setUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Admin-mediated fallback (username only)
  const [adminUsername, setAdminUsername] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSubmitted, setAdminSubmitted] = useState(false);

  async function onSelfSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, recovery_code: recoveryCode, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setResetDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onAdminSubmit(e) {
    e.preventDefault();
    setAdminError('');
    setAdminLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Something went wrong');
      }
      setAdminSubmitted(true);
    } catch (err) {
      setAdminError(err.message);
    } finally {
      setAdminLoading(false);
    }
  }

  if (resetDone) {
    return (
      <div className="auth-shell">
        <div className="auth-card card">
          <div className="eyebrow">Account</div>
          <h1>Password updated</h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            Your new password is set. Sign in with it now.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => router.push('/login')}>
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'admin') {
    return (
      <div className="auth-shell">
        <div className="auth-card card">
          <div className="eyebrow">Account</div>
          <h1>Ask your admin to reset it</h1>

          {adminSubmitted ? (
            <>
              <p className="muted" style={{ marginBottom: 20, lineHeight: 1.5 }}>
                If that username exists, a reset request has been sent to the admin.
                They'll set a new password for you and share it with you directly.
              </p>
              <a href="/login" className="btn btn-primary" style={{ width: '100%' }}>Back to sign in</a>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: 20 }}>
                No recovery code? Enter your username and the admin will be notified
                to reset your password.
              </p>
              <form onSubmit={onAdminSubmit}>
                <div className="field">
                  <label htmlFor="adminUsername">Username</label>
                  <input id="adminUsername" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} required autoFocus />
                </div>
                {adminError && <p className="error-text">{adminError}</p>}
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={adminLoading}>
                  {adminLoading ? 'Submitting…' : 'Submit request'}
                </button>
              </form>
            </>
          )}

          <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('self'); }}>← Use my recovery code instead</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div className="eyebrow">Account</div>
        <h1>Reset your password</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Enter your username, your recovery code, and a new password.
        </p>
        <form onSubmit={onSelfSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="recoveryCode">Recovery code</label>
            <input
              id="recoveryCode"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setMode('admin'); }}>Don't have a recovery code?</a>
        </p>
        <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          <a href="/login">← Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
