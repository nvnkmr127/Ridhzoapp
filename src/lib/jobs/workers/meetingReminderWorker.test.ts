import { describe, expect, it } from "vitest";
import { dueReminders } from "./meetingReminderWorker";

const H = 60 * 60 * 1000;
const now = new Date("2026-10-01T10:00:00Z");
const base = (startInH: number, bookedHAgo = 72) => ({
  startAt: new Date(now.getTime() + startInH * H),
  durationMinutes: 30,
  bookedAt: new Date(now.getTime() - bookedHAgo * H),
  leadReminder24hSentAt: null,
  leadReminder1hSentAt: null,
  repReminderSentAt: null,
  outcomePromptSentAt: null,
});

describe("dueReminders", () => {
  it("sends the 24h lead reminder only for meetings booked well ahead", () => {
    expect(dueReminders(base(20), now)).toEqual(["lead_24h"]);
    expect(dueReminders(base(20, 1), now)).toEqual([]); // booked an hour ago for tomorrow
  });

  it("sends the 1h lead reminder and the rep heads-up close to start", () => {
    expect(dueReminders(base(0.4), now)).toEqual(["lead_1h", "rep"]);
    expect(dueReminders({ ...base(0.4), leadReminder1hSentAt: now }, now)).toEqual(["rep"]);
  });

  it("prompts for the outcome after the meeting ends, once", () => {
    expect(dueReminders(base(-1), now)).toEqual(["outcome"]);
    expect(dueReminders({ ...base(-1), outcomePromptSentAt: now }, now)).toEqual([]);
  });
});
