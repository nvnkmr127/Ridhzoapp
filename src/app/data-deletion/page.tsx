import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Data Deletion Status | Ridhzo",
  description: "Check the status of your Facebook/Meta user data deletion request.",
};

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-lg border rounded-2xl bg-card p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Data Deletion Request Status</h1>
            <p className="text-xs text-muted-foreground">Meta / Facebook Platform Compliance</p>
          </div>
        </div>

        <div className="space-y-4 text-sm text-muted-foreground border-y py-4">
          <div className="flex justify-between items-center">
            <span className="font-medium text-foreground">Status:</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Completed
            </span>
          </div>
          {id && (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">Confirmation Code:</span>
              <code className="bg-muted px-2.5 py-1.5 rounded text-xs break-all font-mono text-foreground border">
                {id}
              </code>
            </div>
          )}
          <p className="text-xs leading-relaxed">
            In accordance with Meta Platform policies, your data deletion request has been processed. All associated user data, Page tokens, and lead ingestion permissions linked to this account have been removed from Ridhzo.
          </p>
        </div>

        <div className="flex justify-end">
          <Link
            href="/"
            className="text-sm font-medium text-primary hover:underline"
          >
            Return to Ridhzo
          </Link>
        </div>
      </div>
    </div>
  );
}
