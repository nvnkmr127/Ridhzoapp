import { describe, it, expect } from "vitest";
import { GenericWebhookAdapter } from "./GenericWebhookAdapter";

describe("GenericWebhookAdapter", () => {
  it("maps form-builder labels case/punctuation-insensitively", async () => {
    const out = await new GenericWebhookAdapter().normalize(
      { "First Name": "Ada", "Last Name": "Lovelace", "your-email": "ada@x.com", "Mobile Number": "+911234567890", Budget: "5L", organizationId: "org" },
      "src-1",
    );
    expect(out).toMatchObject({ name: "Ada Lovelace", email: "ada@x.com", phone: "+911234567890" });
    expect(out.customData).toEqual({ Budget: "5L" });
  });

  it("keeps the plain JSON shape working", async () => {
    const out = await new GenericWebhookAdapter().normalize({ name: "Bo", email: "bo@x.com", phone: "1" }, "src-1");
    expect(out).toMatchObject({ name: "Bo", email: "bo@x.com", phone: "1" });
  });
});
