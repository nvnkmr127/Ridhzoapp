// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/actions/campaigns", () => ({ sendCampaignAction: vi.fn() }));
vi.mock("@/lib/actions/users", () => ({ listUsersAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/leads", () => ({ bulkAssignLeadAction: vi.fn(), bulkChangeLeadStatusAction: vi.fn(), bulkDeleteLeadsAction: vi.fn(), deleteLeadAction: vi.fn() }));
vi.mock("@/lib/actions/tags", () => ({ bulkAddTagAction: vi.fn() }));
const schemaAction = vi.fn(async () => []);
vi.mock("@/lib/actions/customStatuses", () => ({ getTenantStatusSchemaAction: () => schemaAction() }));
vi.mock("@/lib/actions/exportLeads", () => ({ exportLeadsCsvAction: vi.fn() }));
vi.mock("@/components/leads/EditLeadDialog", () => ({
  EditLeadDialog: ({ lead }: { lead: { name: string } }) => React.createElement("button", { "aria-label": `Edit ${lead.name}` }, "edit"),
}));

import { LeadsTable } from "./LeadsTable";

const now = Date.now();
const leads = [
  { id: "l1", displayId: 36, name: "B.P.Omprakash", email: "bp@x.com", phone: "+919620932003", status: "new", createdAt: new Date(now - 20 * 60_000), ownerId: null },
  { id: "l2", displayId: 22, name: "Naveeb Kumar", email: null, phone: "+918688771397", status: "won", createdAt: new Date(now - 3 * 86_400_000), ownerId: "u1" },
];
const table = () =>
  render(
    React.createElement(LeadsTable as React.ComponentType<any>, {
      leads,
      total: 2,
      totalPages: 1,
      initialUsers: [{ id: "u1", name: "Naveen" }],
      statuses: [
        { key: "new", label: "New", color: "#3B82F6", category: "open" },
        { key: "won", label: "Won", color: "#059669", category: "won" },
      ],
    }),
  );

describe("LeadsTable", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows owner, a clickable phone, relative created time and status labels without fetching them", () => {
    table();
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.getByText("Naveen")).toBeTruthy();
    expect(screen.getByRole("link", { name: "+919620932003" }).getAttribute("href")).toBe("tel:+919620932003");
    expect(screen.getByText("20m ago")).toBeTruthy();
    expect(screen.getByText("3 days ago")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    expect(schemaAction).not.toHaveBeenCalled(); // no flash of raw "new" while the schema loads
    expect(screen.queryByText("View")).toBeNull();
  });

  it("opens the lead when the row is clicked, but not from its checkbox or action buttons", () => {
    table();
    fireEvent.click(screen.getByText("20m ago"));
    expect(push).toHaveBeenCalledWith("/leads/l1");

    push.mockClear();
    fireEvent.click(screen.getByLabelText("Select B.P.Omprakash"));
    fireEvent.click(screen.getByLabelText("Edit B.P.Omprakash"));
    fireEvent.click(screen.getByLabelText("Move B.P.Omprakash to recycle bin"));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Move lead to recycle bin?")).toBeTruthy(); // confirmation, not a navigation
  });

  it("hides the pager when everything fits on one page", () => {
    table();
    expect(screen.getByLabelText("Next Page").closest("div")?.className).toContain("hidden");
  });
});
