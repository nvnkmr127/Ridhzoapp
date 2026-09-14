import { describe, it, expect, vi } from 'vitest';
import { AnalyticsService } from './service';

// Mock DB
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  },
}));

describe('AnalyticsService Calculations', () => {
  it('should correctly calculate lead metrics', async () => {
    const mockLeads = [
      { status: 'new', expectedValue: '0' },
      { status: 'active', expectedValue: '1000' },
      { status: 'active', expectedValue: '2000' },
      { status: 'won', expectedValue: '5000' },
      { status: 'lost', expectedValue: '1000' },
      { status: 'unqualified', expectedValue: '0' },
    ];

    const { db } = await import('@/db');
    const queryChain = {
      where: vi.fn().mockResolvedValue(mockLeads),
      then: (resolve: any) => resolve(mockLeads)
    };
    ((db as any).from as any).mockReturnValue(queryChain);

    const metrics = await AnalyticsService.getLeadMetrics({ organizationId: 'org-A' });

    expect(metrics.total).toBe(6);
    expect(metrics.newLeads).toBe(1);
    expect(metrics.qualified).toBe(3); // 2 active + 1 won
    expect(metrics.unqualified).toBe(1);
    expect(metrics.won).toBe(1);
    expect(metrics.lost).toBe(1);
    
    // Win rate = Won / (Won + Lost + Unqualified) = 1 / 3 ≈ 33.3%
    expect(metrics.conversionRate).toBeCloseTo(33.333, 2);
    
    // Active leads expected value sum = 1000 + 2000 = 3000
    expect(metrics.pipelineValue).toBe(3000);
    
    // Won leads expected value sum = 5000
    expect(metrics.expectedRevenue).toBe(5000);
  });

  it('should handle zero division for conversion rate safely', async () => {
    const mockLeads = [
      { status: 'new', expectedValue: '0' },
      { status: 'active', expectedValue: '1000' },
    ];

    const { db } = await import('@/db');
    const queryChain = {
      where: vi.fn().mockResolvedValue(mockLeads),
      then: (resolve: any) => resolve(mockLeads)
    };
    ((db as any).from as any).mockReturnValue(queryChain);

    const metrics = await AnalyticsService.getLeadMetrics({ organizationId: 'org-A' });

    expect(metrics.won).toBe(0);
    expect(metrics.lost).toBe(0);
    expect(metrics.conversionRate).toBe(0);
  });

  it('should handle empty organization with clean zero metrics', async () => {
    const { db } = await import('@/db');
    const queryChain = {
      where: vi.fn().mockResolvedValue([]),
      then: (resolve: any) => resolve([])
    };
    ((db as any).from as any).mockReturnValue(queryChain);

    const metrics = await AnalyticsService.getLeadMetrics({ organizationId: 'org-empty' });

    expect(metrics.total).toBe(0);
    expect(metrics.conversionRate).toBe(0);
    expect(metrics.pipelineValue).toBe(0);
    expect(metrics.medianResponseSeconds).toBe(0);
    expect(metrics.within5MinRate).toBe(0);
    expect(metrics.contactRate).toBe(0);
  });

  it('should compute speed-to-lead metrics (median response, <5min rate, contact rate)', async () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    const at = (ms: number) => new Date(base + ms);
    const mockLeads = [
      // contacted after 60s -> within 5 min
      { status: 'active', expectedValue: '0', createdAt: at(0), lastContactedAt: at(60_000) },
      // contacted after 240s -> within 5 min
      { status: 'active', expectedValue: '0', createdAt: at(0), lastContactedAt: at(240_000) },
      // contacted after 600s -> outside 5 min
      { status: 'won', expectedValue: '0', createdAt: at(0), lastContactedAt: at(600_000) },
      // never contacted -> excluded from response time, counts against rates
      { status: 'new', expectedValue: '0', createdAt: at(0), lastContactedAt: null },
    ];

    const { db } = await import('@/db');
    const queryChain = {
      where: vi.fn().mockResolvedValue(mockLeads),
      then: (resolve: any) => resolve(mockLeads),
    };
    ((db as any).from as any).mockReturnValue(queryChain);

    const metrics = await AnalyticsService.getLeadMetrics({ organizationId: 'org-A' });

    expect(metrics.contacted).toBe(3);
    // 3 of 4 leads ever contacted
    expect(metrics.contactRate).toBe(75);
    // median of [60, 240, 600] = 240
    expect(metrics.medianResponseSeconds).toBe(240);
    // 2 of 4 total leads contacted within 5 min = 50%
    expect(metrics.within5MinRate).toBe(50);
  });

  it('should aggregate revenue by source correctly', async () => {
    const mockRows = [
      { sourceName: 'Website', expectedValue: '15000' },
      { sourceName: 'Website', expectedValue: '5000' },
      { sourceName: 'Facebook', expectedValue: '12000' },
      { sourceName: null, expectedValue: '3000' },
    ];

    const { db } = await import('@/db');
    const queryChain = {
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(mockRows),
      then: (resolve: any) => resolve(mockRows)
    };
    queryChain.leftJoin.mockReturnValue(queryChain);
    ((db as any).from as any).mockReturnValue(queryChain);

    const sources = await AnalyticsService.getLeadsBySource({ organizationId: 'org-A' });

    expect(sources).toContainEqual({ name: 'Website', count: 2, totalValue: 20000, percentage: 50 });
    expect(sources).toContainEqual({ name: 'Facebook', count: 1, totalValue: 12000, percentage: 25 });
    expect(sources).toContainEqual({ name: 'Direct / Organic', count: 1, totalValue: 3000, percentage: 25 });
  });

  it('should aggregate pipeline distribution correctly', async () => {
    const mockLeads = [
      { status: 'new' },
      { status: 'new' },
      { status: 'active' },
      { status: 'won' },
    ];

    const { db } = await import('@/db');
    const queryChain = {
      where: vi.fn().mockResolvedValue(mockLeads),
      then: (resolve: any) => resolve(mockLeads)
    };
    ((db as any).from as any).mockReturnValue(queryChain);

    const distribution = await AnalyticsService.getPipelineDistribution({ organizationId: 'org-A' });

    expect(distribution).toContainEqual({ name: 'New', count: 2, percentage: 50 });
    expect(distribution).toContainEqual({ name: 'Active', count: 1, percentage: 25 });
    expect(distribution).toContainEqual({ name: 'Won', count: 1, percentage: 25 });
    expect(distribution).toContainEqual({ name: 'Lost', count: 0, percentage: 0 });
    expect(distribution).toContainEqual({ name: 'Unqualified', count: 0, percentage: 0 });
  });

  it('should aggregate leads by owner correctly', async () => {
    const mockRows = [
      { ownerId: 'u1', firstName: 'John', lastName: 'Doe', email: 'john@privyr.local' },
      { ownerId: 'u1', firstName: 'John', lastName: 'Doe', email: 'john@privyr.local' },
      { ownerId: null, firstName: null, lastName: null, email: null },
    ];

    const { db } = await import('@/db');
    const queryChain = {
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(mockRows),
      then: (resolve: any) => resolve(mockRows)
    };
    queryChain.leftJoin.mockReturnValue(queryChain);
    ((db as any).from as any).mockReturnValue(queryChain);

    const owners = await AnalyticsService.getLeadsByOwner({ organizationId: 'org-A' });

    expect(owners).toContainEqual({ name: 'John Doe', count: 2, percentage: 66.7 });
    expect(owners).toContainEqual({ name: 'Unassigned', count: 1, percentage: 33.3 });
  });
});
