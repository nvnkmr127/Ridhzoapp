import { PlatformConfigService } from "@/domains/platform/configService";

export interface Coupon {
  id: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  plans: string[];
  maxRedemptions: number; // 0 = unlimited
  redemptionsCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

const COUPON_CONFIG_KEY = "coupons";

const DEFAULT_COUPONS: Coupon[] = [
  {
    id: "coup_launch50",
    code: "LAUNCH50",
    discountType: "percent",
    discountValue: 50,
    plans: ["pro", "business"],
    maxRedemptions: 100,
    redemptionsCount: 14,
    expiresAt: null,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "coup_starterfree",
    code: "TRIALPRO",
    discountType: "percent",
    discountValue: 100,
    plans: ["pro"],
    maxRedemptions: 50,
    redemptionsCount: 8,
    expiresAt: null,
    active: true,
    createdAt: new Date().toISOString(),
  },
];

export class CouponService {
  static async list(): Promise<Coupon[]> {
    const list = await PlatformConfigService.get<Coupon[]>(COUPON_CONFIG_KEY, []);
    if (list.length === 0) {
      await PlatformConfigService.set(COUPON_CONFIG_KEY, DEFAULT_COUPONS);
      return DEFAULT_COUPONS;
    }
    return list;
  }

  static async create(input: {
    code: string;
    discountType: "percent" | "fixed";
    discountValue: number;
    plans?: string[];
    maxRedemptions?: number;
    expiresAt?: string | null;
  }): Promise<Coupon> {
    const list = await this.list();
    const cleanCode = input.code.trim().toUpperCase();

    if (list.some((c) => c.code === cleanCode)) {
      throw new Error(`Coupon with code "${cleanCode}" already exists.`);
    }

    const coupon: Coupon = {
      id: `coup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      code: cleanCode,
      discountType: input.discountType,
      discountValue: Math.max(1, input.discountValue),
      plans: input.plans && input.plans.length > 0 ? input.plans : ["pro", "business"],
      maxRedemptions: input.maxRedemptions ?? 0,
      redemptionsCount: 0,
      expiresAt: input.expiresAt ?? null,
      active: true,
      createdAt: new Date().toISOString(),
    };

    list.unshift(coupon);
    await PlatformConfigService.set(COUPON_CONFIG_KEY, list);
    return coupon;
  }

  static async toggle(id: string, active: boolean): Promise<Coupon | null> {
    const list = await this.list();
    const c = list.find((item) => item.id === id);
    if (!c) return null;
    c.active = active;
    await PlatformConfigService.set(COUPON_CONFIG_KEY, list);
    return c;
  }

  static async delete(id: string): Promise<boolean> {
    const list = await this.list();
    const filtered = list.filter((item) => item.id !== id);
    await PlatformConfigService.set(COUPON_CONFIG_KEY, filtered);
    return filtered.length < list.length;
  }

  static async validate(code: string, plan: string, basePrice: number): Promise<{
    valid: boolean;
    discountAmount: number;
    finalPrice: number;
    message: string;
  }> {
    const list = await this.list();
    const coupon = list.find((c) => c.code === code.trim().toUpperCase());

    if (!coupon) return { valid: false, discountAmount: 0, finalPrice: basePrice, message: "Invalid promo code." };
    if (!coupon.active) return { valid: false, discountAmount: 0, finalPrice: basePrice, message: "This coupon is no longer active." };
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      return { valid: false, discountAmount: 0, finalPrice: basePrice, message: "This coupon has expired." };
    }
    if (coupon.maxRedemptions > 0 && coupon.redemptionsCount >= coupon.maxRedemptions) {
      return { valid: false, discountAmount: 0, finalPrice: basePrice, message: "Coupon redemption limit reached." };
    }
    if (coupon.plans.length > 0 && !coupon.plans.includes(plan)) {
      return { valid: false, discountAmount: 0, finalPrice: basePrice, message: `Coupon is only valid for: ${coupon.plans.join(", ")}` };
    }

    let discount = 0;
    if (coupon.discountType === "percent") {
      discount = Math.round((basePrice * coupon.discountValue) / 100);
    } else {
      discount = Math.min(basePrice, coupon.discountValue);
    }

    const finalPrice = Math.max(0, basePrice - discount);
    return {
      valid: true,
      discountAmount: discount,
      finalPrice,
      message: `Coupon applied: ${coupon.discountType === "percent" ? `${coupon.discountValue}% off` : `₹${coupon.discountValue} off`}`,
    };
  }
}
