"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Check, X, Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addNoteAction, deleteNoteAction, updateNoteAction } from "@/lib/actions/leads";
import { useToast } from "@/hooks/use-toast";
import { LocalTime } from "@/components/LocalTime";

export interface NoteItem {
  id: string;
  leadId?: string;
  content: string | null;
  createdAt: Date | string;
  /** When the note is about (older notes are backdated); falls back to createdAt. */
  occurredAt?: Date | string | null;
  /** Who wrote it. */
  userName?: string | null;
}

const when = (n: NoteItem) => new Date(n.occurredAt ?? n.createdAt).getTime();
const byDate = (a: NoteItem, b: NoteItem) => when(b) - when(a); // newest first, by the date the note is about

// datetime-local value for "now" in the user's own timezone — the picker's max (no future dates).
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

interface LeadNotesTabProps {
  leadId: string;
  initialNotes: NoteItem[];
}

export function LeadNotesTab({ leadId, initialNotes }: LeadNotesTabProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteItem[]>([...initialNotes].sort(byDate));
  const [noteDate, setNoteDate] = useState(""); // optional datetime-local; empty = now
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newContent.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      const res = await addNoteAction({ leadId, content: trimmed, ...(noteDate ? { occurredAt: new Date(noteDate).toISOString() } : {}) });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Unable to add note", description: res.message });
        return;
      }

      setNotes((prev) => [res.data as NoteItem, ...prev].sort(byDate));
      setNewContent("");
      setNoteDate("");
      router.refresh();
      toast({
        title: "Note Added",
        description: "Your note was successfully added.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Connection problem",
        description: "We couldn't reach the server. Please try again.",
      });
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (note: NoteItem) => {
    setEditingId(note.id);
    setEditContent(note.content || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleSaveEdit = async (noteId: string) => {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    setSavingEdit(true);
    try {
      const res = await updateNoteAction({ noteId, leadId, content: trimmed });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Failed to update note", description: res.message });
        return;
      }

      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, content: trimmed } : n))
      );
      setEditingId(null);
      router.refresh();
      toast({ title: "Note updated" });
    } catch {
      toast({
        variant: "destructive",
        title: "Connection problem",
        description: "We couldn't reach the server. Please try again.",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    setDeletingId(noteId);
    try {
      const res = await deleteNoteAction(noteId, leadId);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Failed to delete note", description: res.message });
        return;
      }

      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      router.refresh();
      toast({ title: "Note deleted" });
    } catch {
      toast({
        variant: "destructive",
        title: "Connection problem",
        description: "We couldn't reach the server. Please try again.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Note Form */}
      <form onSubmit={handleAdd} className="space-y-3">
        <Textarea
          placeholder="Type a note here..."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Note date <span className="opacity-70">(optional — for older notes)</span></span>
            <input
              type="datetime-local"
              value={noteDate}
              max={localNow()}
              onChange={(e) => setNoteDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              aria-label="Note date and time"
            />
            {noteDate && (
              <button type="button" onClick={() => setNoteDate("")} className="underline underline-offset-2 hover:text-foreground">
                Use now
              </button>
            )}
          </label>
          <Button type="submit" size="sm" disabled={adding || !newContent.trim()} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            {adding ? "Saving..." : "Add Note"}
          </Button>
        </div>
      </form>

      {/* Notes List */}
      <div className="space-y-3">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Notes ({notes.length})
        </h5>

        {notes.length === 0 ? (
          <div className="text-center py-8 border rounded-2xl bg-card text-muted-foreground text-xs space-y-1">
            <p className="font-medium text-foreground">No notes added yet</p>
            <p>Use the form above to add a note to this lead.</p>
          </div>
        ) : (
          notes.map((note) => {
            const isEditing = editingId === note.id;
            const isDeleting = deletingId === note.id;

            return (
              <div
                key={note.id}
                className="bg-card p-4 rounded-2xl border text-sm space-y-2 hover:border-primary/40 transition-colors"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        className="h-7 text-xs"
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={savingEdit || !editContent.trim()}
                        className="h-7 text-xs"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> {savingEdit ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-foreground whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <LocalTime iso={note.occurredAt ?? note.createdAt} mode="datetime" />
                        {note.userName && <span>· by {note.userName}</span>}
                        {note.occurredAt && Math.abs(new Date(note.occurredAt).getTime() - new Date(note.createdAt).getTime()) > 10 * 60_000 && (
                          <span className="opacity-70">· added <LocalTime iso={note.createdAt} mode="datetime" /></span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit note"
                          onClick={() => startEdit(note)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                          title="Edit note"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete note"
                          onClick={() => handleDelete(note.id)}
                          disabled={isDeleting}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          title="Delete note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
