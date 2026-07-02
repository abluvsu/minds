import { AgentRegistry } from './AgentRegistry';
import { globalPtyManager } from './PtyManager';
import { globalEventBus, AgentState } from './EventBus';
import Store from 'electron-store';

export interface SessionContext {
  cwd: string;
  workspace: string;
  env?: Record<string, string>;
}

export interface Session {
  id: string;
  agentId: string;
  context: SessionContext;
  state: AgentState;
  createdAt: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private registry: AgentRegistry;
  private store: any = new Store({
    name: 'agent-sessions',
    defaults: { sessions: {} }
  });

  constructor(registry: AgentRegistry) {
    this.registry = registry;
    this.restoreSessions();
  }

  private restoreSessions() {
    const saved = this.store.get('sessions') || {};
    for (const [id, session] of Object.entries(saved)) {
      const s = session as Session;
      s.state = 'Exited';
      this.sessions.set(id, s);
    }
  }

  private saveSessions() {
    const data: Record<string, Session> = {};
    for (const [id, session] of this.sessions.entries()) {
      data[id] = session;
    }
    this.store.set('sessions', data);
  }

  createSession(agentId: string, context: SessionContext): string {
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const session: Session = {
      id: sessionId,
      agentId,
      context,
      state: 'Creating',
      createdAt: Date.now()
    };

    this.sessions.set(sessionId, session);
    this.saveSessions();
    globalEventBus.emitEvent('session.created', sessionId, { session, agent });

    try {
      globalPtyManager.spawn({
        sessionId,
        cwd: context.cwd,
        command: agent.executable,
        args: agent.defaultArgs,
        env: context.env
      });

      session.state = 'Ready';
      this.saveSessions();
      globalEventBus.emitEvent('session.ready', sessionId);
    } catch (e: any) {
      session.state = 'Error';
      this.saveSessions();
      globalEventBus.emitEvent('session.error', sessionId, { error: e.message });
    }

    return sessionId;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  killSession(id: string) {
    globalPtyManager.kill(id);
    const session = this.sessions.get(id);
    if (session) {
      session.state = 'Exited';
      this.saveSessions();
    }
  }
}
