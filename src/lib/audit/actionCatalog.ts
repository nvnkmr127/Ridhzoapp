// The full set of `action` strings AuditService.log is ever called with, plus a short label for
// each — used to populate the action filter on /settings/audit. Client-safe (no `db` import), so
// it can be imported directly by the client-side table component.
//
// Keep this in sync with the call sites: it's a UI convenience (a filter dropdown), not an
// enforced enum — AuditService.log accepts any string, so this list can lag a newly added call
// site without anything breaking; it just won't be filterable until added here.
export const AUDIT_ACTIONS: { value: string; label: string }[] = [
  { value: "user.create", label: "User created" },
  { value: "user.invite", label: "User invited" },
  { value: "user.invite_accepted", label: "Invitation accepted" },
  { value: "invitation.revoke", label: "Invitation revoked" },
  { value: "user.role_change", label: "User role changed" },
  { value: "user.delete", label: "User deleted" },
  { value: "user.activate", label: "User reactivated" },
  { value: "user.deactivate", label: "User deactivated" },
  { value: "role.create", label: "Role created" },
  { value: "role.update", label: "Role permissions changed" },
  { value: "role.delete", label: "Role deleted" },
  { value: "api_key.create", label: "API key created" },
  { value: "api_key.revoke", label: "API key revoked" },
  { value: "api_key.delete", label: "API key deleted" },
  { value: "lead.delete", label: "Lead deleted" },
  { value: "lead.bulk_delete", label: "Leads bulk-deleted" },
  { value: "lead.restore", label: "Lead restored" },
  { value: "lead.purge", label: "Lead purged" },
  { value: "lead.auto_purge", label: "Leads auto-purged (recycle bin)" },
  { value: "lead.recycle_bin.empty", label: "Recycle bin emptied" },
  { value: "lead.merge", label: "Leads merged" },
  { value: "lead.auto_merge", label: "Leads auto-merged" },
  { value: "lead.sla_escalated", label: "Lead SLA escalated" },
  { value: "billing.subscribe_start", label: "Subscription checkout started" },
  { value: "billing.subscribe_activate", label: "Subscription activated" },
  { value: "billing.plan_set_manual", label: "Plan set manually" },
  { value: "billing.plan_changed", label: "Plan changed (billing provider)" },
  { value: "billing.cancel", label: "Subscription cancelled" },
  { value: "org.settings_update", label: "Organization settings updated" },
  { value: "org.auto_merge_toggle", label: "Auto-merge duplicates toggled" },
  { value: "platform.set_plan", label: "Platform: plan set" },
  { value: "platform.suspend", label: "Platform: organization suspended" },
  { value: "platform.reactivate", label: "Platform: organization reactivated" },
  { value: "platform.impersonate_start", label: "Platform: impersonation started" },
  { value: "platform.impersonate_stop", label: "Platform: impersonation stopped" },
  { value: "webhook.secret_reveal", label: "Webhook secret revealed" },
];
