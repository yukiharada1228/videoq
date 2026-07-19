import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

export type CheckboxSize = "sm" | "md" | "lg"

// Outer hit area (matches upstream's wrapping <span>): sized size-6/8/11, with the
// subtle gray hover backdrop. The visible box is the inner element at 75%.
const checkboxVariants = cva(
  "group/checkbox inline-flex shrink-0 items-center justify-center appearance-none rounded-[calc(1/8*100%)] bg-transparent outline-none hover:bg-solid-gray-420 focus-visible:bg-transparent aria-disabled:pointer-events-none aria-disabled:hover:bg-transparent data-[size=sm]:size-6 data-[size=md]:size-8 data-[size=lg]:size-11",
  {
    variants: {
      size: {
        sm: "",
        md: "",
        lg: "",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
)

// Inner visible box (matches upstream's <input>): 75% of the hit area, reacting to
// the Root's state via group-data-* so checked/indeterminate/error/disabled render.
const checkboxBoxClass = cn(
  // upstream anchors the check mark top-left (origin-top-left scale for md/lg),
  // so the inner box is not flex-centered.
  "flex size-3/4 rounded-[calc(2/18*100%)] border border-solid-gray-600 bg-white bg-clip-padding",
  "group-data-[size=sm]/checkbox:border-[calc(2/16*1rem)]",
  "group-data-[size=md]/checkbox:border-[calc(2/16*1rem)]",
  "group-data-[size=lg]/checkbox:border-[calc(3/16*1rem)]",
  "group-hover/checkbox:border-black",
  "group-focus-visible/checkbox:outline group-focus-visible/checkbox:outline-4 group-focus-visible/checkbox:outline-black group-focus-visible/checkbox:outline-offset-[calc(2/16*1rem)] group-focus-visible/checkbox:ring-[calc(2/16*1rem)] group-focus-visible/checkbox:ring-yellow-300",
  "group-data-[state=checked]/checkbox:border-key-900 group-data-[state=checked]/checkbox:bg-key-900",
  "group-data-[state=indeterminate]/checkbox:border-key-900 group-data-[state=indeterminate]/checkbox:bg-key-900",
  "group-hover/checkbox:group-data-[state=checked]/checkbox:border-key-1100 group-hover/checkbox:group-data-[state=checked]/checkbox:bg-key-1100",
  "group-hover/checkbox:group-data-[state=indeterminate]/checkbox:border-key-1100 group-hover/checkbox:group-data-[state=indeterminate]/checkbox:bg-key-1100",
  "group-data-[error]/checkbox:border-error-1",
  // checked/indeterminate + error must keep the red border (override the blue checked border)
  "group-data-[state=checked]/checkbox:group-data-[error]/checkbox:border-error-1 group-data-[state=indeterminate]/checkbox:group-data-[error]/checkbox:border-error-1",
  "group-hover/checkbox:group-data-[error]/checkbox:border-red-1000",
  "group-data-[state=checked]/checkbox:group-data-[error]/checkbox:bg-error-1 group-data-[state=indeterminate]/checkbox:group-data-[error]/checkbox:bg-error-1",
  "group-hover/checkbox:group-data-[state=checked]/checkbox:group-data-[error]/checkbox:bg-red-1000 group-hover/checkbox:group-data-[state=indeterminate]/checkbox:group-data-[error]/checkbox:bg-red-1000",
  "group-aria-disabled/checkbox:!border-solid-gray-300 group-aria-disabled/checkbox:!bg-solid-gray-50",
  "group-data-[state=checked]/checkbox:group-aria-disabled/checkbox:!bg-solid-gray-300 group-data-[state=indeterminate]/checkbox:group-aria-disabled/checkbox:!bg-solid-gray-300",
  "forced-colors:!border-[ButtonText] group-data-[state=checked]/checkbox:forced-colors:!bg-[Highlight] group-data-[state=checked]/checkbox:forced-colors:!border-[Highlight] group-data-[state=indeterminate]/checkbox:forced-colors:!bg-[Highlight] group-data-[state=indeterminate]/checkbox:forced-colors:!border-[Highlight] group-aria-disabled/checkbox:forced-colors:!border-[GrayText] group-data-[state=checked]/checkbox:group-aria-disabled/checkbox:forced-colors:!bg-[GrayText]"
)

export type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "children"
> &
  VariantProps<typeof checkboxVariants> & {
    isError?: boolean
  }

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, size = "sm", isError, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    data-slot="checkbox"
    data-size={size}
    data-error={isError || undefined}
    className={cn(checkboxVariants({ size }), className)}
    {...props}
  >
    <span className={checkboxBoxClass}>
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        data-size={size}
        className={cn(
          "block size-3.5 bg-white",
          "data-[state=checked]:[clip-path:path('M5.6,11.2L12.65,4.15L11.25,2.75L5.6,8.4L2.75,5.55L1.35,6.95L5.6,11.2Z')]",
          "data-[state=indeterminate]:[clip-path:path('M3.25,7.75H10.75V6.25H3.25V7.75Z')]",
          "data-[size=md]:origin-top-left data-[size=md]:scale-[calc(20/14)]",
          "data-[size=lg]:origin-top-left data-[size=lg]:scale-[calc(27/14)]"
        )}
      />
    </span>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = "Checkbox"

export { Checkbox, checkboxVariants }
