import { useEffect, useState } from 'react';
import { fetchHarnesses, fetchHarnessStatus } from '../../api';

const rowStyle = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
  border: '1px solid var(--border-subtle)', borderRadius: 10, marginBottom: 8,
};
const btn = { fontSize: 12, padding: '5px 10px' };

function Dot({ ok }) {
  const color = ok === true ? 'var(--success, #2da44e)' : ok === false ? 'var(--danger)' : 'var(--text-muted)';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />;
}

// A sibling section to Model Sources — coworkers that spawn an external
// CLI (Claude Code, Antigravity, …) rather than calling an API key from
// the registry. Auto-detects install + login status per coworker; there
// is nothing to configure here (no key/URL to enter) since each CLI
// manages its own auth via its own login command.
export default function CliAgentsPanel() {
  const [agents, setAgents] = useState(null); // null = loading
  const [statusById, setStatusById] = useState({});
  const [checkingId, setCheckingId] = useState(null);

  const checkOne = async (id) => {
    setCheckingId(id);
    const s = await fetchHarnessStatus(id);
    setStatusById((prev) => ({ ...prev, [id]: s }));
    setCheckingId(null);
  };

  useEffect(() => {
    fetchHarnesses().then((all) => {
      const cli = all.filter((h) => h.category === 'CLI');
      setAgents(cli);
      cli.forEach((h) => checkOne(h.id));
    });
  }, []);

  if (agents === null) {
    return <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Loading…</p>;
  }
  if (agents.length === 0) {
    return <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No CLI coworkers registered.</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 10px' }}>
        Coworkers that run your own installed CLI (logged into your subscription) instead of
        an API key — nothing to configure here beyond logging into the CLI itself. They show up
        alongside your model sources in the composer's coworker picker.
      </p>
      {agents.map((h) => {
        const s = statusById[h.id];
        const busy = checkingId === h.id;
        return (
          <div key={h.id} style={rowStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: 13 }}>{h.label}</strong>{' '}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(h.tags || []).join(' · ')}</span>
              </div>
              <button type="button" className="btn-secondary" style={btn} disabled={busy} onClick={() => checkOne(h.id)}>
                {busy ? 'Checking…' : 'Check status'}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              <Dot ok={s?.installed} /> {s?.installed ? `Installed (${s.path})` : s ? 'Not installed' : 'Not checked yet'}
            </div>
            {s?.installed && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                <Dot ok={s.loggedIn} /> {s.detail || (s.loggedIn ? 'Logged in' : 'Not logged in')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
