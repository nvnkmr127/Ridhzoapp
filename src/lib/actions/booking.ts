"use server";

import { BookingService } from "@/domains/booking/service";
import { RateLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

// Public — no auth. The org slug in the URL is the only "credential"; it only lets a prospect
// create a lead + meeting request, nothing more.
const schema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  // The business's local calendar date and slot time — converted with its timezone on the server.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  message: z.string().trim().max(1000).optional(),
  mode: z.enum(["online", "in_person"]).optional(),
});

export async function requestMeetingAction(input: z.input<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please check the highlighted fields and try again.", zodFieldErrors(parsed.error));
  }
  const data = parsed.data;

  if (!data.email && !data.phone) {
    return fail("VALIDATION", "Please provide at least an email or phone number so we can reach you.");
  }

  const limit = await RateLimiter.checkLimit(`booking:${data.slug}`, 15, 60);
  if (!limit.success) {
    return fail("RATE_LIMIT", "Too many booking requests. Please wait a moment and try again.");
  }

  try {
    await BookingService.request(data.slug, {
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      date: data.date,
      time: data.time,
      message: data.message,
      mode: data.mode,
    });
    return ok({ requested: true });
  } catch (e) {
    return actionFail(e);
  }
}
