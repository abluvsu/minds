export interface AgentCapabilities {
  filesystem: boolean;
  terminal: boolean;
  network: boolean;
  git: boolean;
  browser: boolean;
  mcp: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  executable: string;
  defaultArgs: string[];
  icon: string;
  capabilities: AgentCapabilities;
}

export class AgentRegistry {
  private agents: Map<string, AgentConfig> = new Map();

  constructor() {
    this.registerDefaultAgents();
  }

  private registerDefaultAgents() {
    this.register({
      id: 'claude',
      name: 'Claude Code',
      executable: 'claude',
      defaultArgs: [],
      icon: 'claude-icon',
      capabilities: {
        filesystem: true,
        terminal: true,
        network: true,
        git: true,
        browser: true,
        mcp: true
      }
    });

    this.register({
      id: 'agy',
      name: 'Antigravity',
      executable: 'agy',
      defaultArgs: [],
      icon: 'agy-icon',
      capabilities: {
        filesystem: true,
        terminal: true,
        network: true,
        git: true,
        browser: false,
        mcp: false
      }
    });

    this.register({
      id: 'codex',
      name: 'OpenAI Codex',
      executable: 'codex',
      defaultArgs: [],
      icon: 'codex-icon',
      capabilities: {
        filesystem: true,
        terminal: false,
        network: false,
        git: true,
        browser: false,
        mcp: false
      }
    });
  }

  register(agent: AgentConfig) {
    this.agents.set(agent.id, agent);
  }

  getAgent(id: string): AgentConfig | undefined {
    return this.agents.get(id);
  }

  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }
}
