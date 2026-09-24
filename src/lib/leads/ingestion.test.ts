import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService } from './ingestion';
import { NormalizedLeadPayload } from '../integrations/types';

// Assignment counts open leads by status category; use the built-in statuses (no DB round trip).
vi.mock("@/domains/leads/customStatusSchemaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domains/leads/customStatusSchemaService")>();
  const base = new Map(actual.DEFAULT_SYSTEM_STATUSES.map((s) => [s.key, s.category]));
  const keys = (...c: string[]) => [...base].filter(([, v]) => c.includes(v)).map(([k]) => k);
  return {
    ...actual,
    CustomStatusSchemaService: Object.assign(actual.CustomStatusSchemaService, {
      resolver: async () => ({ cat: (s: string | null | undefined) => base.get(s ?? "") ?? "open", openKeys: keys("open", "in_progress"), closedKeys: keys("won", "lost", "unqualified") }),
    }),
  };
});


// Mock DB
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]), // Default to no existing lead
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'updated-123' }]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-123' }])
    }),
    // Assignment runs in a locking transaction; the tx finds no rule, so it no-ops.
    transaction: vi.fn(async (cb: any) => cb({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    })),
  },
}));

describe('IngestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(IngestionService, 'logIngestion').mockResolvedValue(undefined);
  });

  it('should throw an error if both email and phone are missing', async () => {
    const payload: NormalizedLeadPayload = {
      name: 'Test User',
      sourceId: 'source-1',
      organizationId: 'org-1',
      customData: {},
    };

    await expect(IngestionService.processLead(payload)).rejects.toThrow('Email or phone is required');
  });

  it('should create a new lead if no duplicate is found', async () => {
    const { db } = await import('@/db');
    // Ensure select returns empty array (no duplicates)
    ((db as any).limit as any).mockResolvedValueOnce([]);

    const payload: NormalizedLeadPayload = {
      name: 'New Lead',
      email: 'new@example.com',
      sourceId: 'source-1',
      organizationId: 'org-1',
      customData: {},
    };

    const result = await IngestionService.processLead(payload);
    
    expect(result.status).toBe('success');
    expect(result.leadId).toBe('new-123');
    expect(db.insert).toHaveBeenCalled();
  });

  it('should deduplicate and update if an existing lead is found', async () => {
    const { db } = await import('@/db');
    // Mock existing lead
    ((db as any).limit as any).mockResolvedValueOnce([{ id: 'existing-123', email: 'existing@example.com', customData: { old: 'data' } }]);

    const payload: NormalizedLeadPayload = {
      name: 'Existing Lead',
      email: 'existing@example.com',
      sourceId: 'source-1',
      organizationId: 'org-1',
      customData: { new: 'data' },
    };

    const result = await IngestionService.processLead(payload);
    
    expect(result.status).toBe('deduplicated');
    expect(result.leadId).toBe('updated-123');
    expect(db.update).toHaveBeenCalled();
  });
});
