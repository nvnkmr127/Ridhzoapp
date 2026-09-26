"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { updateLeadAction } from "@/lib/actions/leads"
import { useToast } from "@/hooks/use-toast"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Pencil } from "lucide-react"
import {
  CONFIGURABLE_LEAD_FIELDS,
  DEFAULT_LEAD_FIELD_CONFIG,
  getLeadFieldValue,
  type LeadFieldConfig,
} from "@/lib/leads/fieldConfig"
import { getLeadFieldConfigAction } from "@/lib/actions/organizations"

const formSchema = z.object({
  id: z.guid(),
  name: z.string().trim().min(1, "Name is required").max(255, "Name cannot exceed 255 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(50, "Phone number too long").optional().or(z.literal("")),
  company: z.string().max(255).optional().or(z.literal("")),
  budget: z.string().max(255).optional().or(z.literal("")),
  location: z.string().max(255).optional().or(z.literal("")),
  industry: z.string().max(255).optional().or(z.literal("")),
  companySize: z.string().max(255).optional().or(z.literal("")),
  websiteUrl: z.string().max(255).optional().or(z.literal("")),
  expectedUpdatedAt: z.string().optional(),
});

interface EditLeadDialogProps {
  lead: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    customData?: unknown;
    budget?: string | null;
    location?: string | null;
    industry?: string | null;
    companySize?: string | null;
    websiteUrl?: string | null;
    updatedAt?: string | Date | null;
  }
}

// The exact timestamp the editor loaded, sent back so the server can reject a stale overwrite.
const toIso = (v?: string | Date | null) => (v ? new Date(v).toISOString() : undefined);

// compact: an icon-only trigger, for table rows.
export function EditLeadDialog({ lead, compact = false }: EditLeadDialogProps & { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { toast } = useToast();
  const [fieldConfig, setFieldConfig] = React.useState<LeadFieldConfig>(DEFAULT_LEAD_FIELD_CONFIG);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: lead.id,
      name: lead.name,
      email: lead.email || "",
      phone: lead.phone || "",
      company: getLeadFieldValue(lead as any, "company"),
      budget: getLeadFieldValue(lead as any, "budget"),
      location: getLeadFieldValue(lead as any, "location"),
      industry: getLeadFieldValue(lead as any, "industry"),
      companySize: getLeadFieldValue(lead as any, "companySize"),
      websiteUrl: getLeadFieldValue(lead as any, "websiteUrl"),
      expectedUpdatedAt: toIso(lead.updatedAt),
    },
  });

  // Reset form with fresh lead props whenever the dialog opens and load field config
  React.useEffect(() => {
    if (open) {
      getLeadFieldConfigAction().then(setFieldConfig).catch(() => {});
      form.reset({
        id: lead.id,
        name: lead.name,
        email: lead.email || "",
        phone: lead.phone || "",
        company: getLeadFieldValue(lead as any, "company"),
        budget: getLeadFieldValue(lead as any, "budget"),
        location: getLeadFieldValue(lead as any, "location"),
        industry: getLeadFieldValue(lead as any, "industry"),
        companySize: getLeadFieldValue(lead as any, "companySize"),
        websiteUrl: getLeadFieldValue(lead as any, "websiteUrl"),
        expectedUpdatedAt: toIso(lead.updatedAt),
      });
    }
  }, [open, lead, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // Validate mandatory configured default fields
    const missingConfigured = CONFIGURABLE_LEAD_FIELDS.filter((f) => {
      if (fieldConfig[f.key] !== "mandatory") return false;
      const v = values[f.key as keyof typeof values];
      return !(v?.toString().trim());
    });

    if (missingConfigured.length > 0) {
      for (const m of missingConfigured) {
        form.setError(m.key as any, { message: `${m.label} is required.` });
      }
      toast({
        variant: "destructive",
        title: "Required field missing",
        description: `Please fill in: ${missingConfigured.map((m) => m.label).join(", ")}`,
      });
      return;
    }

    try {
      const res = await updateLeadAction(values);
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [key, message] of Object.entries(res.fieldErrors)) {
            form.setError(key as any, { message });
          }
        }
        toast({ variant: "destructive", title: "Unable to update lead", description: res.message });
        return;
      }
      toast({
        title: "Lead Updated",
        description: "The lead was successfully updated.",
      });
      setOpen(false);
      router.refresh();
    } catch {
      toast({
        variant: "destructive",
        title: "Connection problem",
        description: "We couldn't reach the server. Check your connection and try again.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Edit lead" aria-label={`Edit ${lead.name}`} data-edit-lead-trigger>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-2" data-edit-lead-trigger>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
      </DialogTrigger>
      {/* No auto-focus: on phones it popped the keyboard over half the form before you'd chosen a field. */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[425px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Edit Lead</DialogTitle>
          <DialogDescription>
            Make changes to the lead&apos;s details here.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" inputMode="tel" placeholder="+91 98765 43210" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">No country code? We&apos;ll add your workspace&apos;s one automatically.</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tenant-configurable default fields (Mandatory, Optional, Hidden) */}
            {CONFIGURABLE_LEAD_FIELDS.map((f) => {
              const req = fieldConfig[f.key] ?? "optional";
              if (req === "hidden") return null;
              const isMandatory = req === "mandatory";
              return (
                <FormField
                  key={f.key}
                  control={form.control}
                  name={f.key as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {f.label}
                        {isMandatory && <span className="text-destructive"> *</span>}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type={f.type === "url" ? "url" : "text"}
                          placeholder={f.placeholder}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              );
            })}

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
