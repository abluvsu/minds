import { MCPConfigLoader, MCPServerConfig } from './MCPConfigLoader';
import { MCPValidator } from './MCPValidator';

export class MCPRegistry {
  private servers = new Map<string, MCPServerConfig>();

  constructor() {
    this.reload();
  }

  public reload(): boolean {
    console.log('[MCP] Loading configuration...');
    const config = MCPConfigLoader.load();
    if (!config) {
      console.log('[MCP] No configuration found. Starting empty.');
      this.servers.clear();
      return false;
    }

    const validation = MCPValidator.validate(config);
    if (!validation.valid) {
      console.error(`[MCP] Configuration validation failed:\n  - ${validation.errors.join('\n  - ')}`);
      return false;
    }

    this.servers.clear();
    let loadedCount = 0;
    for (const server of config.servers) {
      this.servers.set(server.id, server);
      loadedCount++;
    }

    console.log(`[MCP] Loaded ${loadedCount} servers from registry.`);
    return true;
  }

  public getActiveServers(): MCPServerConfig[] {
    return Array.from(this.servers.values()).filter(s => s.enabled);
  }

  public getAllServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  public getServer(id: string): MCPServerConfig | undefined {
    return this.servers.get(id);
  }
}

export const globalMcpRegistry = new MCPRegistry();
