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

const formSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(255, "Name cannot exceed 255 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(50, "Phone number too long").optional().or(z.literal("")),
  company: z.string().max(255, "Company name cannot exceed 255 characters").optional().or(z.literal("")),
  expectedUpdatedAt: z.string().optional(),
});

interface EditLeadDialogProps {
  lead: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    updatedAt?: string | Date | null;
  }
}

// The exact timestamp the editor loaded, sent back so the server can reject a stale overwrite.
const toIso = (v?: string | Date | null) => (v ? new Date(v).toISOString() : undefined);

export function EditLeadDialog({ lead }: EditLeadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: lead.id,
      name: lead.name,
      email: lead.email || "",
      phone: lead.phone || "",
      company: lead.company || "",
      expectedUpdatedAt: toIso(lead.updatedAt),
    },
  });

  // Reset form with fresh lead props whenever the dialog opens
  React.useEffect(() => {
    if (open) {
      form.reset({
        id: lead.id,
        name: lead.name,
        email: lead.email || "",
        phone: lead.phone || "",
        company: lead.company || "",
        expectedUpdatedAt: toIso(lead.updatedAt),
      });
    }
  }, [open, lead, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const res = await updateLeadAction(values);
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [key, message] of Object.entries(res.fieldErrors)) {
            if (key === "name" || key === "email" || key === "phone" || key === "company") {
              form.setError(key, { message });
            }
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
        <Button variant="outline" size="sm" className="gap-2" data-edit-lead-trigger>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Lead</DialogTitle>
          <DialogDescription>
            Make changes to the lead&apos;s contact information here.
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
                    <Input type="tel" {...field} />
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
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
