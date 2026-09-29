"use client";

import * as React from "react";
import Link from "next/link";
import {
  Eye,
  LifeBuoy,
  UserCheck,
  Clock,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  replySupportTicketAction,
  updateSupportTicketStatusAction,
  assignSupportTicketAction,
  addSupportTicketNoteAction,
} from "@/lib/actions/platform";
import type { SupportTicket } from "@/domains/platform/supportService";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PlatformConsoleProps } from "./types";
import { useImpersonate } from "./useImpersonate";

export function SupportTab({ initialTickets = [] }: PlatformConsoleProps) {
  const [confirm, confirmDialog] = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tickets, setTickets] = React.useState<SupportTicket[]>(initialTickets ?? []);
  const [ticketFilter, setTicketFilter] = React.useState("all");
  const [selectedTicket, setSelectedTicket] = React.useState<SupportTicket | null>(null);
  const [ticketReplyText, setTicketReplyText] = React.useState("");
  const [replySending, setReplySending] = React.useState(false);

  const filteredTickets = React.useMemo(() => {
    if (ticketFilter === "all") return tickets;
    return tickets.filter((t) => t.status === ticketFilter);
  }, [tickets, ticketFilter]);

  const handleSendTicketReply = async () => {
    if (!selectedTicket || !ticketReplyText.trim()) return;
    setReplySending(true);
    try {
      const res = await replySupportTicketAction(selectedTicket.id, ticketReplyText.trim());
      if (res.ok) {
        toast({ title: "Reply Sent", description: "In-app alert dispatched to tenant." });
        setSelectedTicket(res.data);
        setTickets((prev) => prev.map((t) => (t.id === res.data.id ? res.data : t)));
        setTicketReplyText("");
      } else {
        toast({ title: "Failed to send reply", description: res.message, variant: "destructive" });
      }
    } finally {
      setReplySending(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: "open" | "in_progress" | "resolved") => {
    const res = await updateSupportTicketStatusAction(ticketId, status);
    if (res.ok) {
      toast({ title: "Ticket Updated", description: `Status changed to ${status}` });
      if (selectedTicket?.id === ticketId) setSelectedTicket(res.data);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.data : t)));
    }
  };

  // --- API Keys & Audit Trail State ---
  const [ticketNoteText, setTicketNoteText] = React.useState("");
  const [ticketActiveTab, setTicketActiveTab] = React.useState<"messages" | "notes">("messages");

  const handleAssignTicket = async (ticketId: string, assignee: string | null) => {
    const res = await assignSupportTicketAction(ticketId, assignee);
    if (res.ok && res.data) {
      toast({ title: "Ticket Assigned", description: assignee ? `Assigned to ${assignee}` : "Unassigned" });
      if (selectedTicket?.id === ticketId) setSelectedTicket(res.data);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.data! : t)));
    }
  };

  const handleAddTicketNote = async () => {
    if (!selectedTicket || !ticketNoteText.trim()) return;
    const res = await addSupportTicketNoteAction(selectedTicket.id, ticketNoteText.trim());
    if (res.ok && res.data) {
      toast({ title: "Internal Note Added", description: "Saved private triage note." });
      setSelectedTicket(res.data);
      setTickets((prev) => prev.map((t) => (t.id === res.data!.id ? res.data! : t)));
      setTicketNoteText("");
    }
  };

  // Credits Grant Modal state
  const impersonate = useImpersonate(setBusy, confirm);

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="p-5 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-primary" /> SuperAdmin Support Desk &amp; Incident Dispatch
            </h3>
            <p className="text-xs text-muted-foreground">
              Centralized queue for tenant issues, billing disputes, and technical assistance.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "open", "in_progress", "resolved"] as const).map((s) => {
              const count = s === "all" ? tickets.length : tickets.filter((t) => t.status === s).length;
              const labels: Record<string, string> = {
                all: "All",
                open: "Open",
                in_progress: "In Progress",
                resolved: "Resolved",
              };
              return (
                <Button
                  key={s}
                  variant={ticketFilter === s ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2.5 capitalize"
                  onClick={() => setTicketFilter(s)}
                >
                  {labels[s]} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border min-h-[480px]">
          {/* Left Column: Tickets List */}
          <div className="overflow-y-auto max-h-[560px] divide-y divide-border">
            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No support tickets found matching this filter.
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className={`p-3.5 cursor-pointer transition-colors text-xs space-y-1.5 ${
                      isSelected ? "bg-accent/30 border-l-2 border-primary" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-foreground truncate">{t.subject}</span>
                      <Badge
                        className={`text-[10px] uppercase font-mono ${
                          t.status === "open"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : t.status === "in_progress"
                            ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        {t.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      <Link
                        href={`/admin/tenant/${t.orgId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-foreground hover:underline hover:text-primary"
                      >
                        {t.orgName}
                      </Link>{" "}
                      · {t.userEmail}
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {t.category}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${
                          t.priority === "urgent" || t.priority === "high" ? "text-destructive border-destructive/30" : ""
                        }`}
                      >
                        {t.priority}
                      </Badge>
                      {(() => {
                        const deadline = t.slaDeadline ? new Date(t.slaDeadline).getTime() : 0;
                        if (!deadline || t.status === "resolved") return null;
                        const diffHours = Math.round((deadline - Date.now()) / (1000 * 60 * 60));
                        const isBreached = diffHours <= 0;
                        return (
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-mono ${
                              isBreached
                                ? "bg-destructive/15 text-destructive border-destructive/30 animate-pulse font-bold"
                                : diffHours <= 4
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                : "text-muted-foreground"
                            }`}
                          >
                            <Clock className="h-2.5 w-2.5 mr-1 inline" />
                            {isBreached ? "Response deadline missed" : `${diffHours}h SLA`}
                          </Badge>
                        );
                      })()}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(t.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Ticket Conversation Thread & Internal Notes */}
          <div className="md:col-span-2 flex flex-col justify-between p-4">
            {selectedTicket ? (
              <>
                <div className="border-b pb-3 mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">{selectedTicket.subject}</h4>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <Link
                        href={`/admin/tenant/${selectedTicket.orgId}`}
                        className="font-medium text-foreground hover:underline hover:text-primary"
                      >
                        {selectedTicket.orgName}
                      </Link>
                      <span>· Submitted by {selectedTicket.userEmail}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/tenant/${selectedTicket.orgId}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                      >
                        <Eye className="h-3 w-3" /> Tenant 360
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                      disabled={busy === selectedTicket.orgId}
                      onClick={() => impersonate(selectedTicket.orgId, "/leads", true)}
                      title="Inspect tenant dashboard safely in read-only mode"
                    >
                      View Tenant (Read-Only)
                    </Button>
                    {/* Assignment dropdown */}
                    <div className="flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      <Select
                        value={selectedTicket.assignedTo ?? "unassigned"}
                        onValueChange={(val) => handleAssignTicket(selectedTicket.id, val === "unassigned" ? null : val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] w-32">
                          <SelectValue placeholder="Assignee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          <SelectItem value="Support Tier 1">Support Tier 1</SelectItem>
                          <SelectItem value="Engineering On-Call">Engineering On-Call</SelectItem>
                          <SelectItem value="Revenue & Billing Staff">Revenue & Billing Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Status dropdown */}
                    <Select
                      value={selectedTicket.status}
                      onValueChange={(val: any) => handleUpdateTicketStatus(selectedTicket.id, val)}
                    >
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tab switch between Customer Messages and Internal Staff Notes */}
                <div className="flex items-center gap-2 border-b mb-3 pb-1">
                  <Button
                    variant={ticketActiveTab === "messages" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setTicketActiveTab("messages")}
                  >
                    Messages ({selectedTicket.messages.length})
                  </Button>
                  <Button
                    variant={ticketActiveTab === "notes" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1.5 text-amber-800 dark:text-amber-200"
                    onClick={() => setTicketActiveTab("notes")}
                  >
                    <StickyNote className="h-3 w-3 text-amber-500" />
                    Internal Notes ({selectedTicket.internalNotes?.length ?? 0})
                  </Button>
                </div>

                {/* Messages or Internal Notes Scroll Area */}
                {ticketActiveTab === "messages" ? (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-3 max-h-[300px] pr-2">
                      {selectedTicket.messages.map((m) => {
                        const isSuper = m.sender === "superadmin";
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${isSuper ? "items-end" : "items-start"}`}
                          >
                            <div className="text-[10px] text-muted-foreground mb-1">
                              {m.senderName} ({isSuper ? "SuperAdmin" : "Tenant"}) · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div
                              className={`rounded-xl px-3 py-2 text-xs max-w-[85%] whitespace-pre-wrap ${
                                isSuper
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {m.body}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply Input */}
                    <div className="pt-3 border-t mt-3 space-y-2">
                      <Input
                        placeholder="Write a response to the tenant admin..."
                        value={ticketReplyText}
                        onChange={(e) => setTicketReplyText(e.target.value)}
                        className="text-xs h-9"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendTicketReply();
                          }
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          disabled={replySending || !ticketReplyText.trim()}
                          onClick={handleSendTicketReply}
                        >
                          {replySending ? "Sending..." : "Send Reply & Alert"}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] pr-2">
                      {(!selectedTicket.internalNotes || selectedTicket.internalNotes.length === 0) ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                          No internal triage notes recorded for this ticket yet.
                        </div>
                      ) : (
                        selectedTicket.internalNotes.map((note) => (
                          <div key={note.id} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-amber-800 dark:text-amber-200">
                              <span className="font-semibold">{note.authorName}</span>
                              <span>{new Date(note.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="text-foreground whitespace-pre-wrap">{note.body}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add Note Input */}
                    <div className="pt-3 border-t mt-3 space-y-2">
                      <Input
                        placeholder="Add a private staff triage note (hidden from customer)..."
                        value={ticketNoteText}
                        onChange={(e) => setTicketNoteText(e.target.value)}
                        className="text-xs h-9"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddTicketNote();
                          }
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs gap-1.5"
                          disabled={!ticketNoteText.trim()}
                          onClick={handleAddTicketNote}
                        >
                          Add Private Note
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground text-xs">
                <LifeBuoy className="h-8 w-8 mb-2 stroke-1 opacity-50" />
                Select a ticket from the left queue to review history and respond.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
