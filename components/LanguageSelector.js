import { useState } from 'react';

const LANGUAGES = [
  { name: 'English', region: 'Global' },
  { name: 'Español', region: 'United States' },
  { name: 'English', region: 'United Kingdom' },
  { name: 'Deutsch', region: 'Germany' },
  { name: 'Français', region: 'France' },
  { name: 'Português', region: 'Brasil' },
  { name: '日本語', region: '日本' },
  { name: '中文', region: '中国' },
  { name: 'العربية', region: 'العالم العربي' },
];

export default function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const filtered = LANGUAGES.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return l.name.toLowerCase().includes(q) || l.region.toLowerCase().includes(q);
  });

  return (
    <>
      <button
        className="nav-link"
        style={{ width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
        onClick={() => setOpen(true)}
        aria-label="Language and region"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,11,13,0.4)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '10vh', zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: '100%', maxWidth: 380, maxHeight: '70vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Language and region</h3>
              <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setOpen(false)}>✕</button>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              style={{
                width: '100%', border: '1px solid var(--border)', borderRadius: 100,
                padding: '10px 16px', fontSize: 14, marginBottom: 14, background: 'var(--bg-soft)',
                color: 'var(--text)',
              }}
              autoFocus
            />

            <div>
              {filtered.map((l) => {
                const idx = LANGUAGES.indexOf(l);
                return (
                  <div
                    key={`${l.name}-${l.region}`}
                    onClick={() => { setSelected(idx); setOpen(false); }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{l.name}</div>
                      <div className="muted" style={{ fontSize: 13 }}>{l.region}</div>
                    </div>
                    {selected === idx && <span style={{ color: 'var(--green)', fontSize: 16 }}>✓</span>}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="muted" style={{ padding: '12px 4px' }}>No matches.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
