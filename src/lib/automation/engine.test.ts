import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationEngine } from './engine';
import { db } from '@/db';

vi.mock('@/db', () => ({ db: { select: vi.fn() } }));

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
