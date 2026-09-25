import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";
import { MeetingService, type Meeting } from "@/domains/meetings/service";
import type { ApiAuth } from "@/lib/apiAuth";
import { attendsMeetingWith } from "@/lib/leads/access";

// Shared access rules for the /api/v1 lead and meeting routes — the same ones the web app uses:
// API keys see the whole org; a mobile user sees their own leads (all of them if admin), leads they
// attend a meeting with, and meetings they attend or booked.

export const idOk = (id: string) => z.guid().safeParse(id).success;

export async function canSeeAllLeads(auth: ApiAuth) {
  return !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage"));
}

// Mobile users need leads.edit to change leads (a "Viewer" role is read-only, as on the web). API keys
// are gated by their own read_only/full scope in authorizeApiRequest.
export async function canEditLeads(auth: ApiAuth) {
  return !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "leads.edit"));
}

export const leadNotFound = () => NextResponse.json({ error: "Lead not found" }, { status: 404 });
export const readOnly = () => NextResponse.json({ error: "Your role can view leads but not change them." }, { status: 403 });

// The lead this caller may open/act on, or null (→ 404, never revealing someone else's lead exists).
export async function leadForApi(auth: ApiAuth, leadId: string) {
  if (!idOk(leadId)) return null;
  const lead = await LeadService.getLead(leadId, auth.organizationId);
  if (!lead) return null;
  if (auth.userId && lead.ownerId !== auth.userId && !(await canSeeAllLeads(auth)) && !(await attendsMeetingWith(leadId, auth.userId))) return null;
  return lead;
}

export async function meetingForApi(auth: ApiAuth, id: string) {
  if (!idOk(id)) return null;
  const m = await MeetingService.get(id, auth.organizationId);
  if (!m) return null;
  if (!auth.userId || m.assigneeId === auth.userId || m.organizerId === auth.userId) return m;
  return (await leadForApi(auth, m.leadId)) ? m : null;
}

// Public shape: no calendar internals.
export function serializeMeeting(m: Meeting) {
  return {
    id: m.id,
    leadId: m.leadId,
    mode: m.mode,
    title: m.title,
    status: m.status,
    startAt: m.startAt.toISOString(),
    durationMinutes: m.durationMinutes,
    assigneeId: m.assigneeId,
    organizerId: m.organizerId,
    locationName: m.locationName,
    address: m.address,
    mapUrl: m.mapUrl,
    meetingUrl: m.meetingUrl,
    notes: m.notes,
    outcome: m.outcome,
    completedAt: m.completedAt?.toISOString() ?? null,
    checkedInAt: m.checkedInAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

export const notFound = () => NextResponse.json({ error: "Meeting not found" }, { status: 404 });
export const invalid = (e: { message: string; fieldErrors: Record<string, string> }) =>
  NextResponse.json({ error: e.message, details: e.fieldErrors }, { status: 422 });

// Service guard errors (code VALIDATION) → 422; anything else → logged 500.
export async function serverError(where: string, e: unknown) {
  if ((e as { code?: string })?.code === "VALIDATION") return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  const { logError } = await import("@/lib/log");
  const ref = logError(where, e);
  return NextResponse.json({ error: "Something went wrong. Please try again.", ref }, { status: 500 });
}
