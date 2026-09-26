import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationEngine, resolveDueAt } from './engine';
import { db } from '@/db';

vi.mock('@/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/domains/tags/service', () => ({ TagService: { getForLead: async () => [] } }));

// Expose the private method for testing purposes
const evaluateConditionGroup = (AutomationEngine as any).evaluateConditionGroup.bind(AutomationEngine);

// Queue the two selects evaluateAndExecute runs: conditions (none), then the actions list.
function mockActions(actions: any[]) {
  (db.select as any)
    .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve(actions) }) }) });
}

describe('AutomationEngine Conditions', () => {
  it('should pass base conditions', () => {
    const lead = { status: 'new', score: 100, company: 'Acme Corp' };
    
    expect(evaluateConditionGroup(lead, { field: 'status', operator: 'equals', value: 'new' })).toBe(true);
    expect(evaluateConditionGroup(lead, { field: 'status', operator: 'not_equals', value: 'active' })).toBe(true);
    expect(evaluateConditionGroup(lead, { field: 'score', operator: 'greater_than', value: 50 })).toBe(true);
    expect(evaluateConditionGroup(lead, { field: 'company', operator: 'contains', value: 'Acme' })).toBe(true);
    expect(evaluateConditionGroup(lead, { field: 'company', operator: 'does_not_contain', value: 'Global' })).toBe(true);
  });

  it('should evaluate AND groups', () => {
    const lead = { status: 'new', score: 100 };
    const group = {
      type: 'AND',
      conditions: [
        { field: 'status', operator: 'equals', value: 'new' },
        { field: 'score', operator: 'greater_than', value: 50 }
      ]
    };

    expect(evaluateConditionGroup(lead, group)).toBe(true);

    const failingGroup = {
      type: 'AND',
      conditions: [
        { field: 'status', operator: 'equals', value: 'active' },
        { field: 'score', operator: 'greater_than', value: 50 }
      ]
    };
    expect(evaluateConditionGroup(lead, failingGroup)).toBe(false);
  });

  it('should evaluate OR groups', () => {
    const lead = { status: 'active', score: 100 };
    const group = {
      type: 'OR',
      conditions: [
        { field: 'status', operator: 'equals', value: 'new' },
        { field: 'score', operator: 'greater_than', value: 50 }
      ]
    };

    expect(evaluateConditionGroup(lead, group)).toBe(true);
  });
});

describe('AutomationEngine action execution (best-effort)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('continues after a failing action and completes on partial success', async () => {
    mockActions([{ type: 'send_whatsapp', config: {} }, { type: 'enroll_in_sequence', config: {} }]);
    const exec = vi.spyOn(AutomationEngine as any, 'executeAction')
      .mockRejectedValueOnce(new Error('no BSP'))   // WhatsApp fails
      .mockResolvedValueOnce(undefined);            // enroll succeeds
    const res = await AutomationEngine.evaluateAndExecute('a1', 'l1');
    expect(exec).toHaveBeenCalledTimes(2);          // second action still ran
    expect(res.executedCount).toBe(1);
    expect((res as any).failures).toHaveLength(1);
  });

  it('throws (→ retry) only when every action fails', async () => {
    mockActions([{ type: 'send_whatsapp', config: {} }]);
    vi.spyOn(AutomationEngine as any, 'executeAction').mockRejectedValue(new Error('boom'));
    await expect(AutomationEngine.evaluateAndExecute('a1', 'l1')).rejects.toThrow(/All actions failed/);
  });
});

describe('call.logged conditions', () => {
  beforeEach(() => vi.clearAllMocks());

  // Queue: the automation's condition, the lead row, then (only if the rule passes) its actions.
  function mockCallRule(condition: any, passes: boolean) {
    (db.select as any)
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ config: condition }]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'l1', status: 'new' }]) }) }) });
    if (passes) (db.select as any).mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve([{ type: 'add_note', config: { content: 'x' } }]) }) }) });
  }
  const call = (over: any) => ({ leadId: 'l1', call: { activityId: 'a', outcome: 'no_answer', direction: 'outgoing', durationSec: 0, unansweredStreak: 1, ...over } });

  it('matches on the call itself: third unanswered call, long calls', async () => {
    const exec = vi.spyOn(AutomationEngine as any, 'executeAction').mockResolvedValue(undefined);
    const third = { field: 'call_unanswered_streak', operator: 'equals', value: 3 };

    mockCallRule(third, false);
    expect((await AutomationEngine.evaluateAndExecute('a1', 'l1', call({ unansweredStreak: 2 }) as any)).skipped).toBe(true);
    mockCallRule(third, true);
    expect((await AutomationEngine.evaluateAndExecute('a1', 'l1', call({ unansweredStreak: 3 }) as any)).skipped).toBe(false);

    const long = { field: 'call_duration_sec', operator: 'greater_than', value: 120 };
    mockCallRule(long, false);
    expect((await AutomationEngine.evaluateAndExecute('a1', 'l1', call({ outcome: 'answered', durationSec: 95 }) as any)).skipped).toBe(true);
    mockCallRule(long, true);
    expect((await AutomationEngine.evaluateAndExecute('a1', 'l1', call({ outcome: 'answered', durationSec: 180 }) as any)).skipped).toBe(false);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe('resolveDueAt (relative due dates)', () => {
  it('computes relative offsets from now', () => {
    const now = Date.now();
    expect(resolveDueAt({ somethingElse: 1 } as any)).toBeNull(); // unknown key → no due
    const d = resolveDueAt({ dueInDays: 2 })!;
    expect(d.getTime()).toBeGreaterThan(now + 2 * 86_400_000 - 5000);
    expect(d.getTime()).toBeLessThan(now + 2 * 86_400_000 + 5000);
    const h = resolveDueAt({ dueInHours: 3 })!;
    expect(Math.round((h.getTime() - now) / 3_600_000)).toBe(3);
  });

  it('honors an absolute dueAt override and rejects garbage', () => {
    expect(resolveDueAt({ dueAt: '2030-01-01T00:00:00Z' })!.getUTCFullYear()).toBe(2030);
    expect(resolveDueAt({ dueAt: 'not-a-date' })).toBeNull();
    expect(resolveDueAt({})).toBeNull();
  });
});
