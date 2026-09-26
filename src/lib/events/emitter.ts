import { EventEmitter } from 'events';

export type EventPayload = {
  leadId: string;
  sourceId?: string;
  userId?: string;
  ownerId?: string;
  teamId?: string | null;
  assignedById?: string;
  oldStatus?: string;
  newStatus?: string;
  changes?: Record<string, any>;
  followUpId?: string;
  title?: string;
  type?: string;
  source?: string; // e.g. 'automation' — used to stop automations from re-triggering automations
  meetingId?: string;
  startAt?: string; // ISO — meeting start
  // call.logged: what happened on the call, for automation conditions (call_outcome, call_duration_sec…)
  call?: {
    activityId: string;
    outcome: "answered" | "no_answer" | "busy" | "wrong_number" | "missed" | "unknown";
    direction: "outgoing" | "incoming";
    durationSec: number | null; // null = logged by hand, no call log
    unansweredStreak: number; // outgoing calls in a row not picked up, this one included
  };
};

export interface SystemEvents {
  'lead.created': (payload: EventPayload) => void;
  'lead.updated': (payload: EventPayload) => void;
  'lead.assigned': (payload: EventPayload) => void;
  'lead.stage_changed': (payload: EventPayload) => void;
  'lead.status_changed': (payload: EventPayload) => void;
  'lead.tag_added': (payload: EventPayload) => void;
  'follow_up.scheduled': (payload: EventPayload) => void;
  'follow_up.completed': (payload: EventPayload) => void;
  'follow_up.rescheduled': (payload: EventPayload) => void;
  'follow_up.overdue': (payload: EventPayload) => void;
  'task.completed': (payload: EventPayload) => void;
  'meeting.scheduled': (payload: EventPayload) => void;
  'meeting.rescheduled': (payload: EventPayload) => void;
  'meeting.completed': (payload: EventPayload) => void;
  'meeting.no_show': (payload: EventPayload) => void;
  'meeting.cancelled': (payload: EventPayload) => void;
  'call.logged': (payload: EventPayload) => void;
}

export const MEETING_EVENTS = ['meeting.scheduled', 'meeting.rescheduled', 'meeting.completed', 'meeting.no_show', 'meeting.cancelled'] as const;
export type MeetingEvent = (typeof MEETING_EVENTS)[number];

class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof SystemEvents>(eventName: K, ...args: Parameters<SystemEvents[K]>): boolean {
    return super.emit(eventName, ...args);
  }

  on<K extends keyof SystemEvents>(eventName: K, listener: SystemEvents[K]): this {
    return super.on(eventName, listener);
  }
}

// Store the bus on globalThis so every server bundle (server actions, route handlers,
// instrumentation) shares ONE emitter. Without this, Next duplicates the module and
// listeners registered in one bundle never see emits from another.
const globalForEvents = globalThis as unknown as { __eventBus?: TypedEventEmitter };
export const eventBus = globalForEvents.__eventBus ?? (globalForEvents.__eventBus = new TypedEventEmitter());
