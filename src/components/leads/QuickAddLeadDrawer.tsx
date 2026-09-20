"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createLeadAction } from "@/lib/actions/leads"
import { enqueueOfflineLead } from "@/lib/offline/outbox"
import { listCustomFieldsAction } from "@/lib/actions/customFields"
import { listUsersAction } from "@/lib/actions/users"
import { CustomFieldInputs, defaultCustomValues, type CustomFieldDef } from "@/components/leads/CustomFieldInputs"
import { useToast } from "@/hooks/use-toast"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const emptyStringToUndefined = z.string().regex(/^\s*$/).transform(() => "");

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name cannot exceed 255 characters"),
  email: z.string().trim().email("Invalid email address").optional().or(z.literal("")).or(emptyStringToUndefined),
  phone: z.string().trim().max(50, "Phone number too long").optional().or(z.literal("")).or(emptyStringToUndefined),
  company: z.string().trim().max(255, "Company name cannot exceed 255 characters").optional().or(z.literal("")).or(emptyStringToUndefined),
  ownerId: z.string().optional().or(z.literal("")).or(emptyStringToUndefined),
});

export function QuickAddLeadDrawer({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { toast } = useToast();
  const [defs, setDefs] = React.useState<CustomFieldDef[]>([]);
  const [customValues, setCustomValues] = React.useState<Record<string, string>>({});
  const [users, setUsers] = React.useState<Array<{ id: string; name: string }>>([]);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const fetchCustomFields = React.useCallback(() => {
    console.log("[QuickAddLeadDrawer:Client] Fetching custom fields...");
    listCustomFieldsAction()
      .then((r) => {
        console.log("[QuickAddLeadDrawer:Client] Raw response from listCustomFieldsAction:", r);
        const list = Array.isArray(r) ? r : Array.isArray((r as any)?.data) ? (r as any).data : [];
        const d = (list as CustomFieldDef[]).filter((f) => !f.disabled);
        console.log(`[QuickAddLeadDrawer:Client] Parsed ${d.length} active custom field definition(s):`, d);
        setDefs(d);
        setCustomValues((prev) => ({ ...defaultCustomValues(d), ...prev }));
      })
      .catch((err) => {
        console.error("[QuickAddLeadDrawer:Client] Failed to load custom fields:", err);
      });
  }, []);

  // Preload on mount so fields are immediately available with 0 delay when opening
  React.useEffect(() => {
    fetchCustomFields();
    listUsersAction().then(setUsers).catch(() => {});
  }, [fetchCustomFields]);

  // Re-fetch when opening to pick up any fields created in Settings
  React.useEffect(() => {
    if (open) {
      setServerError(null);
      fetchCustomFields();
      listUsersAction().then(setUsers).catch(() => {});
    }
  }, [open, fetchCustomFields]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      ownerId: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setServerError(null);
    console.log("[QuickAddLeadDrawer:Client] Submitting lead form:", { values, customValues });
    const activeDefs = defs.filter((d) => !d.disabled);
    const missing = activeDefs.filter((d) => d.required && !(String(customValues[d.key] ?? "")).trim());
    if (missing.length) {
      const msg = `Please fill in required custom field: ${missing.map((m) => m.label).join(", ")}`;
      setServerError(msg);
      toast({
        variant: "destructive",
        title: "Required field missing",
        description: msg,
      });
      return;
    }
    const leadPayload = {
      name: values.name,
      email: values.email || undefined,
      phone: values.phone || undefined,
      company: values.company || undefined,
      ownerId: values.ownerId || undefined,
      customData: customValues,
    };

    if (typeof window !== "undefined" && !navigator.onLine) {
      enqueueOfflineLead(leadPayload);
      toast({
        title: "Saved offline ⚡",
        description: "You're offline. Lead was saved locally and will auto-sync once reconnected.",
      });
      setOpen(false);
      form.reset();
      setCustomValues({});
      setServerError(null);
      return;
    }

    try {
      const res = await createLeadAction(leadPayload);
      if (!res.ok) {
        const displayError = res.message;
        // Map server field errors back onto the matching inputs for inline display.
        if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) {
          for (const [key, message] of Object.entries(res.fieldErrors)) {
            if (key === "name" || key === "email" || key === "phone" || key === "company" || key === "ownerId") {
              form.setError(key as any, { message });
            }
          }
        } else {
          // Precise fallback only if no structured fieldErrors were returned
          const lower = res.message.toLowerCase();
          const hasEmail = lower.includes("email");
          const hasPhone = lower.includes("phone") || lower.includes("number");
          if (hasEmail && !hasPhone) {
            form.setError("email", { message: res.message });
          } else if (hasPhone && !hasEmail) {
            form.setError("phone", { message: res.message });
          } else if (hasEmail && hasPhone) {
            form.setError("email", { message: "A lead with this email already exists." });
            form.setError("phone", { message: "A lead with this phone number already exists." });
          }
        }
        setServerError(displayError);
        toast({
          variant: "destructive",
          title: "Unable to create lead",
          description: displayError,
        });
        return;
      }
      toast({
        title: "Lead Created",
        description: "The lead was successfully created.",
      });
      setOpen(false);
      form.reset();
      setCustomValues({});
      setServerError(null);
      router.refresh();
    } catch {
      // Transport-level failure (offline or network dropped mid-request)
      enqueueOfflineLead(leadPayload);
      toast({
        title: "Connection dropped — Saved offline ⚡",
        description: "Could not reach server. Lead was safely saved locally and will auto-sync when online.",
      });
      setOpen(false);
      form.reset();
      setCustomValues({});
      setServerError(null);
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setServerError(null); form.reset(); } }}>
      <DrawerTrigger asChild>
        {children || <Button variant="outline">Quick Add</Button>}
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm max-h-[85vh] overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle>Quick Add Lead</DrawerTitle>
            <DrawerDescription>Create a new lead instantly.</DrawerDescription>
          </DrawerHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                const firstErr = Object.values(errors)[0]?.message as string || "Please check the form fields and try again.";
                setServerError(firstErr);
                toast({
                  variant: "destructive",
                  title: "Validation error",
                  description: firstErr,
                });
              })}
              className="p-4 pb-0 space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
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
                      <Input type="email" placeholder="john@example.com" {...field} />
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
                      <Input type="tel" placeholder="+1 (555) 000-0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Inc" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign to</FormLabel>
                    <Select
                      value={field.value || "unassigned"}
                      onValueChange={(val) => field.onChange(val === "unassigned" ? "" : val)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned (or me)</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {defs.length > 0 && (
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom Fields</h4>
                    <span className="text-xs text-muted-foreground">{defs.length} field{defs.length === 1 ? "" : "s"}</span>
                  </div>
                  <CustomFieldInputs defs={defs} values={customValues} onChange={(k, v) => setCustomValues((s) => ({ ...s, [k]: v }))} />
                </div>
              )}

              {serverError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive font-medium">
                  {serverError}
                </div>
              )}

              <DrawerFooter className="px-0">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving..." : "Save Lead"}
                </Button>
                <DrawerClose asChild>
                  <Button variant="outline" type="button" onClick={() => { setServerError(null); form.reset(); }}>Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </form>
          </Form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
