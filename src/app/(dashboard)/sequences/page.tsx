import { GitFork, Users, Layers } from "lucide-react";
import { listSequencesAction } from "@/lib/actions/sequences";
import { SequenceBuilder } from "@/components/sequences/SequenceBuilder";
import { SequenceRowActions } from "@/components/sequences/SequenceRowActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function SequencesPage() {
  const sequences = await listSequencesAction();

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div>
        <h2 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <GitFork className="h-7 w-7" /> Sequences
        </h2>
        <p className="text-sm text-muted-foreground">
          Multi-step WhatsApp &amp; email drips. Enroll leads from any lead page; steps fire automatically on schedule.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SequenceBuilder />

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Your sequences</CardTitle>
          </CardHeader>
          <CardContent>
            {sequences.length === 0 ? (
              <EmptyState
                icon={<GitFork className="h-10 w-10 text-muted-foreground" />}
                title="No sequences yet"
                description="Describe a goal on the left and let AI draft your first drip."
              />
            ) : (
              <ul className="divide-y divide-border">
                {sequences.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {s.stepCount} steps</span>
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {s.activeEnrollments} active</span>
                      </p>
                    </div>
                    <SequenceRowActions id={s.id} name={s.name} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
