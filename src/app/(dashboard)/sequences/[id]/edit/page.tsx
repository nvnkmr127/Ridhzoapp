import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSequenceAction } from "@/lib/actions/sequences";
import { SequenceBuilder } from "@/components/sequences/SequenceBuilder";
import { Button } from "@/components/ui/button";

export default async function EditSequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sequence = await getSequenceAction(id);
  if (!sequence) notFound();

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Go back">
          <Link href="/sequences"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Edit sequence</h2>
      </div>
      <div className="max-w-2xl">
        <SequenceBuilder initial={sequence} />
      </div>
    </div>
  );
}
