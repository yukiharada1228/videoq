import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const requirementBadgeVariants = cva(
  "ml-2 inline-block text-oln-16N-100 text-red-800 data-[is-optional]:text-solid-gray-800"
)

export interface RequirementBadgeProps
  extends
    React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof requirementBadgeVariants> {
  isOptional?: boolean
}

const RequirementBadge = React.forwardRef<
  HTMLSpanElement,
  RequirementBadgeProps
>(({ className, isOptional, children, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="requirement-badge"
      data-is-optional={isOptional || undefined}
      className={cn(requirementBadgeVariants(), className)}
      {...props}
    >
      {children}
    </span>
  )
})
RequirementBadge.displayName = "RequirementBadge"

export { RequirementBadge, requirementBadgeVariants }
