import { describe, it, expect, vi, beforeEach } from "vitest";
import { CouponService, Coupon } from "./couponService";
import { PlatformConfigService } from "@/domains/platform/configService";

vi.mock("@/domains/platform/configService", () => {
  // update() = locked get → modify → set; modelled on the get/set mocks so tests assert on set().
  const PlatformConfigService: Record<string, any> = { get: vi.fn(), set: vi.fn() };
  PlatformConfigService.update = vi.fn(async (key: string, dflt: unknown, fn: (v: any) => any) => {
    const next = await fn(structuredClone((await PlatformConfigService.get(key, dflt)) ?? dflt));
    await PlatformConfigService.set(key, next);
    return next;
  });
  return { PlatformConfigService };
});

describe("CouponService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates percentage and fixed discounts correctly", async () => {
    const coupons: Coupon[] = [
      {
        id: "c1",
        code: "SAVE20",
        discountType: "percent",
        discountValue: 20,
        plans: ["pro", "business"],
        maxRedemptions: 10,
        redemptionsCount: 2,
        expiresAt: null,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "c2",
        code: "FLAT50",
        discountType: "fixed",
        discountValue: 50,
        plans: ["pro"],
        maxRedemptions: 10,
        redemptionsCount: 0,
        expiresAt: null,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "c3",
        code: "INACTIVE",
        discountType: "percent",
        discountValue: 10,
        plans: ["pro"],
        maxRedemptions: 10,
        redemptionsCount: 0,
        expiresAt: null,
        active: false,
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(PlatformConfigService.get).mockResolvedValue(coupons as any);

    // Percentage discount on 200 base price
    const resPercent = await CouponService.validate("SAVE20", "pro", 200);
    expect(resPercent.valid).toBe(true);
    expect(resPercent.discountAmount).toBe(40);
    expect(resPercent.finalPrice).toBe(160);

    // Fixed discount on 200 base price
    const resFixed = await CouponService.validate("FLAT50", "pro", 200);
    expect(resFixed.valid).toBe(true);
    expect(resFixed.discountAmount).toBe(50);
    expect(resFixed.finalPrice).toBe(150);

    // Plan restriction
    const resPlan = await CouponService.validate("FLAT50", "enterprise", 500);
    expect(resPlan.valid).toBe(false);

    // Inactive coupon
    const resInactive = await CouponService.validate("INACTIVE", "pro", 100);
    expect(resInactive.valid).toBe(false);
  });

  it("creates and toggles coupons", async () => {
    // Start with 1 existing coupon so list() does not load default seeded coupons
    const store: Coupon[] = [
      {
        id: "c_base",
        code: "EXISTING",
        discountType: "fixed",
        discountValue: 10,
        plans: ["pro"],
        maxRedemptions: 100,
        redemptionsCount: 0,
        expiresAt: null,
        active: true,
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(PlatformConfigService.get).mockImplementation(async () => [...store]);
    vi.mocked(PlatformConfigService.set).mockImplementation(async (_, val) => {
      store.length = 0;
      store.push(...(val as Coupon[]));
      return val as any;
    });

    const created = await CouponService.create({
      code: "welcome10",
      discountType: "percent",
      discountValue: 10,
      maxRedemptions: 50,
    });

    expect(created.code).toBe("WELCOME10");
    expect(created.active).toBe(true);
    expect(store.length).toBe(2);

    const toggled = await CouponService.toggle(created.id, false);
    expect(toggled?.active).toBe(false);
  });
});
