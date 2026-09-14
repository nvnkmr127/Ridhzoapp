// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { AgentResult } from "@/lib/ai/agent";

// Mock the server actions so we can drive the REAL component through multi-turn scenarios and
// inspect exactly what history/leadId each turn sends — no server, DB, or AI key needed.
// (JSX is avoided — this project's vitest has no React/JSX transform — so we use createElement.)
const runAgentAction = vi.fn();
const sendWhatsAppAction = vi.fn();
const sendEmailAction = vi.fn();
vi.mock("@/lib/actions/agent", () => ({ runAgentAction: (...a: unknown[]) => runAgentAction(...a) }));
vi.mock("@/lib/actions/messaging", () => ({
  sendWhatsAppAction: (...a: unknown[]) => sendWhatsAppAction(...a),
  sendEmailAction: (...a: unknown[]) => sendEmailAction(...a),
}));

import { AiAssistant } from "./AiAssistant";

const Assistant = AiAssistant as React.ComponentType<{ storageKey?: string; currentLeadId?: string }>;
const el = (props: { storageKey?: string; currentLeadId?: string }) => React.createElement(Assistant, props);

const reply = (text: string, proposals: AgentResult["proposals"] = []): AgentResult => ({
  text,
  proposals,
  steps: 1,
  enabled: true,
});

function typeAndSend(text: string) {
  const box = screen.getByPlaceholderText("Ask about your leads…");
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}

// This jsdom build ships an incomplete localStorage; install a fresh in-memory one per test.
class MemStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  cleanup();
  Object.defineProperty(globalThis, "localStorage", { value: new MemStorage(), configurable: true });
  runAgentAction.mockReset();
  sendWhatsAppAction.mockReset();
  sendEmailAction.mockReset();
  Element.prototype.scrollTo = () => {}; // jsdom lacks scrollTo; component calls it each turn
});

describe("AiAssistant — multi-turn conversation behavior", () => {
  it("S1/H1: a follow-up sees the draft the assistant just wrote", async () => {
    const draft = "Hi Priya! Great chatting — want a viewing this weekend?";
    runAgentAction
      .mockResolvedValueOnce(
        reply("Drafted a follow-up for your approval.", [
          { kind: "message", leadId: "11111111-1111-1111-1111-111111111111", leadName: "Priya", channel: "whatsapp", body: draft },
        ]),
      )
      .mockResolvedValueOnce(reply("Shortened it."));

    render(el({ storageKey: "userA" }));
    typeAndSend("Draft a follow-up for Priya");
    await screen.findByText(draft);

    typeAndSend("make it shorter");
    await waitFor(() => expect(runAgentAction).toHaveBeenCalledTimes(2));

    const historyArg = runAgentAction.mock.calls[1][1] as { role: string; content: string }[];
    expect(JSON.stringify(historyArg)).toContain(draft); // H1: draft reaches the model
    expect(historyArg.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("S7: dismissing one draft leaves the other untouched", async () => {
    const a = "Draft A body";
    const b = "Draft B body";
    runAgentAction.mockResolvedValueOnce(
      reply("Two drafts ready.", [
        { kind: "message", leadId: "11111111-1111-1111-1111-111111111111", leadName: "A", channel: "whatsapp", body: a },
        { kind: "message", leadId: "22222222-2222-2222-2222-222222222222", leadName: "B", channel: "whatsapp", body: b },
      ]),
    );
    render(el({ storageKey: "userA" }));
    typeAndSend("draft for A and B");
    await screen.findByText(a);
    await screen.findByText(b);

    fireEvent.click(screen.getAllByRole("button", { name: /Dismiss/i })[0]);
    await waitFor(() => expect(screen.queryByText(a)).toBeNull());
    expect(screen.getByText(b)).toBeTruthy();
  });

  it("H2: conversations are isolated per storageKey (shared-browser leak fixed)", async () => {
    runAgentAction.mockResolvedValue(reply("ok"));

    const A = render(el({ storageKey: "userA" }));
    typeAndSend("userA secret about lead Priya");
    await waitFor(() => expect(runAgentAction).toHaveBeenCalled());
    A.unmount();

    render(el({ storageKey: "userB" }));
    fireEvent.click(screen.getByRole("button", { name: /History/i }));
    expect(screen.getByText("No saved conversations yet.")).toBeTruthy();
    expect(screen.queryByText(/userA secret/)).toBeNull();
  });

  it("M2: reopening a chat keeps its original lead, not the current page's lead", async () => {
    const leadA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const leadB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    localStorage.setItem(
      "assistant-conversations:userA",
      JSON.stringify([
        {
          id: "c1", title: "About lead A", updatedAt: Date.now(), leadId: leadA,
          turns: [
            { role: "user", content: "summarize this lead" },
            { role: "assistant", content: "Here is A.", proposals: [] },
          ],
        },
      ]),
    );
    runAgentAction.mockResolvedValue(reply("done"));

    render(el({ storageKey: "userA", currentLeadId: leadB }));
    fireEvent.click(screen.getByRole("button", { name: /History/i }));
    fireEvent.click(screen.getByText("About lead A"));
    typeAndSend("set a reminder for this lead");

    await waitFor(() => expect(runAgentAction).toHaveBeenCalled());
    expect(runAgentAction.mock.calls.at(-1)![2]).toBe(leadA); // NOT leadB
  });

  it("fresh chat on lead B uses lead B, and New chat resets to empty", async () => {
    const leadB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    runAgentAction.mockResolvedValue(reply("ok"));
    render(el({ storageKey: "userA", currentLeadId: leadB }));
    typeAndSend("first turn");
    await waitFor(() => expect(runAgentAction).toHaveBeenCalledTimes(1));
    expect(runAgentAction.mock.calls[0][2]).toBe(leadB);

    fireEvent.click(screen.getByRole("button", { name: /New chat/i }));
    expect(screen.getByText("Your CRM assistant")).toBeTruthy();
  });

  it("boundary: whitespace-only input never calls the server", async () => {
    render(el({ storageKey: "userA" }));
    typeAndSend("    ");
    expect(runAgentAction).not.toHaveBeenCalled();
  });

  it("L1: when AI is disabled the composer locks instead of saving dead chats", async () => {
    runAgentAction.mockResolvedValueOnce({ text: "AI isn't configured.", proposals: [], steps: 0, enabled: false });
    render(el({ storageKey: "userA" }));
    typeAndSend("hello");
    const locked = await screen.findByPlaceholderText("Assistant unavailable");
    expect((locked as HTMLTextAreaElement).disabled).toBe(true);
  });
});
