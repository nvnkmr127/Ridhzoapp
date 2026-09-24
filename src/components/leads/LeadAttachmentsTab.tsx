"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Paperclip,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  ExternalLink,
  Trash2,
  File,
  Upload,
  Download,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addAttachmentAction, uploadAttachmentAction, deleteAttachmentAction } from "@/lib/actions/attachments";
import { useToast } from "@/hooks/use-toast";
import { LocalTime } from "@/components/LocalTime";

interface AttachmentItem {
  id: string;
  leadId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  fileType?: string | null;
  createdAt: Date | string;
}

interface LeadAttachmentsTabProps {
  leadId: string;
  initialAttachments: AttachmentItem[];
}

export function LeadAttachmentsTab({ leadId, initialAttachments }: LeadAttachmentsTabProps) {
  const router = useRouter();
  const [attachments, setAttachments] = useState<AttachmentItem[]>(initialAttachments);
  const [showAdd, setShowAdd] = useState(false);
  const [attachMode, setAttachMode] = useState<"upload" | "link">("upload");
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType] = useState("document");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!fileName.trim()) {
        setFileName(file.name);
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("leadId", leadId);
      if (fileName.trim()) {
        formData.append("fileName", fileName.trim());
      }

      const res = await uploadAttachmentAction(formData);
      if (!res.ok) {
        toast({ title: "Failed to upload file", description: res.message, variant: "destructive" });
        return;
      }

      setAttachments((prev) => [res.data as AttachmentItem, ...prev]);
      setSelectedFile(null);
      setFileName("");
      setShowAdd(false);
      router.refresh();
      toast({
        title: "File uploaded",
        description: `Uploaded ${res.data.fileName} to lead`,
      });
    } catch {
      toast({
        title: "Failed to upload file",
        description: "We couldn't reach the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim() || !fileUrl.trim()) return;

    setSubmitting(true);
    try {
      const res = await addAttachmentAction({
        leadId,
        fileName,
        fileUrl,
        fileType,
      });
      if (!res.ok) {
        toast({ title: "Failed to add attachment", description: res.message, variant: "destructive" });
        return;
      }

      setAttachments((prev) => [res.data as AttachmentItem, ...prev]);
      setFileName("");
      setFileUrl("");
      setShowAdd(false);
      router.refresh();
      toast({
        title: "Attachment added",
        description: `Attached ${fileName} to lead`,
      });
    } catch {
      toast({
        title: "Failed to add attachment",
        description: "We couldn't reach the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteAttachmentAction(id, leadId);
      if (!res.ok) {
        toast({ title: "Failed to delete attachment", description: res.message, variant: "destructive" });
        return;
      }
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
      toast({ title: "Attachment removed" });
    } catch {
      toast({
        title: "Failed to delete attachment",
        description: "We couldn't reach the server. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (fileName: string, type?: string | null) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext) || type?.includes("image")) {
      return <ImageIcon className="h-5 w-5 text-purple-500 shrink-0" />;
    }
    if (["xls", "xlsx", "csv"].includes(ext) || type?.includes("sheet")) {
      return <FileSpreadsheet className="h-5 w-5 text-emerald-500 shrink-0" />;
    }
    if (["pdf", "doc", "docx", "txt"].includes(ext) || type?.includes("pdf") || type?.includes("document")) {
      return <FileText className="h-5 w-5 text-blue-500 shrink-0" />;
    }
    return <File className="h-5 w-5 text-amber-500 shrink-0" />;
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const resetForm = () => {
    setShowAdd(false);
    setSelectedFile(null);
    setFileName("");
    setFileUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      {/* Stacks on phones: the title used to wrap one word per line and push "Attach Link" off-screen. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">Files</h4>
          <p className="text-xs text-muted-foreground">Quotes, brochures, contracts and links for this lead</p>
        </div>
        {!showAdd && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button
              size="sm"
              onClick={() => {
                setAttachMode("upload");
                setShowAdd(true);
                setTimeout(() => fileInputRef.current?.click(), 50);
              }}
              className="gap-1.5 text-xs"
            >
              <Upload className="h-4 w-4" />
              Upload file
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAttachMode("link");
                setShowAdd(true);
              }}
              className="gap-1.5 text-xs"
            >
              <LinkIcon className="h-4 w-4" />
              Attach Link
            </Button>
          </div>
        )}
      </div>

      {/* Add / Upload Attachment Form */}
      {showAdd && (
        <div className="border rounded-2xl p-4 bg-muted/30 space-y-4 animate-in fade-in-50">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAttachMode("upload")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                  attachMode === "upload"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Upload className="h-3 w-3 inline mr-1" />
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setAttachMode("link")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                  attachMode === "link"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LinkIcon className="h-3 w-3 inline mr-1" />
                Attach Web Link
              </button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="h-7 text-xs">
              Cancel
            </Button>
          </div>

          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.mp3,.m4a,.mp4,.mov"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />

          {attachMode === "upload" ? (
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/70 mb-2" />
                  <p className="text-sm font-medium text-foreground">Click to select document from your device</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, Images, TXT (up to 25 MB)</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {getFileIcon(selectedFile.name, selectedFile.type)}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFile(null);
                        setFileName("");
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Document Title / Label</label>
                    <Input
                      placeholder="e.g. Sales Contract"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={resetForm} className="h-8 text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !selectedFile}
                  className="h-8 text-xs gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {submitting ? "Uploading..." : "Upload Document"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAddLink} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Document / File Name *</label>
                  <Input
                    placeholder="e.g. Sales Proposal 2026.pdf"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    required
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">File URL / Link *</label>
                  <Input
                    placeholder="https://..."
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    required
                    type="url"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={resetForm} className="h-8 text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !fileName.trim() || !fileUrl.trim()}
                  className="h-8 text-xs gap-1.5"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Save Link
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Attachments List */}
      {attachments.length === 0 ? (
        <div className="text-center py-10 border rounded-2xl bg-card text-muted-foreground text-xs space-y-3">
          <Paperclip className="h-8 w-8 mx-auto text-muted-foreground/60" />
          <p className="font-medium text-foreground text-sm">No attachments added yet</p>
          <p className="max-w-xs mx-auto text-muted-foreground">
            Attach quotes, documents, proposals, or image links associated with this lead.
          </p>
          {!showAdd && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => {
                  setAttachMode("upload");
                  setShowAdd(true);
                  setTimeout(() => fileInputRef.current?.click(), 50);
                }}
                className="gap-1.5 text-xs"
              >
                <Upload className="h-4 w-4" />
                Upload Document
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAttachMode("link");
                  setShowAdd(true);
                }}
                className="gap-1.5 text-xs"
              >
                <LinkIcon className="h-4 w-4" />
                Attach Link
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {attachments.map((file) => {
            const sizeStr = formatFileSize(file.fileSize);
            // Uploaded files and links both open through the access-checked route (never the raw path).
            const isUploaded = !/^https?:\/\//i.test(file.fileUrl);
            const openHref = `/api/attachments/${file.id}`;
            return (
              <div
                key={file.id}
                className="flex items-center justify-between p-3.5 rounded-2xl border bg-card hover:border-primary/40 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {getFileIcon(file.fileName, file.fileType)}
                  <div className="min-w-0 flex-1">
                    <a
                      href={openHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm text-foreground hover:underline truncate block"
                    >
                      {file.fileName}
                    </a>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>Added <LocalTime iso={file.createdAt} mode="shortDate" /></span>
                      {sizeStr && <span>• {sizeStr}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
                    <a
                      href={isUploaded ? `${openHref}?download=1` : openHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={isUploaded ? "Download Document" : "Open Link"}
                    >
                      {isUploaded ? <Download className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(file.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Delete Attachment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
