"use client"

import { AlertCircle, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

// Errors stay up longer than confirmations: they usually need reading (and acting on).
const ERROR_DURATION_MS = 10_000
const SUCCESS_DURATION_MS = 5_000

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const isError = props.variant === "destructive"
        const Icon = isError ? AlertCircle : CheckCircle2
        return (
          <Toast key={id} duration={isError ? ERROR_DURATION_MS : SUCCESS_DURATION_MS} {...props}>
            <div className="flex items-start gap-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isError ? "" : "text-emerald-600 dark:text-emerald-400"}`} aria-hidden />
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
