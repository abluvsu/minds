import { useEffect, useState } from 'react';
import { host } from '../platform/host';

// Full-width red card shown when the main process gives up on the server
// (`server:unrecoverable` IPC). Offers a single "Restart engine" action —
// no data-reset option. The card re-shows itself if the watchdog re-emits
// the event after a failed restart, so dismissing on click is safe.
export function EngineStatusCard() {
  const [visible, setVisible] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const unsub = host.onServerUnrecoverable(() => setVisible(true));
    return unsub;
  }, []);

  if (!visible) return null;

  const handleRestart = async () => {
    setRestarting(true);
    try {
      const res = await host.restartServer();
      // Dismiss on success. A failed restart re-fires the IPC and brings
      // the card back, so an optimistic clear here is self-healing.
      if (!res || res.ok !== false) {
        setVisible(false);
      }
    } catch {
      // Keep the card up — the user can retry.
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#b42318',
        color: '#ffffff',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        The engine stopped responding.
      </div>
      <button
        type="button"
        onClick={handleRestart}
        disabled={restarting}
        style={{
          flexShrink: 0,
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.6)',
          background: 'rgba(255,255,255,0.12)',
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 600,
          cursor: restarting ? 'progress' : 'pointer',
        }}
      >
        {restarting ? 'Restarting…' : 'Restart engine'}
      </button>
    </div>
  );
}

export default EngineStatusCard;
