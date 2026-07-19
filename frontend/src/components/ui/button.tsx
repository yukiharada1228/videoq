// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const solidStyle =
  "border-4 border-double border-transparent bg-key-900 text-white hover:bg-key-1000 hover:underline active:bg-key-1200 active:underline disabled:bg-solid-gray-300 disabled:text-solid-gray-50 aria-disabled:bg-solid-gray-300 aria-disabled:text-solid-gray-50"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap underline-offset-[calc(3/16*1rem)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300 disabled:pointer-events-none disabled:forced-colors:border-[GrayText] disabled:forced-colors:text-[GrayText] aria-disabled:pointer-events-none aria-disabled:forced-colors:border-[GrayText] aria-disabled:forced-colors:text-[GrayText]",
  {
    variants: {
      variant: {
        solid: solidStyle,
        "solid-fill": solidStyle,
        outline:
          "border border-current bg-white text-key-900 hover:bg-key-200 hover:text-key-1000 hover:underline active:bg-key-300 active:text-key-1200 active:underline disabled:bg-white disabled:text-solid-gray-300 aria-disabled:bg-white aria-disabled:text-solid-gray-300",
        text: "text-key-900 underline hover:bg-key-50 hover:text-key-1000 hover:decoration-[calc(3/16*1rem)] active:bg-key-100 active:text-key-1200 focus-visible:bg-yellow-300 disabled:bg-transparent disabled:focus-visible:bg-yellow-300 disabled:text-solid-gray-300 aria-disabled:bg-transparent aria-disabled:focus-visible:bg-yellow-300 aria-disabled:text-solid-gray-300",
      },
      size: {
        lg: "min-w-[calc(136/16*1rem)] min-h-14 rounded-8 px-4 py-3 text-oln-16B-100",
        md: "min-w-24 min-h-12 rounded-8 px-4 py-2 text-oln-16B-100",
        sm: "relative min-w-20 min-h-9 rounded-6 px-3 py-0.5 text-oln-16B-100 after:absolute after:inset-x-0 after:-inset-y-full after:m-auto after:h-[44px]",
        xs: "relative min-w-18 min-h-7 rounded-4 px-2 py-0.5 text-oln-14B-100 after:absolute after:inset-x-0 after:-inset-y-full after:m-auto after:h-[44px]",
      },
    },
    defaultVariants: {
      variant: "solid",
      size: "md",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

const isAriaDisabled = (value: unknown) => value === true || value === "true"

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    const isDisabled =
      Boolean(props.disabled) || isAriaDisabled(props["aria-disabled"])

    const handleClick = (
      event: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => {
      if (isDisabled) {
        event.preventDefault()
        return
      }
      onClick?.(event)
    }

    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        onClick={handleClick}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
export type { ButtonProps }
