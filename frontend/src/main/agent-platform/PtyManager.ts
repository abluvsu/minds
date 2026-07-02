import * as pty from 'node-pty';
import { OutputParser } from './OutputParser';
import { globalEventBus } from './EventBus';

export interface SpawnOptions {
  sessionId: string;
  cwd: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class PtyManager {
  private sessions = new Map<string, { proc: pty.IPty; parser: OutputParser }>();

  spawn(opts: SpawnOptions) {
    if (this.sessions.has(opts.sessionId)) {
      throw new Error(`Session ${opts.sessionId} already exists`);
    }

    const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : process.env.SHELL || '/bin/sh';
    const shellArgs = process.platform === 'win32' 
      ? ['/c', `${opts.command} ${(opts.args || []).join(' ')}`]
      : ['-c', `${opts.command} ${(opts.args || []).join(' ')}`];

    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env } as Record<string, string>
    });

    const parser = new OutputParser(opts.sessionId);
    this.sessions.set(opts.sessionId, { proc, parser });

    proc.onData((data) => {
      parser.parseChunk(data);
    });

    proc.onExit(({ exitCode }) => {
      globalEventBus.emitEvent('session.exited', opts.sessionId, { exitCode });
      this.sessions.delete(opts.sessionId);
    });
  }

  write(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.proc.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.proc.resize(cols, rows);
    }
  }

  kill(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.proc.kill();
      this.sessions.delete(sessionId);
      globalEventBus.emitEvent('session.killed', sessionId);
    }
  }
}

export const globalPtyManager = new PtyManager();
