// The fixed catalog of things a role can be allowed to do. Custom roles are granted a subset;
// the "admin" system role implicitly has all of them.
export const PERMISSIONS = {
  "users.manage": "Manage users & teams",
  "roles.manage": "Manage roles & permissions",
  "settings.manage": "Edit organization settings",
  "sources.manage": "Manage lead sources & automatic assignment",
  "templates.manage": "Manage message templates",
  "automations.manage": "Manage automations",
  "sequences.manage": "Create, edit & delete follow-up sequences",
  "leads.edit": "Create, edit, assign & change status of leads",
  "leads.delete": "Delete leads (to recycle bin)",
  "leads.purge": "Permanently delete leads / empty recycle bin",
  "leads.merge": "Merge duplicate leads",
  "audit.view": "View the audit log",
  "api.manage": "Manage API keys, webhooks & new-lead alerts",
  "billing.manage": "Manage billing & subscription",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

// Defaults for the two shared system roles. `member` is a working rep — can create/edit/assign/
// re-status leads, but not delete, purge, or manage org settings. A read-only "Viewer" is any custom
// role created WITHOUT leads.edit; the backend actions now enforce that gate.
export const SYSTEM_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  admin: ALL_PERMISSIONS,
  member: ["leads.edit"],
};
