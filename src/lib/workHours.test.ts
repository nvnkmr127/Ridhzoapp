import { describe, expect, it } from "vitest";
import { isWorkDay, isWorkingTime, localDayHour } from "./workHours";

const org = { workDays: [1, 2, 3, 4, 5, 6], workStartHour: 9, workEndHour: 20 };

describe("business hours", () => {
  it("reads the local weekday and hour", () => {
    // 2026-10-04 is a Sunday; 04:30 UTC = 10:00 IST
    expect(localDayHour(new Date("2026-10-04T04:30:00Z"), "Asia/Kolkata")).toEqual({ day: 0, hour: 10 });
  });

  it("treats Sunday as a day off for a Mon–Sat business", () => {
    expect(isWorkDay(new Date("2026-10-04T04:30:00Z"), "Asia/Kolkata", org.workDays)).toBe(false);
    expect(isWorkDay(new Date("2026-10-05T04:30:00Z"), "Asia/Kolkata", org.workDays)).toBe(true);
  });

  it("is open 9 AM to 8 PM only", () => {
    expect(isWorkingTime(new Date("2026-10-05T04:30:00Z"), "Asia/Kolkata", org)).toBe(true); // Mon 10:00
    expect(isWorkingTime(new Date("2026-10-05T15:00:00Z"), "Asia/Kolkata", org)).toBe(false); // Mon 20:30
    expect(isWorkingTime(new Date("2026-10-05T02:00:00Z"), "Asia/Kolkata", org)).toBe(false); // Mon 07:30
  });

  it("never mutes alerts when hours are misconfigured or unset", () => {
    expect(isWorkingTime(new Date("2026-10-05T15:00:00Z"), "Asia/Kolkata", { ...org, workStartHour: 20, workEndHour: 9 })).toBe(true);
    expect(isWorkDay(new Date("2026-10-04T04:30:00Z"), "Asia/Kolkata", [])).toBe(true);
  });
});

import { wallTimeToUtc, localDate } from "./workHours";

describe("wall time in a zone", () => {
  it("10:30 in India is 05:00 UTC", () => {
    expect(wallTimeToUtc("2026-10-05", 10, 30, "Asia/Kolkata").toISOString()).toBe("2026-10-05T05:00:00.000Z");
  });
  it("handles zones with DST", () => {
    expect(wallTimeToUtc("2026-07-01", 9, 0, "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(wallTimeToUtc("2026-12-01", 9, 0, "Europe/London").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
  it("reads the local date", () => {
    expect(localDate(new Date("2026-10-04T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-05");
  });
});
