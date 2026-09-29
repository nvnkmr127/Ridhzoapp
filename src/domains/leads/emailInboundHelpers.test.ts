import { describe, it, expect } from "vitest";
import { isAutoReply, htmlToText } from "./emailInboundService";

describe("isAutoReply", () => {
  it("flags bounces, out-of-office and Auto-Submitted mail", () => {
    expect(isAutoReply({ from: "MAILER-DAEMON@x.com", subject: "hi" })).toBe(true);
    expect(isAutoReply({ from: "a@b.com", subject: "Automatic reply: Demo" })).toBe(true);
    expect(isAutoReply({ from: "a@b.com", subject: "Re: Demo", autoSubmitted: "auto-replied" })).toBe(true);
  });
  it("lets a real reply through", () => {
    expect(isAutoReply({ from: "Ada <ada@b.com>", subject: "Re: Demo", autoSubmitted: "no" })).toBe(false);
  });
});

describe("htmlToText", () => {
  it("strips tags/styles and decodes basics", () => {
    expect(htmlToText("<style>p{}</style><p>Hi&nbsp;there &amp; bye</p>").trim()).toBe("Hi there & bye");
  });
});
