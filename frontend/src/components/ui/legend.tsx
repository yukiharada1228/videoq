// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const legendVariants = cva(
  "flex w-fit items-center gap-2 text-solid-gray-800 data-[size=sm]:text-std-16B-170 data-[size=md]:text-std-17B-170 data-[size=lg]:text-std-18B-160"
)

type LegendSize = "lg" | "md" | "sm"

type LegendProps = React.ComponentPropsWithoutRef<"legend"> &
  Omit<VariantProps<typeof legendVariants>, "size"> & {
    size?: LegendSize
  }

const Legend = React.forwardRef<HTMLLegendElement, LegendProps>(
  ({ className, children, size = "md", ...props }, ref) => {
    return (
      <legend
        ref={ref}
        data-slot="legend"
        data-size={size}
        className={cn(legendVariants(), className)}
        {...props}
      >
        {children}
      </legend>
    )
  }
)
Legend.displayName = "Legend"

export { Legend, legendVariants }
export type { LegendProps, LegendSize }
