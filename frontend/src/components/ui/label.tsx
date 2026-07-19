import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-solid-gray-800 data-[size=sm]:text-std-16B-170 data-[size=md]:text-std-17B-170 data-[size=lg]:text-std-18B-160"
)

export type LabelSize = "lg" | "md" | "sm"

export interface LabelProps
  extends
    React.ComponentPropsWithoutRef<"label">,
    VariantProps<typeof labelVariants> {
  size?: LabelSize
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, size = "md", children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        data-slot="label"
        data-size={size}
        className={cn(labelVariants(), className)}
        {...props}
      >
        {children}
      </label>
    )
  }
)
Label.displayName = "Label"

export { Label, labelVariants }
