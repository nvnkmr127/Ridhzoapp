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
  /** Razorpay Offer that actually applies the discount at checkout. Without it the code can't be used. */
  razorpayOfferId?: string | null;
}

// Coupons were saved against the old plan names; treat them as the current ones.
const CANONICAL: Record<string, string> = { pro: "starter", business: "unlimited" };
const canon = (p: string) => CANONICAL[p] ?? p;

const COUPON_CONFIG_KEY = "coupons";

export class CouponService {
  // No seeded samples: those showed made-up redemption counts and codes that couldn't be redeemed.
  static async list(): Promise<Coupon[]> {
    return PlatformConfigService.get<Coupon[]>(COUPON_CONFIG_KEY, []);
  }

  static async create(input: {
    code: string;
    discountType: "percent" | "fixed";
    discountValue: number;
    plans?: string[];
    maxRedemptions?: number;
    expiresAt?: string | null;
    razorpayOfferId?: string | null;
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
      plans: input.plans && input.plans.length > 0 ? input.plans.map(canon) : ["starter", "unlimited"],
      maxRedemptions: input.maxRedemptions ?? 0,
      redemptionsCount: 0,
      expiresAt: input.expiresAt ?? null,
      active: true,
      createdAt: new Date().toISOString(),
      razorpayOfferId: input.razorpayOfferId?.trim() || null,
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
    if (coupon.plans.length > 0 && !coupon.plans.map(canon).includes(canon(plan))) {
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

  // Checkout-side lookup: a usable code must be valid for the plan AND linked to a Razorpay Offer.
  static async forCheckout(code: string, plan: string): Promise<{ ok: true; coupon: Coupon; message: string } | { ok: false; message: string }> {
    const res = await this.validate(code, plan, 100);
    if (!res.valid) return { ok: false, message: res.message };
    const coupon = (await this.list()).find((c) => c.code === code.trim().toUpperCase())!;
    if (!coupon.razorpayOfferId) return { ok: false, message: "This code can't be used online yet. Please contact support." };
    return { ok: true, coupon, message: res.message };
  }

  // Count one use, after a paid activation. ponytail: read-modify-write on a JSON config blob; move
  // coupons to a table with an atomic increment if codes get heavy concurrent use.
  static async redeem(code: string) {
    const list = await this.list();
    const c = list.find((item) => item.code === code.trim().toUpperCase());
    if (!c) return;
    c.redemptionsCount += 1;
    await PlatformConfigService.set(COUPON_CONFIG_KEY, list);
  }
}
