import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Escape untrusted text before interpolating it into HTML (emails, server-built markup).
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Escape LIKE/ILIKE metacharacters so a search for "50%" or "a_b" matches literally instead of as wildcards.
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
