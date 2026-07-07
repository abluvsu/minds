import { useEffect, useState } from 'react';
import { host } from '../platform/host';

// Slim yellow banner shown when the app boots against an external dev
// server (`server:dev-mode` IPC) rather than the managed one. Purely
// informational — no dismiss control, since dev mode persists for the
// session.
export function DevModeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const unsub = host.onServerDevMode(() => setShow(true));
    return unsub;
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        background: '#facc15',
        color: '#3a2f00',
        padding: '6px 20px',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        textAlign: 'center',
      }}
    >
      DEV SERVER — external engine, not managed by the app
    </div>
  );
}

export default DevModeBanner;
