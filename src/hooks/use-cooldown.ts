import { useEffect, useState } from "react";

// Seconds-left countdown, e.g. for "Resend OTP in 45s". Call start(n) to begin.
export function useCooldown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}
