"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

interface LeadDuplicateBannerProps {
  count: number;
  searchQuery?: string;
}

export function LeadDuplicateBanner({ count, searchQuery }: LeadDuplicateBannerProps) {
  if (count <= 0) return null;

  const targetUrl = searchQuery
    ? `/leads/duplicates?search=${encodeURIComponent(searchQuery)}`
    : `/leads/duplicates`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-red-700 dark:text-red-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold">Possible duplicate:</span> {count} other {count === 1 ? "lead has" : "leads have"} the same
          email or phone.
        </span>
      </div>
      <Link
        href={targetUrl}
        className="shrink-0 whitespace-nowrap text-xs font-semibold text-red-700 underline underline-offset-2 hover:opacity-80 dark:text-red-200"
      >
        Review &amp; merge &rarr;
      </Link>
    </div>
  );
}
