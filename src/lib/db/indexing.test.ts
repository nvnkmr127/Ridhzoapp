import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService } from '@/lib/leads/ingestion';
import { LeadSourceService } from '@/domains/leads/sourceService';
import { WhatsAppService } from '@/lib/messaging/whatsapp/service';
import { AnalyticsService } from '@/lib/analytics/service';

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
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-lead-id' }]),
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'updated-lead-id' }]),
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

describe('Database Schema & Indexing Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tenant-Aware Phone Lookup & Deduplication', () => {
    it('should query deduplication using organizationId + phone condition', async () => {
      vi.spyOn(LeadSourceService, 'getSource').mockResolvedValueOnce({
        id: 'source-1',
        name: 'Webform Source',
        organizationId: 'org-tenant-1',
        type: 'webform',
        isActive: 1,
        config: {},
        webhookSecret: null,
        createdAt: new Date(),
      });

      vi.spyOn(IngestionService, 'logIngestion').mockResolvedValue(undefined as any);

      const { db } = await import('@/db');
      ((db as any).limit as any).mockResolvedValueOnce([]); // No duplicate in org-tenant-1

      const result = await IngestionService.processLead({
        name: 'Alice Smith',
        phone: '+15551234567',
        sourceId: 'source-1',
        customData: {},
      });

      expect(result.status).toBe('success');
      expect(db.select).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it('should separate identical phone numbers across different organizations', async () => {
      const { db } = await import('@/db');

      // Org 1 lookup for +15559998888 returns Lead A
      ((db as any).limit as any).mockResolvedValueOnce([{
        id: 'lead-org1',
        name: 'Org 1 Contact',
        phone: '+15559998888',
        organizationId: 'org-1',
      }]);

      const res1 = await WhatsAppService.recordInbound({
        fromPhone: '+15559998888',
        providerMessageId: 'msg-org1',
        body: 'Hello Org 1',
        organizationId: 'org-1',
      });

      expect(res1.matched).toBe(true);
      expect(res1.leadId).toBe('lead-org1');

      // Org 2 lookup for +15559998888 returns Lead B
      ((db as any).limit as any).mockResolvedValueOnce([{
        id: 'lead-org2',
        name: 'Org 2 Contact',
        phone: '+15559998888',
        organizationId: 'org-2',
      }]);

      const res2 = await WhatsAppService.recordInbound({
        fromPhone: '+15559998888',
        providerMessageId: 'msg-org2',
        body: 'Hello Org 2',
        organizationId: 'org-2',
      });

      expect(res2.matched).toBe(true);
      expect(res2.leadId).toBe('lead-org2');
    });

    it('should support tenant-scoped analytics aggregation queries', async () => {
      const { db } = await import('@/db');
      // Aggregated per status in SQL, scoped by the org's WHERE.
      const byStatus = [
        { status: 'new', n: 1, value: 500 },
        { status: 'active', n: 1, value: 1500 },
        { status: 'won', n: 1, value: 3000 },
      ];
      const queryChain = {
        // Awaited directly (status-category lookup) → []; .groupBy (lead KPIs) → per-status rows.
        where: vi.fn().mockReturnValue({ groupBy: vi.fn().mockResolvedValue(byStatus), then: (r: any) => r([]) }),
        then: (resolve: any) => resolve([]),
      };
      ((db as any).from as any).mockReturnValue(queryChain);
      (db as any).execute = vi.fn().mockResolvedValue([{ contacted: 0, median: null, within5: 0 }]);

      const metrics = await AnalyticsService.getLeadMetrics({ organizationId: 'org-tenant-analytics' });

      expect(metrics.total).toBe(3);
      expect(metrics.newLeads).toBe(1);
      expect(metrics.qualified).toBe(2);
      expect(metrics.expectedRevenue).toBe(3000);
      expect(queryChain.where).toHaveBeenCalled();
    });
  });
});
