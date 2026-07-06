import { MCPServerConfig } from './MCPConfigLoader';

export class MCPEnvironment {
  /**
   * Builds the environment variables required to inject MCP servers into a runtime.
   * Currently formats for runtimes that accept `mcp.json` structure via an ENV var,
   * similar to Claude Code (which takes an MCP configuration file or env injects).
   * 
   * Example output for Claude Code:
   * MCP_SERVERS='{"filesystem":{"command":"npx","args":["..."]}}'
   */
  static buildEnv(servers: MCPServerConfig[]): Record<string, string> {
    if (servers.length === 0) {
      return {};
    }

    const mcpConfig: Record<string, any> = { mcpServers: {} };

    for (const server of servers) {
      mcpConfig.mcpServers[server.id] = {
        command: server.command,
        args: server.args || [],
        env: server.env || {}
      };
    }

    // Claude Code specifically supports MCP config via CLAUDE_CONFIG or similar,
    // but the most universal pass-through for MCP-capable CLI tools is providing the serialized map.
    // We'll provide it as MCP_SERVERS for agents to consume.
    return {
      MCP_SERVERS: JSON.stringify(mcpConfig.mcpServers)
    };
  }
}
