import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/domains/leads/service", () => ({ LeadService: {} }));
vi.mock("@/domains/meetings/service", () => ({ MeetingService: {} }));
import { BookingService } from "./service";

const org = { timezone: "Asia/Kolkata", workDays: [1, 2, 3, 4, 5, 6], workStartHour: 9, workEndHour: 20 };
const now = new Date("2026-10-05T03:00:00Z"); // Mon 08:30 IST

describe("booking page slots", () => {
  it("accepts a slot inside business hours", () => {
    expect(BookingService.isBookable(org, new Date("2026-10-05T05:00:00Z"), now)).toBe(true); // Mon 10:30 IST
  });
  it("rejects nights, days off, the last half hour and the past", () => {
    expect(BookingService.isBookable(org, new Date("2026-10-05T16:30:00Z"), now)).toBe(false); // Mon 22:00
    expect(BookingService.isBookable(org, new Date("2026-10-11T05:00:00Z"), now)).toBe(false); // Sunday
    expect(BookingService.isBookable(org, new Date("2026-10-05T14:15:00Z"), now)).toBe(false); // 19:45, ends after 20:00
    expect(BookingService.isBookable(org, new Date("2026-10-05T02:00:00Z"), now)).toBe(false); // already past
  });
  it("rejects more than two weeks ahead", () => {
    expect(BookingService.isBookable(org, new Date("2026-10-26T05:00:00Z"), now)).toBe(false);
  });
});
