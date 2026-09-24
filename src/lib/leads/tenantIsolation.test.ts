import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService } from './ingestion';
import { LeadSourceService } from '@/domains/leads/sourceService';
import { WhatsAppService } from '@/lib/messaging/whatsapp/service';

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
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'lead-123' }]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-tenant-lead' }])
    }),
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

describe('Tenant Isolation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(IngestionService, 'logIngestion').mockResolvedValue(undefined);
  });

  it('should reject ingestion when no organizationId or valid source exists', async () => {
    vi.spyOn(LeadSourceService, 'getSource').mockResolvedValueOnce(undefined as any);

    await expect(IngestionService.processLead({
      name: 'Unknown Org Lead',
      email: 'user@example.com',
      sourceId: 'non-existent-source',
      customData: {},
    })).rejects.toThrow('Valid Lead Source with Organization is required');
  });

  it('should resolve organizationId from LeadSource when payload organizationId is omitted', async () => {
    vi.spyOn(LeadSourceService, 'getSource').mockResolvedValueOnce({
      id: 'source-org-A',
      name: 'Source A',
      organizationId: 'org-A',
      type: 'webform',
      isActive: 1,
      config: {},
      webhookSecret: null,
      createdAt: new Date(),
    });

    const { db } = await import('@/db');
    ((db as any).limit as any).mockResolvedValueOnce([]); // no existing lead in org-A

    const result = await IngestionService.processLead({
      name: 'Lead for Org A',
      email: 'lead@orga.com',
      sourceId: 'source-org-A',
      customData: {},
    });

    expect(result.status).toBe('success');
    expect(db.insert).toHaveBeenCalled();
  });

  it('should scope WhatsApp inbound matching to organization when provided', async () => {
    const { db } = await import('@/db');
    ((db as any).limit as any).mockResolvedValueOnce([{ id: 'lead-org-A', phone: '+919876543210', organizationId: 'org-A' }]);

    const res = await WhatsAppService.recordInbound({
      fromPhone: '+919876543210',
      providerMessageId: 'msg-1',
      body: 'Hello Org A',
      organizationId: 'org-A',
    });

    expect(res.matched).toBe(true);
    expect(res.leadId).toBe('lead-org-A');
  });
});
