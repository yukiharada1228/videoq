import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "ml-2 inline-block rounded-lg bg-solid-gray-536 p-2 text-oln-16N-100 text-white outline-1 outline-transparent"
)

const StatusBadge = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span">
>(({ className, children, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="status-badge"
      className={cn(statusBadgeVariants(), className)}
      {...props}
    >
      {children}
    </span>
  )
})
StatusBadge.displayName = "StatusBadge"

export { StatusBadge, statusBadgeVariants }
