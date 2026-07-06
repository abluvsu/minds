import React, { useState, useEffect } from 'react';
import { TerminalFallback } from './TerminalFallback';

export const AgentWorkspace: React.FC = () => {
  const [agents, setAgents] = useState<any[]>([]);
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<string>('');

  useEffect(() => {
    // Load available agents
    window.agents.getRegistry().then((registry: any[]) => {
      setAgents(registry);
    });

    // Load available MCP servers
    if (window.mcp) {
      window.mcp.list().then((servers: any[]) => {
        setMcpServers(servers);
      });
    }

    // Listen to global agent events
    const removeListener = window.agents.onEvent((event: any) => {
      if (event.sessionId === activeSession) {
        if (event.type === 'agent.state') {
          setSessionState(`${event.payload.state}: ${event.payload.detail}`);
        } else if (event.type === 'session.exited') {
          setSessionState(`Exited with code ${event.payload.exitCode}`);
        }
      }
    });

    return () => removeListener();
  }, [activeSession]);

  const launchAgent = async (agentId: string) => {
    try {
      const sessionId = await window.agents.createSession(agentId, {
        cwd: process.cwd || '/', // fallback if not provided
        workspace: 'default'
      });
      setActiveSession(sessionId);
      setSessionState('Starting...');
    } catch (e: any) {
      console.error('Failed to launch agent', e);
    }
  };

  const killSession = async () => {
    if (activeSession) {
      await window.agents.killSession(activeSession);
      setActiveSession(null);
      setSessionState('');
    }
  };

  if (activeSession) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0a0a0f', color: '#fff' }}>
        <div style={{ padding: '8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <strong>Session: {activeSession}</strong>
            <span style={{ marginLeft: '12px', color: '#888' }}>{sessionState}</span>
          </div>
          <button onClick={killSession} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>
            Kill Session
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TerminalFallback sessionId={activeSession} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Agent Marketplace */}
      <div>
        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Agent Marketplace</h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {agents.map((agent) => (
            <div key={agent.id} style={{ border: '1px solid #333', borderRadius: '8px', padding: '16px', width: '250px', backgroundColor: '#111' }}>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>{agent.name}</h3>
              <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Executable: {agent.executable}</p>
              
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Supports</h4>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', background: '#333', padding: '2px 6px', borderRadius: '4px' }}>✓ CLI</span>
                  <span style={{ fontSize: '10px', background: '#333', padding: '2px 6px', borderRadius: '4px' }}>✓ MCP</span>
                  {Object.entries(agent.capabilities).filter(([_, v]) => v).map(([k]) => (
                    <span key={k} style={{ fontSize: '10px', background: '#333', padding: '2px 6px', borderRadius: '4px' }}>✓ {k}</span>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => launchAgent(agent.id)}
                style={{ width: '100%', padding: '8px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Launch Agent
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* MCP Dashboard */}
      <div>
        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Active MCP Servers</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '600px' }}>
          {mcpServers.length === 0 ? (
            <p style={{ color: '#888' }}>No MCP servers configured.</p>
          ) : (
            mcpServers.map((server) => (
              <div key={server.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', padding: '12px 16px', borderRadius: '8px', border: '1px solid #333' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: server.enabled ? '#10b981' : '#6b7280' }}>
                    {server.enabled ? '✓' : '✕'}
                  </span>
                  <span style={{ fontWeight: 'bold' }}>{server.id}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#888', display: 'flex', gap: '16px' }}>
                  <span>Transport: stdio</span>
                  <span>Command: {server.command} {server.args?.[0]}</span>
                  <span style={{ color: server.enabled ? '#10b981' : '#f59e0b' }}>
                    {server.enabled ? 'ready' : 'disabled'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
