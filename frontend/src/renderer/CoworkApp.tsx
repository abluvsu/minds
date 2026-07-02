// Mounts the cowork React UI inside antontron. Antontron's renderer owns
// terms/install/onboarding gating; this component is rendered after those
// pass, in place of the old <Terminal /> page.
//
// Cowork's globals.css ships its own theme tokens (--surface-*, --primary-*,
// --frost-*, etc.). It's loaded here so cowork views render correctly
// regardless of antontron's own styles.
import './cowork/styles/globals.css';
import CoworkRoot from './cowork/App';
import React, { useState } from 'react';
import { AgentWorkspace } from './components/AgentWorkspace';

export default function CoworkApp() {
  const [showAgent, setShowAgent] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0a0a0f', padding: '8px', borderBottom: '1px solid #333' }}>
        <button 
          onClick={() => setShowAgent(!showAgent)}
          style={{ background: '#3b82f6', color: 'white', padding: '4px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', zIndex: 9999, position: 'relative' }}
        >
          {showAgent ? 'Back to MindsHub' : 'Open Agent Workspace'}
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {showAgent ? <AgentWorkspace /> : <CoworkRoot />}
      </div>
    </div>
  );
}
