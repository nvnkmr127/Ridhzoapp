import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLeadAction } from "./leads";
import { LeadService } from "@/domains/leads/service";
import { OrgService } from "@/domains/organizations/service";
import { PlanService } from "@/domains/billing/planService";
import { CustomFieldService } from "@/domains/customFields/service";

vi.mock("@/lib/rbac", () => ({
  requireOrg: vi.fn().mockResolvedValue({ organizationId: "org-1", userId: "user-1" }),
  requirePermission: vi.fn().mockResolvedValue({ organizationId: "org-1", userId: "user-1" }),
  hasPermission: vi.fn().mockResolvedValue(true),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/domains/leads/service", () => ({
  LeadService: {
    createLead: vi.fn(),
  },
}));

vi.mock("@/domains/organizations/service", () => ({
  OrgService: {
    getOrganization: vi.fn(),
  },
}));

vi.mock("@/domains/billing/planService", () => ({
  PlanService: {
    assertCanAddLead: vi.fn(),
  },
}));

vi.mock("@/domains/customFields/service", () => ({
  CustomFieldService: {
    validate: vi.fn(),
  },
}));

describe("createLeadAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (OrgService.getOrganization as any).mockResolvedValue({
      id: "org-1",
      requiredLeadFields: ["name"],
    });
    (PlanService.assertCanAddLead as any).mockResolvedValue(undefined);
    (CustomFieldService.validate as any).mockResolvedValue({});
  });

  it("trims fields and creates lead successfully", async () => {
    (LeadService.createLead as any).mockResolvedValue({
      id: "lead-1",
      name: "John Doe",
      email: "john@example.com",
    });

    const res = await createLeadAction({
      name: "  John Doe  ",
      email: "  john@example.com  ",
      phone: "  +123456789  ",
      company: "  Acme Corp  ",
    });

    expect(res.ok).toBe(true);
    expect(LeadService.createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "John Doe",
        email: "john@example.com",
        phone: "+123456789",
        company: "Acme Corp",
      }),
      "user-1",
      "org-1",
    );
  });

  it("passes ownerId to LeadService.createLead when specified", async () => {
    (LeadService.createLead as any).mockResolvedValue({
      id: "lead-2",
      name: "Assigned Lead",
      ownerId: "11111111-1111-4111-8111-111111111111",
    });

    const res = await createLeadAction({
      name: "Assigned Lead",
      ownerId: "11111111-1111-4111-8111-111111111111",
    });

    expect(res.ok).toBe(true);
    expect(LeadService.createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Assigned Lead",
        ownerId: "11111111-1111-4111-8111-111111111111",
      }),
      "user-1",
      "org-1",
    );
  });

  it("accepts seed UUIDs (e.g. 00000000-0000-0000-0000-000000000001) for ownerId", async () => {
    (LeadService.createLead as any).mockResolvedValue({
      id: "lead-3",
      name: "Seed Assigned Lead",
      ownerId: "00000000-0000-0000-0000-000000000001",
    });

    const res = await createLeadAction({
      name: "Seed Assigned Lead",
      ownerId: "00000000-0000-0000-0000-000000000001",
    });

    expect(res.ok).toBe(true);
  });

  it("fails when name is missing or only whitespace", async () => {
    const res = await createLeadAction({
      name: "   ",
      email: "john@example.com",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("VALIDATION");
      expect(res.fieldErrors?.name).toBeDefined();
    }
  });

  it("surfaces the required-field validation error thrown by LeadService.createLead", async () => {
    // Required-field enforcement now lives in LeadService.createLead (shared by every create path);
    // the action's job is to map that VALIDATION error into a result. See lib/leads/requiredFields.
    const err = new Error("Missing required field(s): company");
    (err as { code?: string }).code = "VALIDATION";
    (err as { fieldErrors?: Record<string, string> }).fieldErrors = { company: "This field is required." };
    (LeadService.createLead as any).mockRejectedValueOnce(err);

    const res = await createLeadAction({ name: "Jane Doe", email: "jane@example.com" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("VALIDATION");
      expect(res.message).toContain("company");
      expect(res.fieldErrors?.company).toBeDefined();
    }
  });

  it("returns exact duplicate email error and fieldError on duplicate email", async () => {
    const dupErr = new Error("Duplicate email: a lead with this email already exists");
    (dupErr as any).fieldErrors = { email: "A lead with this email already exists." };
    (LeadService.createLead as any).mockRejectedValue(dupErr);

    const res = await createLeadAction({
      name: "Jane Doe",
      email: "jane@example.com",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("CONFLICT");
      expect(res.message).toBe("Duplicate email: a lead with this email already exists");
      expect(res.fieldErrors?.email).toBe("A lead with this email already exists.");
      expect(res.fieldErrors?.phone).toBeUndefined();
    }
  });

  it("returns exact duplicate phone error and fieldError on duplicate phone", async () => {
    const dupErr = new Error("Duplicate phone number: a lead with this phone number already exists");
    (dupErr as any).fieldErrors = { phone: "A lead with this phone number already exists." };
    (LeadService.createLead as any).mockRejectedValue(dupErr);

    const res = await createLeadAction({
      name: "Jane Doe",
      phone: "+1234567890",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("CONFLICT");
      expect(res.message).toBe("Duplicate phone number: a lead with this phone number already exists");
      expect(res.fieldErrors?.phone).toBe("A lead with this phone number already exists.");
      expect(res.fieldErrors?.email).toBeUndefined();
    }
  });
});
