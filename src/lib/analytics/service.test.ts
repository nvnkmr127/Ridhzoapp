import { describe, it, expect, vi } from 'vitest';
import { AnalyticsService, summarizeLeadMetrics } from './service';

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
  // Lead KPIs are aggregated in SQL; the maths lives in the pure summarizeLeadMetrics.
  const cat = (st: string | null) => ({ new: 'open', active: 'in_progress', won: 'won', lost: 'lost', unqualified: 'unqualified' } as Record<string, string>)[st ?? ''] ?? 'open';
  const noResp = { contacted: 0, median: null, within5: 0 };

  it('should correctly calculate lead metrics', () => {
    const metrics = summarizeLeadMetrics(
      [
        { status: 'new', n: 1, value: 0 },
        { status: 'active', n: 2, value: 3000 },
        { status: 'won', n: 1, value: 5000 },
        { status: 'lost', n: 1, value: 1000 },
        { status: 'unqualified', n: 1, value: 0 },
      ],
      noResp,
      cat,
    );
    expect(metrics.total).toBe(6);
    expect(metrics.newLeads).toBe(1);
    expect(metrics.qualified).toBe(3); // 2 active + 1 won
    expect(metrics.unqualified).toBe(1);
    expect(metrics.won).toBe(1);
    expect(metrics.lost).toBe(1);
    // Win rate = Won / (Won + Lost + Unqualified) = 1 / 3
    expect(metrics.conversionRate).toBeCloseTo(33.333, 2);
    expect(metrics.pipelineValue).toBe(3000);
    expect(metrics.expectedRevenue).toBe(5000);
  });

  it('should handle zero division for conversion rate safely', () => {
    const metrics = summarizeLeadMetrics([{ status: 'new', n: 1, value: 0 }, { status: 'active', n: 1, value: 1000 }], noResp, cat);
    expect(metrics.won).toBe(0);
    expect(metrics.lost).toBe(0);
    expect(metrics.conversionRate).toBe(0);
  });

  it('should handle empty organization with clean zero metrics', () => {
    const metrics = summarizeLeadMetrics([], noResp, cat);
    expect(metrics.total).toBe(0);
    expect(metrics.conversionRate).toBe(0);
    expect(metrics.pipelineValue).toBe(0);
    expect(metrics.medianResponseSeconds).toBe(0);
    expect(metrics.within5MinRate).toBe(0);
    expect(metrics.contactRate).toBe(0);
  });

  it('should compute speed-to-lead metrics (median response, <5min rate, contact rate)', () => {
    // 4 leads; 3 contacted after 60s, 240s, 600s → median 240, 2 within 5 min
    const metrics = summarizeLeadMetrics(
      [{ status: 'active', n: 2, value: 0 }, { status: 'won', n: 1, value: 0 }, { status: 'new', n: 1, value: 0 }],
      { contacted: 3, median: 240, within5: 2 },
      cat,
    );
    expect(metrics.contacted).toBe(3);
    expect(metrics.contactRate).toBe(75);
    expect(metrics.medianResponseSeconds).toBe(240);
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
      { ownerId: 'u1', firstName: 'John', lastName: 'Doe', email: 'john@ridhzo.com' },
      { ownerId: 'u1', firstName: 'John', lastName: 'Doe', email: 'john@ridhzo.com' },
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
