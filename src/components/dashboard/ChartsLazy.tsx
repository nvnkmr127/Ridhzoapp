"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Defers recharts (~heavy) off the initial bundle — charts sit below the fold, so load their
// chunk on the client only when the page mounts, with a skeleton in the reserved 300px slot
// (no layout shift). Cuts initial JS/TTI on the dashboard and my-dashboard.
const chartLoading = () => <Skeleton className="h-[300px] w-full rounded-xl" />;

export const LeadsBySourceChart = dynamic(
  () => import("./Charts").then((m) => m.LeadsBySourceChart),
  { ssr: false, loading: chartLoading },
);
export const LeadsByStageChart = dynamic(
  () => import("./Charts").then((m) => m.LeadsByStageChart),
  { ssr: false, loading: chartLoading },
);
export const LeadsByOwnerChart = dynamic(
  () => import("./Charts").then((m) => m.LeadsByOwnerChart),
  { ssr: false, loading: chartLoading },
);
export const LeadsTrendChart = dynamic(
  () => import("./Charts").then((m) => m.LeadsTrendChart),
  { ssr: false, loading: chartLoading },
);
