"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

export function LiveNextBestAction({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  React.useEffect(() => {
    // Poll every 10 seconds to keep NBA updated real time without page reload
    const interval = setInterval(() => {
      router.refresh();
    }, 10000);
    return () => clearInterval(interval);
  }, [router]);

  return <>{children}</>;
}
