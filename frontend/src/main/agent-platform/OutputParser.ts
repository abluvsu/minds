import { globalEventBus } from './EventBus';

export class OutputParser {
  private sessionId: string;
  private buffer: string = '';

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  parseChunk(chunk: string) {
    this.buffer += chunk;
    
    // Very naive structural parsing for demonstration
    // A robust implementation would look for specific ANSI sequences or known patterns
    // emitted by Claude/Codex (e.g. "Tool run", "Thinking...")
    
    if (this.buffer.includes('Thinking...')) {
      globalEventBus.emitEvent('agent.state', this.sessionId, { state: 'Busy', detail: 'Thinking' });
      this.buffer = this.buffer.replace('Thinking...', '');
    }

    if (this.buffer.includes('Error:')) {
      globalEventBus.emitEvent('agent.error', this.sessionId, { message: 'An error occurred in execution.' });
      this.buffer = '';
    }

    // Always emit the raw output as well for fallback terminal rendering
    globalEventBus.emitEvent('agent.output', this.sessionId, { text: chunk });
  }
}
