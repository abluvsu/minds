import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface TerminalFallbackProps {
  sessionId: string;
}

export const TerminalFallback: React.FC<TerminalFallbackProps> = ({ sessionId }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    term.current = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e2e8f0',
        cursor: '#4f46e5'
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    term.current.loadAddon(fitAddon);
    term.current.loadAddon(new WebLinksAddon());

    term.current.open(terminalRef.current);
    fitAddon.fit();

    // Send keystrokes back to main
    term.current.onData((data) => {
      window.agents.write(sessionId, data);
    });

    const handleResize = () => {
      fitAddon.fit();
      if (term.current) {
        window.agents.resize(sessionId, term.current.cols, term.current.rows);
      }
    };
    window.addEventListener('resize', handleResize);
    
    // Listen to agent events from the main process
    const removeListener = window.agents.onEvent((event: any) => {
      if (event.sessionId === sessionId && event.type === 'agent.output') {
        term.current?.write(event.payload.text);
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      removeListener();
      term.current?.dispose();
    };
  }, [sessionId]);

  return (
    <div 
      ref={terminalRef} 
      style={{ width: '100%', height: '100%', padding: '8px' }} 
    />
  );
};
