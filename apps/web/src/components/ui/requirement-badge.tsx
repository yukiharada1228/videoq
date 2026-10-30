import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/digital-agency/cn"

const requirementBadgeVariants = cva(
  "ml-1 text-std-16N-170 text-error-1 before:content-['_'] data-[is-optional]:text-solid-gray-800"
)

interface RequirementBadgeProps
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
export { RequirementBadge }
