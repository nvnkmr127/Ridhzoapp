"use client";
import { SendFollowUpButton } from "@/components/leads/SendFollowUpButton";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Plus, CheckCircle2, Circle, X, Bell, Phone, Mail, Pencil, MessageSquare, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { createFollowUp, updateFollowUp, completeFollowUp, reopenFollowUp, cancelFollowUp } from "@/lib/actions/follow-ups";
import { FOLLOW_UP_TYPES, normalizeFollowUpType, isSendableFollowUp } from "@/lib/followUps/types";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/LocalTime";

interface ReminderItem {
  id: string;
  leadId: string;
  type: string;
  title: string;
  description?: string | null;
  status: string;
  dueAt: Date | string;
  completedAt?: Date | string | null;
  createdAt: Date | string;
}

interface LeadRemindersTabProps {
  leadId: string;
  initialReminders: ReminderItem[];
  leadName?: string;
  leadPhone?: string | null;
}

const formatForDateTimeLocal = (date: Date | string) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export function LeadRemindersTab({ leadId, initialReminders, leadName = "", leadPhone = null }: LeadRemindersTabProps) {
  const router = useRouter();
  const [reminders, setReminders] = useState<ReminderItem[]>(initialReminders);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("followup");
  const [dueDate, setDueDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    // Local time, not toISOString(): that's UTC, so "tomorrow 9 AM" showed (and saved) as 3:30 AM in India.
    return formatForDateTimeLocal(tomorrow);
  });
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState("followup");
  const [editDueDate, setEditDueDate] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const { toast } = useToast();

  const openEdit = (reminder: ReminderItem) => {
    setEditingReminder(reminder);
    setEditTitle(reminder.title);
    setEditDescription(reminder.description || "");
    setEditType(normalizeFollowUpType(reminder.type));
    setEditDueDate(formatForDateTimeLocal(reminder.dueAt));
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReminder || !editTitle.trim()) return;

    setEditSubmitting(true);
    try {
      const res = await updateFollowUp(editingReminder.id, {
        title: editTitle,
        description: editDescription,
        type: editType,
        dueAt: new Date(editDueDate),
      });

      if (!res.ok) {
        toast({ title: "Couldn't update the follow-up", description: res.message, variant: "destructive" });
        return;
      }

      setReminders((prev) =>
        prev.map((r) => (r.id === editingReminder.id ? (res.data as ReminderItem) : r))
      );
      setEditingReminder(null);
      router.refresh();
      toast({ title: "Follow-up updated" });
    } catch {
      toast({
        title: "Couldn't update the follow-up",
        description: "We couldn't reach the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const res = await createFollowUp({
        leadId,
        title,
        description,
        type,
        dueAt: new Date(dueDate),
      });
      if (!res.ok) {
        toast({ title: "Couldn't add the follow-up", description: res.message, variant: "destructive" });
        return;
      }

      setReminders((prev) => [res.data as ReminderItem, ...prev]);
      setTitle("");
      setDescription("");
      setShowAdd(false);
      router.refresh();
      toast({
        title: "Follow-up added",
        description: `Scheduled for ${new Date(dueDate).toLocaleString()}`,
      });
    } catch {
      toast({
        title: "Couldn't add the follow-up",
        description: "We couldn't reach the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    try {
      const res = newStatus === "completed" ? await completeFollowUp(id) : await reopenFollowUp(id);
      if (!res.ok) {
        toast({ title: "Failed to update status", description: res.message, variant: "destructive" });
        return;
      }
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus, completedAt: newStatus === "completed" ? new Date() : null } : r))
      );
      router.refresh();
      toast({
        title: newStatus === "completed" ? "Follow-up done" : "Follow-up reopened",
      });
    } catch {
      toast({
        title: "Failed to update status",
        description: "We couldn't reach the server. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Cancelling (not deleting) keeps the follow-up in the lead's history.
  const handleCancel = async (reminder: ReminderItem) => {
    if (!confirm(`Cancel "${reminder.title}"? It won't remind anyone any more.`)) return;
    try {
      const res = await cancelFollowUp(reminder.id);
      if (!res.ok) {
        toast({ title: "Couldn't cancel the follow-up", description: res.message, variant: "destructive" });
        return;
      }
      setReminders((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, status: "cancelled" } : r)));
      router.refresh();
      toast({ title: "Follow-up cancelled" });
    } catch {
      toast({
        title: "Couldn't cancel the follow-up",
        description: "We couldn't reach the server. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getTypeIcon = (t: string) => {
    switch (normalizeFollowUpType(t)) {
      case "call":
        return <Phone className="h-4 w-4 text-emerald-500" />;
      case "email":
        return <Mail className="h-4 w-4 text-blue-500" />;
      case "task":
        return <ListTodo className="h-4 w-4 text-sky-500" />;
      case "whatsapp":
        return <MessageSquare className="h-4 w-4 text-emerald-500" />;
      default:
        return <Bell className="h-4 w-4 text-amber-500" />;
    }
  };

  // Cancelled follow-ups are history only (shown in the lead's activity), never "pending".
  const pendingReminders = reminders.filter((r) => r.status === "pending");
  const completedReminders = reminders.filter((r) => r.status === "completed");

  return (
    <div className="space-y-6">
      {/* Header & Add Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">Follow-ups</h4>
          <p className="text-xs text-muted-foreground">Calls, messages and tasks to do for this lead — book meetings from the Meetings tab</p>
        </div>
        {!showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 text-xs">
            <Plus className="h-4 w-4" />
            Add follow-up
          </Button>
        )}
      </div>

      {/* Add follow-up form */}
      {showAdd && (
        <form onSubmit={handleCreate} className="border rounded-2xl p-4 bg-muted/30 space-y-4 animate-in fade-in-50">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New follow-up</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="h-9 text-xs">
              Cancel
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Title *</label>
              <Input
                placeholder="e.g. Call lead to follow up on quote"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Due Date & Time *</label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Note / Description (Optional)</label>
              <Input
                placeholder="Additional details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !title.trim()} className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Save follow-up
            </Button>
          </div>
        </form>
      )}

      {/* Pending Reminders */}
      <div className="space-y-3">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Pending ({pendingReminders.length})
        </h5>

        {pendingReminders.length === 0 ? (
          <div className="text-center py-8 border rounded-2xl bg-card text-muted-foreground text-xs space-y-1">
            <p className="font-medium text-foreground">Nothing to do for this lead</p>
            <p>Add a follow-up above so you&apos;re reminded when it&apos;s due.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingReminders.map((reminder) => {
              const due = new Date(reminder.dueAt);
              const isOverdue = due < new Date();
              return (
                <div
                  key={reminder.id}
                  className={`flex items-start justify-between p-3.5 rounded-2xl border bg-card transition-all hover:border-primary/40 ${
                    isOverdue ? "border-destructive/30 bg-destructive/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      onClick={() => handleToggle(reminder.id, reminder.status)}
                      aria-label="Mark as done"
                      className="-m-2 mt-[-6px] shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Circle className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getTypeIcon(reminder.type)}
                        <span className="font-semibold text-sm text-foreground truncate">{reminder.title}</span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                            Overdue
                          </Badge>
                        )}
                      </div>
                      {reminder.description && (
                        <p className={`text-xs text-muted-foreground mt-1 ${isSendableFollowUp(reminder) ? "whitespace-pre-wrap rounded-md bg-muted/60 p-2" : "line-clamp-2"}`}>
                          {reminder.description}
                        </p>
                      )}
                      {isSendableFollowUp(reminder) && (
                        <div className="mt-2">
                          <SendFollowUpButton
                            followUpId={reminder.id}
                            leadId={leadId}
                            leadName={leadName}
                            phone={leadPhone}
                            message={reminder.description!}
                            onDone={() =>
                              setReminders((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, status: "completed", completedAt: new Date() } : r)))
                            }
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                        <Calendar className="h-3 w-3" />
                        <LocalTime iso={reminder.dueAt} mode="datetime" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit follow-up"
                      onClick={() => openEdit(reminder)}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Cancel follow-up"
                      title="Cancel follow-up"
                      onClick={() => handleCancel(reminder)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Reminders */}
      {completedReminders.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Completed ({completedReminders.length})
          </h5>
          <div className="space-y-2">
            {completedReminders.map((reminder) => (
              <div
                key={reminder.id}
                className="flex items-center justify-between p-3 rounded-2xl border bg-muted/20 opacity-75 hover:opacity-100 transition-opacity"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => handleToggle(reminder.id, reminder.status)}
                    aria-label="Mark as not done"
                    className="-m-2 shrink-0 rounded-full p-2 text-emerald-500 transition-colors hover:text-muted-foreground"
                  >
                    <CheckCircle2 className="h-5 w-5 fill-emerald-500/10" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-sm text-foreground line-through line-clamp-1">{reminder.title}</span>
                    {reminder.completedAt && (
                      <span className="text-[11px] text-muted-foreground block">
                        Completed <LocalTime iso={reminder.completedAt} mode="shortDate" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Reminder Dialog */}
      <Dialog open={!!editingReminder} onOpenChange={(open) => !open && setEditingReminder(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit follow-up</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Title *</label>
              <Input
                placeholder="e.g. Call lead to follow up"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
                <Select value={editType} onValueChange={setEditType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Due Date & Time *</label>
                <Input
                  type="datetime-local"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  required
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Note / Description (Optional)</label>
              <Input
                placeholder="Additional details..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingReminder(null)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={editSubmitting || !editTitle.trim()}
                className="h-8 text-xs"
              >
                {editSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
