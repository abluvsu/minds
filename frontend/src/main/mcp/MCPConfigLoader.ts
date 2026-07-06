import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface MCPServerConfig {
  id: string;
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPConfiguration {
  version: number;
  servers: MCPServerConfig[];
}

export class MCPConfigLoader {
  private static configPath: string = path.join(
    app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd(),
    '.minds',
    'mcp',
    'servers.json'
  );

  static setConfigPath(overridePath: string) {
    this.configPath = overridePath;
  }

  static getConfigPath(): string {
    return this.configPath;
  }

  static load(): MCPConfiguration | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(raw) as MCPConfiguration;
      }
      return null;
    } catch (e: any) {
      console.error(`[MCP] Failed to load MCP configuration from ${this.configPath}: ${e.message}`);
      return null;
    }
  }

  static save(config: MCPConfiguration): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`[MCP] Configuration saved to ${this.configPath}`);
    } catch (e: any) {
      console.error(`[MCP] Failed to save MCP configuration: ${e.message}`);
    }
  }
}
