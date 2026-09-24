"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { addNoteAction } from "@/lib/actions/leads"
import { useToast } from "@/hooks/use-toast"
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"

const formSchema = z.object({
  leadId: z.guid(),
  content: z.string().trim().min(1, "Note cannot be empty").max(10000, "Note cannot exceed 10,000 characters"),
});

export function AddNoteForm({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leadId: leadId,
      content: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const res = await addNoteAction(values);
      if (!res.ok) {
        if (res.fieldErrors?.content) form.setError("content", { message: res.fieldErrors.content });
        toast({ variant: "destructive", title: "Unable to add note", description: res.message });
        return;
      }
      toast({
        title: "Note Added",
        description: "Your note was successfully added to the timeline.",
      });
      form.reset({ leadId, content: "" });
    } catch {
      toast({
        variant: "destructive",
        title: "Connection problem",
        description: "We couldn't reach the server. Check your connection and try again.",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea 
                  placeholder="Type a note here..." 
                  className="min-h-[100px]"
                  maxLength={10000}
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Adding..." : "Add Note"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
