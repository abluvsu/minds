import { MCPConfiguration, MCPServerConfig } from './MCPConfigLoader';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class MCPValidator {
  static validate(config: MCPConfiguration | null): ValidationResult {
    const errors: string[] = [];

    if (!config) {
      return { valid: false, errors: ['Configuration is null or undefined'] };
    }

    if (config.version !== 1) {
      errors.push(`Unsupported configuration version: ${config.version}. Expected 1.`);
    }

    if (!Array.isArray(config.servers)) {
      errors.push('The "servers" property must be an array.');
      return { valid: false, errors };
    }

    const seenIds = new Set<string>();

    for (let i = 0; i < config.servers.length; i++) {
      const server = config.servers[i];
      if (!server.id) {
        errors.push(`Server at index ${i} is missing an "id".`);
      } else {
        if (seenIds.has(server.id)) {
          errors.push(`Duplicate server id found: "${server.id}".`);
        }
        seenIds.add(server.id);
      }

      if (!server.command) {
        errors.push(`Server "${server.id || i}" is missing a "command".`);
      }

      if (server.args && !Array.isArray(server.args)) {
        errors.push(`Server "${server.id || i}" args must be an array of strings.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateServer(server: MCPServerConfig): ValidationResult {
    const errors: string[] = [];
    if (!server.id) errors.push('Missing "id"');
    if (!server.command) errors.push('Missing "command"');
    if (server.args && !Array.isArray(server.args)) errors.push('Args must be an array');
    
    return { valid: errors.length === 0, errors };
  }
}
