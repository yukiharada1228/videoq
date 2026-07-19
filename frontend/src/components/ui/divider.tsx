import * as React from "react"
import { type VariantProps, cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

export const dividerVariants = cva(
  "data-[color=gray-420]:border-solid-gray-420 data-[color=gray-536]:border-solid-gray-536 data-[color=black]:border-black"
)

export type DividerColor = "gray-420" | "gray-536" | "black"

export type DividerProps = React.ComponentPropsWithoutRef<"hr"> &
  VariantProps<typeof dividerVariants> & {
    color?: DividerColor
  }

const Divider = React.forwardRef<HTMLHRElement, DividerProps>(
  ({ className, color = "gray-420", ...rest }, ref) => {
    return (
      <hr
        ref={ref}
        data-slot="divider"
        data-color={color}
        className={cn(dividerVariants(), className)}
        {...rest}
      />
    )
  }
)
Divider.displayName = "Divider"

export { Divider }
