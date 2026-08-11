import { useState } from 'react';

export default function ForgotPassword() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Something went wrong');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div className="eyebrow">Account</div>
        <h1>Reset your password</h1>

        {submitted ? (
          <>
            <p className="muted" style={{ marginBottom: 20, lineHeight: 1.5 }}>
              If that username exists, a reset request has been sent to the admin.
              They'll set a new password for you — reach out to them directly if
              you need it urgently.
            </p>
            <a href="/login" className="btn btn-primary" style={{ width: '100%' }}>Back to sign in</a>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 20 }}>
              Enter your username and the admin will be notified to reset your password.
            </p>
            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
              </div>
              {error && <p className="error-text">{error}</p>}
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                {loading ? 'Submitting…' : 'Submit request'}
              </button>
            </form>
          </>
        )}

        <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
          <a href="/login">← Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
