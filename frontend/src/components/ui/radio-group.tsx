import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

export type RadioGroupItemSize = "lg" | "md" | "sm"

export const radioGroupItemVariants = cva(
  "group/radio inline-flex shrink-0 items-center justify-center appearance-none rounded-full bg-transparent outline-none hover:bg-solid-gray-420 focus-visible:bg-transparent aria-disabled:pointer-events-none aria-disabled:hover:bg-transparent data-[size=sm]:size-6 data-[size=md]:size-8 data-[size=lg]:size-11",
  {
    variants: {
      size: {
        lg: "",
        md: "",
        sm: "",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
)

const radioGroupItemCircleClass = cn(
  "flex items-center justify-center rounded-full border border-solid-gray-600 bg-white",
  "size-[83.333%]",
  "group-hover/radio:border-black",
  "group-focus-visible/radio:outline group-focus-visible/radio:outline-4 group-focus-visible/radio:outline-black group-focus-visible/radio:outline-offset-[calc(2/16*1rem)] group-focus-visible/radio:ring-[calc(2/16*1rem)] group-focus-visible/radio:ring-yellow-300",
  "group-data-[state=checked]/radio:border-key-900 group-hover/radio:group-data-[state=checked]/radio:border-key-1100",
  "group-data-[size=sm]/radio:border-[calc(2/16*1rem)]",
  "group-data-[size=md]/radio:border-[calc(2/16*1rem)]",
  "group-data-[size=lg]/radio:border-[calc(3/16*1rem)]",
  "group-data-[error]/radio:border-error-1 group-hover/radio:group-data-[error]/radio:border-red-1000",
  "group-data-[state=checked]/radio:group-data-[error]/radio:border-error-1",
  "group-aria-disabled/radio:!border-solid-gray-300 group-aria-disabled/radio:!bg-solid-gray-50",
  "forced-colors:!border-[ButtonText] group-data-[state=checked]/radio:forced-colors:!border-[Highlight] group-aria-disabled/radio:forced-colors:!border-[GrayText]"
)

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      ref={ref}
      data-slot="radio-group"
      className={cn("grid gap-1", className)}
      {...props}
    />
  )
})
RadioGroup.displayName = "RadioGroup"

export type RadioGroupItemProps = React.ComponentPropsWithoutRef<
  typeof RadioGroupPrimitive.Item
> &
  VariantProps<typeof radioGroupItemVariants> & {
    isError?: boolean
  }

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, isError, size = "sm", ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      data-slot="radio-group-item"
      data-size={size}
      data-error={isError || undefined}
      className={cn(radioGroupItemVariants({ size }), className)}
      {...props}
    >
      <span className={radioGroupItemCircleClass}>
        <RadioGroupPrimitive.Indicator className="size-full bg-key-900 [clip-path:circle(calc(5/16*100%))] group-data-[error]/radio:bg-error-1 group-aria-disabled/radio:!bg-solid-gray-300 forced-colors:!bg-[Highlight]" />
      </span>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
