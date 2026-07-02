import { EventEmitter } from 'events';

export type AgentState = 'Creating' | 'Ready' | 'Busy' | 'WaitingForInput' | 'Error' | 'Exited';

export interface AgentEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  payload: any;
}

export class EventBus extends EventEmitter {
  constructor() {
    super();
  }

  emitEvent(type: string, sessionId: string, payload: any = {}) {
    const event: AgentEvent = {
      type,
      sessionId,
      timestamp: Date.now(),
      payload
    };
    this.emit('event', event);
  }

  onEvent(listener: (event: AgentEvent) => void) {
    this.on('event', listener);
  }
}

export const globalEventBus = new EventBus();
