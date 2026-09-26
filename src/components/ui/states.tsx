import * as React from "react"
import { cn } from "@/lib/utils"
import { AlertCircle, WifiOff, Search, Lock, ShieldAlert, Loader2, Clock, CheckCircle2, Wrench, Sparkles, FileSearch, Ban } from "lucide-react"

interface StateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  illustration?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  size?: "sm" | "default" | "lg"
}

export function BaseState({
  icon,
  illustration,
  title,
  description,
  action,
  size = "default",
  className,
  ...props
}: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center animate-in fade-in-50",
        {
          "min-h-[200px] p-4": size === "sm",
          "min-h-[400px] p-8": size === "default",
          "min-h-[500px] p-12": size === "lg",
        },
        className
      )}
      {...props}
    >
      {illustration ? (
        <div className={cn("mb-6", { "w-32": size === "sm", "w-48": size === "default", "w-64": size === "lg" })}>
          {illustration}
        </div>
      ) : icon ? (
        <div className={cn(
          "mx-auto flex items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground mb-4",
          {
            "h-12 w-12": size === "sm",
            "h-16 w-16": size === "default",
            "h-20 w-20": size === "lg",
          }
        )}>
          {React.isValidElement(icon) ? React.cloneElement(icon as any, { 
            className: cn((icon.props as any).className, {
              "w-6 h-6": size === "sm",
              "w-8 h-8": size === "default",
              "w-10 h-10": size === "lg",
            }) 
          }) : icon}
        </div>
      ) : null}
      
      <h3 className={cn("font-semibold text-foreground mt-4", {
        "text-base": size === "sm",
        "text-lg": size === "default",
        "text-xl": size === "lg",
      })}>{title}</h3>
      
      {description && (
        <p className={cn("mt-2 text-muted-foreground max-w-sm mx-auto", {
          "text-xs": size === "sm",
          "text-sm mb-4": size === "default",
          "text-base mb-6": size === "lg",
        })}>
          {description}
        </p>
      )}
      
      {action && <div className={cn("mt-4", { "mt-2": size === "sm", "mt-6": size === "lg" })}>{action}</div>}
    </div>
  )
}

export function ErrorState({ title = "Something went wrong", description = "An unexpected error occurred. Please try again later.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<AlertCircle className="text-destructive animate-pulse" />} title={title} description={description} {...props} />
}

export function LoadingState({ title = "Loading...", description = "Please wait while we fetch the data.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<Loader2 className="animate-spin" />} title={title} description={description} {...props} />
}

export function OfflineState({ title = "No Internet Connection", description = "You are currently offline. Please check your network settings.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<WifiOff className="animate-pulse" />} title={title} description={description} {...props} />
}

export function TimeoutState({ title = "Request Timeout", description = "The server took too long to respond. Please try again.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<Clock className="animate-pulse" />} title={title} description={description} {...props} />
}

export function NoResultsState({ title = "No Results Found", description = "We couldn't find anything matching your search criteria.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<Search />} title={title} description={description} {...props} />
}

export function ValidationErrorState({ title = "Validation Error", description = "Please check the highlighted fields and try again.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<AlertCircle className="text-destructive" />} title={title} description={description} {...props} />
}

export function PermissionDeniedState({ title = "Permission Denied", description = "You do not have permission to view this resource.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<Lock />} title={title} description={description} {...props} />
}

export function UnauthorizedState({ title = "Access Denied", description = "Please log in to access this page.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<ShieldAlert className="text-destructive" />} title={title} description={description} {...props} />
}

export function SuccessState({ title = "Success!", description = "Your action was completed successfully.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<CheckCircle2 className="text-green-500" />} title={title} description={description} {...props} />
}

export function MaintenanceState({ title = "Under Maintenance", description = "We are currently undergoing scheduled maintenance. We'll be back shortly.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<Wrench />} title={title} description={description} {...props} />
}

export function ComingSoonState({ title = "Coming Soon", description = "We are working hard to bring this feature to you.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<Sparkles className="text-amber-500 animate-pulse" />} title={title} description={description} {...props} />
}

export function UnderReviewState({ title = "Under Review", description = "Your submission is currently being reviewed by our team.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<FileSearch className="text-blue-500" />} title={title} description={description} {...props} />
}

export function RateLimitedState({ title = "Too Many Requests", description = "You've been making too many requests. Please slow down and try again in a moment.", ...props }: Partial<StateProps>) {
  return <BaseState icon={<Ban className="text-destructive" />} title={title} description={description} {...props} />
}
